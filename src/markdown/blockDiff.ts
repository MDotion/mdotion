import { diffArrays, diffWordsWithSpace } from 'diff';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { MarkdownAdapter, SourceMap } from './MarkdownAdapter';

/** A top-level block of one side of the comparison. */
export interface DiffBlock {
  node: PMNode;
  /** Its Markdown source: the original text when known, the serialized node otherwise. */
  key: string;
  /** Index among the top-level children of its document. */
  index: number;
  /** Position right before the node in its document. */
  pos: number;
}

/**
 * One entry of the merged sequence, in reading order. `movedTo` / `movedFrom`
 * point to the partner entry (its index in the array) when a block was moved.
 */
export type BlockChange =
  | { kind: 'unchanged'; base: DiffBlock; current: DiffBlock; formatting: boolean }
  | { kind: 'modified'; base: DiffBlock; current: DiffBlock }
  | { kind: 'added'; current: DiffBlock; movedFrom: number | null }
  | { kind: 'removed'; base: DiffBlock; movedTo: number | null };

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  /** Moved blocks (each counted once, not as removed + added). */
  moved: number;
}

/** Minimum share of common words for a removed and an added block to be shown as one modified block. */
const SIMILARITY_THRESHOLD = 0.5;

/** Top-level blocks of a document, without the empty paragraphs that only stand for blank lines. */
export function blocksOf(doc: PMNode, map: SourceMap | null, adapter: MarkdownAdapter): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  doc.forEach((node, pos, index) => {
    if (node.type.name === 'paragraph' && node.childCount === 0) {
      return;
    }
    const origin = map?.originOf(node);
    const key = origin?.kind === 'seg' && origin.of === 1 ? map!.segments[origin.index].raw : adapter.serializeNode(node);
    blocks.push({ node, key, index, pos });
  });
  return blocks;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Dice coefficient on the words of two texts (1 = same words). */
export function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.length === 0 && right.length === 0) {
    return a.trim() === b.trim() ? 1 : 0;
  }
  const counts = new Map<string, number>();
  left.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  let common = 0;
  for (const word of right) {
    const count = counts.get(word) ?? 0;
    if (count > 0) {
      common += 1;
      counts.set(word, count - 1);
    }
  }
  return (2 * common) / (left.length + right.length);
}

/** Text of a block with its textblocks (list items, cells) kept apart. */
function plainText(node: PMNode): string {
  return node.textBetween(0, node.content.size, '\n', ' ');
}

/** Blocks compared child by child: list items, table rows. */
export const ROW_CONTAINERS = new Set(['bulletList', 'orderedList', 'taskList', 'table']);

function columnCount(table: PMNode): number {
  return table.firstChild?.childCount ?? 0;
}

function hasCommonChild(base: PMNode, current: PMNode): boolean {
  const children = new Set<string>();
  base.forEach((child) => children.add(JSON.stringify(child.toJSON())));
  let common = false;
  current.forEach((child) => {
    common ||= children.has(JSON.stringify(child.toJSON()));
  });
  return common;
}

/** Whether `current` can be shown as an edit of `base` (changes inside one block). */
function isEditOf(base: PMNode, current: PMNode): boolean {
  if (base.type !== current.type || base.isAtom) {
    // A block turned into another type keeps its text: still the same block.
    return !base.isAtom && !current.isAtom && base.textContent.trim() !== '' && plainText(base) === plainText(current);
  }
  if (base.type.name === 'table' && columnCount(base) !== columnCount(current)) {
    return false;
  }
  // A list or a table that kept some of its items or rows is the same one, with items added or removed.
  if (ROW_CONTAINERS.has(base.type.name) && hasCommonChild(base, current)) {
    return true;
  }
  return similarity(plainText(base), plainText(current)) >= SIMILARITY_THRESHOLD;
}

type Pair = { base: number; current: number; formatting: boolean };

/** Pairs removed and added blocks of one hunk, keeping their order. */
function pairHunk(removed: DiffBlock[], added: DiffBlock[]): Pair[] {
  const pairs: Pair[] = [];
  let nextAdded = 0;
  removed.forEach((block, r) => {
    for (let a = nextAdded; a < added.length; a += 1) {
      const candidate = added[a].node;
      if (block.node.eq(candidate)) {
        pairs.push({ base: r, current: a, formatting: true });
        nextAdded = a + 1;
        return;
      }
      if (isEditOf(block.node, candidate)) {
        pairs.push({ base: r, current: a, formatting: false });
        nextAdded = a + 1;
        return;
      }
    }
  });
  return pairs;
}

/**
 * Compares two versions of a document block by block. Blocks with the same source
 * are unchanged; in between, a block whose content is equal (only its Markdown
 * formatting changed) is unchanged too, a similar block of the same type is
 * modified, and the rest is removed or added. A removed block that reappears
 * elsewhere with the same source is linked as moved.
 */
