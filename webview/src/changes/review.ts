import { Extension, type Extensions, type JSONContent } from '@tiptap/core';
import { diffArrays } from 'diff';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { inlineChanges, ROW_CONTAINERS, type BlockChange } from '../../../src/markdown/blockDiff';
import { getMdotionExtensions } from '../../../src/markdown/mdotionExtensions';
import { CalloutView } from '../nodeviews/CalloutView';
import { CodeBlockView } from '../nodeviews/CodeBlockView';
import { htmlInlineView } from '../nodeviews/htmlInlineView';
import { ImageView } from '../nodeviews/ImageView';
import { RawBlockView } from '../nodeviews/RawBlockView';

export const reviewKey = new PluginKey<DecorationSet>('mdotionReview');

const ReviewDecorations = Extension.create({
  name: 'mdotionReviewDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: reviewKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => (tr.getMeta(reviewKey) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => reviewKey.getState(state) },
      }),
    ];
  },
});

/**
 * Extensions of the read-only Rendered diff: the document schema and its node
 * views, without anything that edits (ADR-010). Column widths are not shown.
 */
export function createReviewExtensions(): Extensions {
  return [
    ...getMdotionExtensions({
      codeBlock: ReactNodeViewRenderer(CodeBlockView),
      image: ReactNodeViewRenderer(ImageView),
      callout: ReactNodeViewRenderer(CalloutView),
      rawBlock: ReactNodeViewRenderer(RawBlockView),
      htmlInline: htmlInlineView,
    }),
    ReviewDecorations,
  ];
}

export type Side = 'context' | 'add' | 'del';

interface Part {
  node: PMNode;
  side: Side;
  /** Changed text, as ranges relative to the start of the node's content. */
  words: { from: number; to: number }[];
}

/** A top-level block of the Rendered diff. List items and table rows are diffed one by one (`children`). */
export interface ReviewEntry extends Part {
  children: Part[] | null;
  /** Position of the block in the editor document, to go back to editing it. */
  locate: number | null;
}

/** The old version (red) and the new one (green) of a changed block, with the changed words marked in each. */
function replacement(base: PMNode, current: PMNode): [Part, Part] {
  return [
    { node: base, side: 'del', words: inlineChanges(current, base)?.inserted ?? [] },
    { node: current, side: 'add', words: inlineChanges(base, current)?.inserted ?? [] },
  ];
}

const keyOf = (node: PMNode) => JSON.stringify(node.toJSON());

/** List items or table rows of both versions, in order, each marked like a line of a Git diff. */
function mergeChildren(base: PMNode, current: PMNode): Part[] {
  const before = base.content.content;
  const after = current.content.content;
  const parts: Part[] = [];
  let b = 0;
  let c = 0;
  let removed: PMNode[] = [];
  let added: PMNode[] = [];
  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    // Changed items one after the other, like replaced lines: old, then new.
    for (let i = 0; i < pairs; i += 1) {
      parts.push(...replacement(removed[i], added[i]));
    }
    removed.slice(pairs).forEach((node) => parts.push({ node, side: 'del', words: [] }));
    added.slice(pairs).forEach((node) => parts.push({ node, side: 'add', words: [] }));
    removed = [];
    added = [];
  };
  for (const part of diffArrays(before.map(keyOf), after.map(keyOf))) {
    const count = part.count ?? part.value.length;
    if (part.removed) {
      removed.push(...before.slice(b, b + count));
      b += count;
    } else if (part.added) {
      added.push(...after.slice(c, c + count));
      c += count;
    } else {
      flush();
      after.slice(c, c + count).forEach((node) => parts.push({ node, side: 'context', words: [] }));
      b += count;
      c += count;
    }
  }
  flush();
  return parts;
}

