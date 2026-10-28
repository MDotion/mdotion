import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { slugify } from '../../lib/slug';

/**
 * A top-level heading and the section it opens: everything up to the next
 * top-level heading of the same or a higher level. Headings nested in quotes
 * or callouts do not open sections.
 */
export interface OutlineItem {
  index: number;
  /** Position right before the heading node. */
  pos: number;
  /** End of the section (exclusive). */
  end: number;
  level: number;
  text: string;
  /** GitHub anchor, deduplicated like GitHub does (`intro`, `intro-1`). */
  anchor: string;
  /** Index of the enclosing section's heading, or null at the top. */
  parent: number | null;
  issues: OutlineIssue[];
}

export type OutlineIssue = 'duplicate' | 'skippedLevel' | 'empty';

export const ISSUE_MESSAGES: Record<OutlineIssue, string> = {
  duplicate: 'Another heading has the same title, so links to it can go to the wrong one.',
  skippedLevel: 'This heading skips a level (for example H1 followed by H3).',
  empty: 'This heading is empty.',
};

/** End of the document's content, before the empty paragraphs the editor keeps at the end. */
export function contentEnd(doc: PMNode): number {
  let end = doc.content.size;
  for (let i = doc.childCount - 1; i >= 0; i -= 1) {
    const child = doc.child(i);
    if (child.type.name !== 'paragraph' || child.childCount > 0) {
      break;
    }
    end -= child.nodeSize;
  }
  return end;
}

export function computeOutline(doc: PMNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        index: items.length,
        pos,
        end: 0,
        level: node.attrs.level as number,
        text: node.textContent,
        anchor: '',
        parent: null,
        issues: [],
      });
    }
  });

  const end = contentEnd(doc);
  const stack: OutlineItem[] = [];
  const slugs = new Map<string, number>();
  items.forEach((item, i) => {
    let next = i + 1;
    while (next < items.length && items[next].level > item.level) {
      next += 1;
    }
    item.end = next < items.length ? items[next].pos : Math.max(end, item.pos + doc.nodeAt(item.pos)!.nodeSize);

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    item.parent = stack.length > 0 ? stack[stack.length - 1].index : null;
    stack.push(item);

    const slug = slugify(item.text);
    const seen = slugs.get(slug) ?? 0;
    item.anchor = seen === 0 ? slug : `${slug}-${seen}`;
    slugs.set(slug, seen + 1);

    if (item.text.trim() === '') {
      item.issues.push('empty');
    }
    const previous = items[i - 1];
    if (previous && item.level > previous.level + 1) {
      item.issues.push('skippedLevel');
    }
  });
  items.forEach((item) => {
    if (item.text.trim() !== '' && (slugs.get(slugify(item.text)) ?? 0) > 1) {
      item.issues.push('duplicate');
    }
  });
  return items;
}

/** True when `index` is inside the section of `ancestor` (or is it). */
export function isWithin(items: OutlineItem[], index: number, ancestor: number): boolean {
  for (let current: number | null = index; current !== null; current = items[current].parent) {
    if (current === ancestor) {
      return true;
    }
  }
  return false;
}

export function previousSibling(items: OutlineItem[], index: number): number | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (items[i].parent === items[index].parent) {
      return i;
    }
    if (i === items[index].parent) {
      return null;
    }
  }
  return null;
}

export function nextSibling(items: OutlineItem[], index: number): number | null {
  for (let i = index + 1; i < items.length; i += 1) {
    if (items[i].parent === items[index].parent) {
      return i;
    }
    if (!isWithin(items, i, index)) {
      return null;
    }
  }
  return null;
}

/**
 * Moves the section of heading `index` (heading, content, subsections) to
 * `target`, a section boundary. One transaction, so one undo step; the moved
 * blocks keep their source text (only the blank lines around them change).
 */
export function moveSection(state: EditorState, items: OutlineItem[], index: number, target: number): Transaction | null {
  const { pos: from, end: to } = items[index];
  if (target >= from && target <= to) {
    return null;
  }
  const content = state.doc.slice(from, to).content;
  const tr = state.tr;
  let headingPos: number;
  if (target > to) {
    tr.insert(target, content);
    tr.delete(from, to);
    headingPos = target - (to - from);
  } else {
    tr.delete(from, to);
    tr.insert(target, content);
    headingPos = target;
  }
  return tr.setSelection(TextSelection.create(tr.doc, headingPos + 1)).scrollIntoView();
}

export function moveSectionUp(state: EditorState, items: OutlineItem[], index: number): Transaction | null {
  const previous = previousSibling(items, index);
  return previous === null ? null : moveSection(state, items, index, items[previous].pos);
}

export function moveSectionDown(state: EditorState, items: OutlineItem[], index: number): Transaction | null {
  const next = nextSibling(items, index);
  return next === null ? null : moveSection(state, items, index, items[next].end);
}

/** The outline item whose heading is the top-level node at `pos`. */
export function itemAt(items: OutlineItem[], pos: number): OutlineItem | undefined {
  return items.find((item) => item.pos === pos);
}