export function diffBlocks(base: DiffBlock[], current: DiffBlock[]): BlockChange[] {
  const changes: BlockChange[] = [];
  let b = 0;
  let c = 0;
  let removed: DiffBlock[] = [];
  let added: DiffBlock[] = [];

  const flushHunk = () => {
    const pairs = pairHunk(removed, added);
    let r = 0;
    let a = 0;
    for (const pair of pairs) {
      for (; r < pair.base; r += 1) {
        changes.push({ kind: 'removed', base: removed[r], movedTo: null });
      }
      for (; a < pair.current; a += 1) {
        changes.push({ kind: 'added', current: added[a], movedFrom: null });
      }
      const baseBlock = removed[r];
      const currentBlock = added[a];
      changes.push(
        pair.formatting
          ? { kind: 'unchanged', base: baseBlock, current: currentBlock, formatting: true }
          : { kind: 'modified', base: baseBlock, current: currentBlock },
      );
      r += 1;
      a += 1;
    }
    for (; r < removed.length; r += 1) {
      changes.push({ kind: 'removed', base: removed[r], movedTo: null });
    }
    for (; a < added.length; a += 1) {
      changes.push({ kind: 'added', current: added[a], movedFrom: null });
    }
    removed = [];
    added = [];
  };

  for (const part of diffArrays(
    base.map((block) => block.key),
    current.map((block) => block.key),
  )) {
    const count = part.count ?? part.value.length;
    if (part.removed) {
      removed.push(...base.slice(b, b + count));
      b += count;
    } else if (part.added) {
      added.push(...current.slice(c, c + count));
      c += count;
    } else {
      flushHunk();
      for (let i = 0; i < count; i += 1) {
        changes.push({ kind: 'unchanged', base: base[b + i], current: current[c + i], formatting: false });
      }
      b += count;
      c += count;
    }
  }
  flushHunk();
  linkMoves(changes);
  return changes;
}

function linkMoves(changes: BlockChange[]): void {
  const addedByKey = new Map<string, number[]>();
  changes.forEach((change, index) => {
    if (change.kind === 'added' && change.current.key.trim() !== '') {
      const list = addedByKey.get(change.current.key) ?? [];
      list.push(index);
      addedByKey.set(change.current.key, list);
    }
  });
  changes.forEach((change, index) => {
    if (change.kind !== 'removed') {
      return;
    }
    const partner = addedByKey.get(change.base.key)?.shift();
    if (partner !== undefined) {
      change.movedTo = partner;
      (changes[partner] as Extract<BlockChange, { kind: 'added' }>).movedFrom = index;
    }
  });
}

export function summarize(changes: BlockChange[]): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, moved: 0 };
  for (const change of changes) {
    if (change.kind === 'modified') {
      summary.modified += 1;
    } else if (change.kind === 'added') {
      if (change.movedFrom === null) {
        summary.added += 1;
      } else {
        summary.moved += 1;
      }
    } else if (change.kind === 'removed' && change.movedTo === null) {
      summary.removed += 1;
    }
  }
  return summary;
}

export function totalChanges(summary: DiffSummary): number {
  return summary.added + summary.removed + summary.modified + summary.moved;
}

/** Text of a block with the position of every character (-1 for the breaks between textblocks). */
function flatten(node: PMNode): { text: string; positions: number[] } {
  let text = '';
  const positions: number[] = [];
  const addInline = (child: PMNode, pos: number) => {
    if (child.isText) {
      const value = child.text ?? '';
      for (let i = 0; i < value.length; i += 1) {
        positions.push(pos + i);
      }
      text += value;
    } else {
      // Line breaks, images, inline HTML: a boundary words do not cross.
      text += '\n';
      positions.push(-1);
    }
  };
  if (node.isTextblock) {
    node.forEach((child, offset) => addInline(child, offset));
    return { text, positions };
  }
  node.descendants((child, pos) => {
    if (child.isTextblock) {
      if (positions.length > 0) {
        text += '\n';
        positions.push(-1);
      }
      child.forEach((inline, offset) => addInline(inline, pos + 1 + offset));
      return false;
    }
    return true;
  });
  return { text, positions };
}

export interface InlineChanges {
  /** Inserted text, as ranges relative to the start of the current node's content. */
  inserted: { from: number; to: number }[];
  /** Deleted text, shown at a position relative to the start of the current node's content. */
  deleted: { at: number; text: string }[];
}

/**
 * Word-level changes between two versions of a block, located in the current one.
 * Null when the comparison is too expensive (very different long blocks).
 */
export function inlineChanges(base: PMNode, current: PMNode): InlineChanges | null {
  const before = flatten(base);
  const after = flatten(current);
  const parts = diffWordsWithSpace(before.text, after.text, { timeout: 50 });
  if (!parts) {
    return null;
  }
  const result: InlineChanges = { inserted: [], deleted: [] };
  const end = current.content.size;
  let cursor = 0;
  for (const part of parts) {
    if (part.added) {
      let from: number | null = null;
      let last = -1;
      // Spaces around the inserted words are not worth highlighting.
      const start = cursor + (part.value.length - part.value.trimStart().length);
      const stop = cursor + part.value.trimEnd().length;
      for (let i = start; i < stop; i += 1) {
        const pos = after.positions[i];
        if (pos === -1 || (last !== -1 && pos !== last + 1)) {
          if (from !== null) {
            result.inserted.push({ from, to: last + 1 });
          }
          from = pos === -1 ? null : pos;
        } else if (from === null) {
          from = pos;
        }
        last = pos;
      }
      if (from !== null && last !== -1) {
        result.inserted.push({ from, to: last + 1 });
      }
      cursor += part.value.length;
    } else if (part.removed) {
      const text = part.value.replace(/\n/g, ' ');
      if (text.trim() !== '') {
        result.deleted.push({ at: locate(after.positions, cursor, end), text });
      }
    } else {
      cursor += part.value.length;
    }
  }
  return result;
}

/** Where text deleted before character `index` of the current text is shown: after the character before it. */
function locate(positions: number[], index: number, end: number): number {
  const previous = positions[index - 1];
  if (previous !== undefined && previous !== -1) {
    return previous + 1;
  }
  const next = positions.slice(index).find((pos) => pos !== -1);
  return next ?? end;
}