/** The blocks of the Rendered diff in reading order: removed blocks where they were, changed ones old then new. */
export function reviewEntries(changes: BlockChange[]): ReviewEntry[] {
  const entries: ReviewEntry[] = [];
  for (const change of changes) {
    if (change.kind === 'unchanged') {
      entries.push({ node: change.current.node, side: 'context', words: [], children: null, locate: change.current.pos });
    } else if (change.kind === 'added') {
      entries.push({ node: change.current.node, side: 'add', words: [], children: null, locate: change.current.pos });
    } else if (change.kind === 'removed') {
      entries.push({ node: change.base.node, side: 'del', words: [], children: null, locate: null });
    } else if (ROW_CONTAINERS.has(change.current.node.type.name) && change.base.node.type === change.current.node.type) {
      const children = mergeChildren(change.base.node, change.current.node);
      const node = change.current.node.type.create(change.current.node.attrs, children.map((child) => child.node));
      entries.push({ node, side: 'context', words: [], children, locate: change.current.pos });
    } else {
      const [before, after] = replacement(change.base.node, change.current.node);
      entries.push({ ...before, children: null, locate: null }, { ...after, children: null, locate: change.current.pos });
    }
  }
  return entries;
}

export function reviewContent(entries: ReviewEntry[]): JSONContent {
  return { type: 'doc', content: entries.length > 0 ? entries.map((entry) => entry.node.toJSON() as JSONContent) : [{ type: 'paragraph' }] };
}

function isChanged(entry: ReviewEntry): boolean {
  return entry.side !== 'context' || (entry.children?.some((child) => child.side !== 'context') ?? false);
}

/** Consecutive changed blocks, navigated as one change: [first, last] entry indices. */
export function hunksOf(entries: ReviewEntry[]): [number, number][] {
  const hunks: [number, number][] = [];
  entries.forEach((entry, index) => {
    if (!isChanged(entry)) {
      return;
    }
    const last = hunks[hunks.length - 1];
    if (last && last[1] === index - 1) {
      last[1] = index;
    } else {
      hunks.push([index, index]);
    }
  });
  return hunks;
}

function decorate(decorations: Decoration[], part: Part, pos: number, extra: Record<string, string> = {}): void {
  const classes = part.side === 'context' ? [] : ['mdotion-rdiff', `is-${part.side}`];
  if (classes.length > 0 || Object.keys(extra).length > 0) {
    decorations.push(Decoration.node(pos, pos + part.node.nodeSize, { ...extra, class: [...classes, extra.class ?? ''].join(' ').trim() }));
  }
  const start = pos + 1;
  for (const range of part.words) {
    decorations.push(Decoration.inline(start + range.from, start + range.to, { class: 'mdotion-rdiff-word' }));
  }
}

/** Git colours of the Rendered diff: red and green rows, darker on the words that changed. */
export function reviewDecorations(doc: PMNode, entries: ReviewEntry[], currentHunk: number | null): DecorationSet {
  if (entries.length === 0) {
    return DecorationSet.empty;
  }
  const hunkOf = new Map<number, number>();
  hunksOf(entries).forEach(([from, to], hunk) => {
    for (let i = from; i <= to; i += 1) {
      hunkOf.set(i, hunk);
    }
  });
  const decorations: Decoration[] = [];
  doc.forEach((node, pos, index) => {
    const entry = entries[index];
    if (!entry) {
      return;
    }
    const hunk = hunkOf.get(index);
    const extra: Record<string, string> = { 'data-entry': String(index) };
    if (hunk !== undefined) {
      extra['data-hunk'] = String(hunk);
      if (hunk === currentHunk) {
        extra.class = 'is-current';
      }
    }
    decorate(decorations, { ...entry, node }, pos, extra);
    if (entry.children) {
      node.forEach((child, offset, childIndex) => {
        const part = entry.children![childIndex];
        if (part) {
          decorate(decorations, { ...part, node: child }, pos + 1 + offset);
        }
      });
    }
  });
  return DecorationSet.create(doc, decorations);
}
