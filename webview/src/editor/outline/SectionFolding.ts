import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { viewState } from '../../lib/viewState';
import { computeOutline, type OutlineItem } from './sections';

/**
 * Folded sections: a view-only state (the document never changes, ADR-009).
 * Folded headings are tracked by position, mapped through every change, and
 * saved by anchor in the view state so they stay folded when the file reopens.
 */

interface FoldState {
  /** Positions of folded top-level headings, ascending. */
  folded: number[];
  items: OutlineItem[];
  decorations: DecorationSet;
}

type FoldMeta = { toggle: number } | { set: number[] };

export const foldingKey = new PluginKey<FoldState>('mdotionSectionFolding');

/** Top-level ranges hidden by folded sections, each as [from, to). */
export function hiddenRanges(state: EditorState): { heading: number; from: number; to: number }[] {
  const fold = foldingKey.getState(state);
  if (!fold) {
    return [];
  }
  const ranges: { heading: number; from: number; to: number }[] = [];
  for (const pos of fold.folded) {
    const item = fold.items.find((candidate) => candidate.pos === pos);
    const heading = state.doc.nodeAt(pos);
    if (!item || !heading) {
      continue;
    }
    const from = pos + heading.nodeSize;
    if (from < item.end && !ranges.some((range) => from >= range.from && from < range.to)) {
      ranges.push({ heading: pos, from, to: item.end });
    }
  }
  return ranges;
}

export function foldedPositions(state: EditorState): number[] {
  return foldingKey.getState(state)?.folded ?? [];
}

export function isFolded(state: EditorState, pos: number): boolean {
  return foldedPositions(state).includes(pos);
}

export function toggleFold(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setMeta(foldingKey, { toggle: pos } satisfies FoldMeta));
}

export function setFolded(view: EditorView, positions: number[]): void {
  view.dispatch(view.state.tr.setMeta(foldingKey, { set: positions } satisfies FoldMeta));
}

/** Unfolds every section that hides `pos` (before jumping to it). */
export function revealPosition(view: EditorView, pos: number): void {
  const hiding = hiddenRanges(view.state).filter((range) => pos >= range.from && pos < range.to);
  if (hiding.length > 0) {
    const keep = foldedPositions(view.state).filter((folded) => !hiding.some((range) => range.heading === folded));
    setFolded(view, keep);
  }
}

function countBlocks(doc: PMNode, from: number, to: number): number {
  let count = 0;
  doc.nodesBetween(from, to, (_node, pos) => {
    if (pos >= from) {
      count += 1;
    }
    return false;
  });
  return count;
}

function buildDecorations(state: EditorState, folded: number[], items: OutlineItem[]): DecorationSet {
  const decorations: Decoration[] = [];
  for (const pos of folded) {
    const heading = state.doc.nodeAt(pos);
    const item = items.find((candidate) => candidate.pos === pos);
    if (!heading || !item) {
      continue;
    }
    const from = pos + heading.nodeSize;
    decorations.push(Decoration.node(pos, from, { class: 'mdotion-folded-heading' }));
    const hidden = countBlocks(state.doc, from, item.end);
    if (hidden === 0) {
      continue;
    }
    decorations.push(
      Decoration.widget(
        from - 1,
        (view) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'mdotion-fold-pill';
          button.contentEditable = 'false';
          button.textContent = `${hidden} ${hidden === 1 ? 'block' : 'blocks'}`;
          button.title = 'Show the content of this section';
          button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleFold(view, pos);
          });
          return button;
        },
        { side: 1, ignoreSelection: true, key: `fold-${pos}-${hidden}` },
      ),
    );
    state.doc.nodesBetween(from, item.end, (node, nodePos) => {
      if (nodePos >= from) {
        decorations.push(Decoration.node(nodePos, nodePos + node.nodeSize, { class: 'mdotion-folded-hidden' }));
      }
      return false;
    });
  }
  return DecorationSet.create(state.doc, decorations);
}

function normalize(doc: PMNode, items: OutlineItem[], positions: number[]): number[] {
  const valid = new Set(items.map((item) => item.pos));
  return [...new Set(positions)].filter((pos) => valid.has(pos) && doc.nodeAt(pos)?.type.name === 'heading').sort((a, b) => a - b);
}

function anchorsOf(items: OutlineItem[], positions: number[]): string[] {
  return positions.map((pos) => items.find((item) => item.pos === pos)?.anchor).filter((anchor): anchor is string => !!anchor);
}

/** Keeps the caret out of hidden content: it jumps over a folded section in the direction it moved. */
function keepCaretVisible(oldState: EditorState, state: EditorState): Transaction | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }
  const head = selection.head;
  const range = hiddenRanges(state).find((candidate) => head > candidate.from && head < candidate.to);
  if (!range) {
    return null;
  }
  const forward = head >= oldState.selection.head;
  const target = forward
    ? Selection.near(state.doc.resolve(Math.min(range.to, state.doc.content.size)), 1)
    : Selection.near(state.doc.resolve(range.from - 1), -1);
  return state.tr.setSelection(target);
}

export const SectionFolding = Extension.create({
  name: 'mdotionSectionFolding',

  addProseMirrorPlugins() {
    return [
      new Plugin<FoldState>({
        key: foldingKey,
        state: {
          init: (_config, state) => {
            const items = computeOutline(state.doc);
            return { folded: [], items, decorations: DecorationSet.empty };
          },
          apply: (tr, previous, _oldState, newState) => {
            const meta = tr.getMeta(foldingKey) as FoldMeta | undefined;
            if (!tr.docChanged && !meta) {
              return previous;
            }
            const items = tr.docChanged ? computeOutline(newState.doc) : previous.items;
            let folded = previous.folded
              .map((pos) => tr.mapping.mapResult(pos, 1))
              .filter((result) => !result.deleted)
              .map((result) => result.pos);
            if (meta && 'toggle' in meta) {
              folded = folded.includes(meta.toggle) ? folded.filter((pos) => pos !== meta.toggle) : [...folded, meta.toggle];
            } else if (meta && 'set' in meta) {
              folded = meta.set;
            }
            folded = normalize(newState.doc, items, folded);
            if (folded.length === 0 && previous.folded.length === 0) {
              return { folded, items, decorations: DecorationSet.empty };
            }
            return { folded, items, decorations: buildDecorations(newState, folded, items) };
          },
        },
        props: {
          decorations: (state) => foldingKey.getState(state)?.decorations,
        },
        appendTransaction: (transactions, oldState, state) =>
          transactions.some((tr) => tr.selectionSet || tr.docChanged) ? keepCaretVisible(oldState, state) : null,
        view: (view) => {
          let saved = JSON.stringify(viewState.get('folded'));
          const restore = () => {
            const anchors = new Set(viewState.get('folded'));
            const items = computeOutline(view.state.doc);
            setFolded(view, items.filter((item) => anchors.has(item.anchor)).map((item) => item.pos));
            saved = JSON.stringify(viewState.get('folded'));
          };
          const unsubscribe = viewState.onLoad(restore);
          return {
            update: (current) => {
              const fold = foldingKey.getState(current.state);
              if (!fold) {
                return;
              }
              const anchors = anchorsOf(fold.items, fold.folded);
              const serialized = JSON.stringify(anchors);
              if (serialized !== saved) {
                saved = serialized;
                viewState.set('folded', anchors);
              }
            },
            destroy: unsubscribe,
          };
        },
      }),
    ];
  },
});
