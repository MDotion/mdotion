import { Extension } from '@tiptap/core';
import { Slice, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { Mappable } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { slashPluginKey } from './slash/SlashCommandExtension';

/** Nodes whose children are selectable blocks (Notion: every list item is a block). */
const CONTAINERS = new Set(['doc', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'callout']);

/** Transaction meta: keep a multi-block text selection as text (used by commands). */
export const KEEP_TEXT_SELECTION = 'mdotionKeepTextSelection';

/**
 * Notion block selection: a run of whole sibling blocks, highlighted as blocks
 * instead of as text. `anchor` and `head` sit on block boundaries.
 */
export class BlockSelection extends Selection {
  static create(doc: PMNode, anchor: number, head: number): BlockSelection {
    return new BlockSelection(doc.resolve(anchor), doc.resolve(head));
  }

  /** A block selection when `anchor`/`head` bound sibling blocks, otherwise the closest text selection. */
  static safe(doc: PMNode, anchor: number, head: number): Selection {
    const $anchor = doc.resolve(anchor);
    const $head = doc.resolve(head);
    if (anchor === head) {
      return Selection.near($anchor);
    }
    if ($anchor.sameParent($head) && !$anchor.parent.inlineContent) {
      return new BlockSelection($anchor, $head);
    }
    return TextSelection.between($anchor, $head);
  }

  /** The blocks covered by the selection, with their positions. */
  blocks(): { node: PMNode; pos: number }[] {
    const blocks: { node: PMNode; pos: number }[] = [];
    const parent = this.$from.parent;
    let pos = this.from;
    for (let index = this.$from.index(); pos < this.to && index < parent.childCount; index += 1) {
      const node = parent.child(index);
      blocks.push({ node, pos });
      pos += node.nodeSize;
    }
    return blocks;
  }

  map(doc: PMNode, mapping: Mappable): Selection {
    return BlockSelection.safe(doc, mapping.map(this.anchor), mapping.map(this.head));
  }

  eq(other: Selection): boolean {
    return other instanceof BlockSelection && other.anchor === this.anchor && other.head === this.head;
  }

  /** Deleting whole blocks: `deleteRange` also removes containers left empty (e.g. a list). */
  replace(tr: Transaction, content: Slice = Slice.empty): void {
    if (content.size > 0) {
      super.replace(tr, content);
      return;
    }
    const start = tr.mapping.map(this.from);
    tr.deleteRange(start, tr.mapping.map(this.to));
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(start, tr.doc.content.size))));
  }

  toJSON(): { type: string; anchor: number; head: number } {
    return { type: 'mdotionBlock', anchor: this.anchor, head: this.head };
  }

  static fromJSON(doc: PMNode, json: { anchor: number; head: number }): Selection {
    return BlockSelection.safe(doc, json.anchor, json.head);
  }

  getBookmark(): BlockBookmark {
    return new BlockBookmark(this.anchor, this.head);
  }
}

(BlockSelection.prototype as { visible: boolean }).visible = false;
Selection.jsonID('mdotionBlock', BlockSelection);

class BlockBookmark {
  constructor(
    private readonly anchor: number,
    private readonly head: number,
  ) {}

  map(mapping: Mappable): BlockBookmark {
    return new BlockBookmark(mapping.map(this.anchor), mapping.map(this.head));
  }

  resolve(doc: PMNode): Selection {
    return BlockSelection.safe(doc, this.anchor, this.head);
  }
}

/**
 * Block boundaries covering a text range that spans more than one block, at
 * the deepest container both ends share. Null when the range stays inside one
 * textblock (a normal text selection).
 */
export function blockRangeFor(doc: PMNode, anchor: number, head: number): { anchor: number; head: number } | null {
  const $anchor = doc.resolve(anchor);
  const $head = doc.resolve(head);
  if ($anchor.sameParent($head) && $anchor.parent.inlineContent) {
    return null;
  }
  let depth = $anchor.sharedDepth(head);
  while (depth > 0 && !CONTAINERS.has($anchor.node(depth).type.name)) {
    depth -= 1;
  }
  const forward = anchor <= head;
  const [$min, $max] = forward ? [$anchor, $head] : [$head, $anchor];
  const from = $min.depth > depth ? $min.before(depth + 1) : $min.pos;
  const to = $max.depth > depth ? $max.after(depth + 1) : $max.pos;
  if (from >= to) {
    return null;
  }
  return forward ? { anchor: from, head: to } : { anchor: to, head: from };
}

/** The selectable block containing `$pos`: the innermost child of a container. */
export function blockAround($pos: ResolvedPos): { from: number; to: number } | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (CONTAINERS.has($pos.node(depth - 1).type.name)) {
      return { from: $pos.before(depth), to: $pos.after(depth) };
    }
  }
  const node = $pos.nodeAfter;
  return node ? { from: $pos.pos, to: $pos.pos + node.nodeSize } : null;
}

/** Selects every top-level block. */
export function selectAllBlocks(state: EditorState): Transaction {
  return state.tr.setSelection(BlockSelection.create(state.doc, 0, state.doc.content.size));
}

/** Re-selects blocks by sibling index, keeping the anchor block fixed (Shift+↑/↓). */
function selectByIndex(state: EditorState, selection: BlockSelection, anchorIndex: number, headIndex: number): Transaction {
  const parent = selection.$from.parent;
  const start = selection.$from.start();
  const posOf = (index: number) => {
    let pos = start;
    for (let i = 0; i < index; i += 1) {
      pos += parent.child(i).nodeSize;
    }
    return pos;
  };
  const lo = Math.min(anchorIndex, headIndex);
  const hi = Math.max(anchorIndex, headIndex);
  const from = posOf(lo);
  const to = posOf(hi) + parent.child(hi).nodeSize;
  const next = anchorIndex <= headIndex ? BlockSelection.create(state.doc, from, to) : BlockSelection.create(state.doc, to, from);
  return state.tr.setSelection(next).scrollIntoView();
}

function indices(selection: BlockSelection): { anchor: number; head: number; count: number } {
  const first = selection.$from.index();
  const last = selection.$to.index() - 1;
  const forward = selection.anchor <= selection.head;
  return {
    anchor: forward ? first : last,
    head: forward ? last : first,
    count: selection.$from.parent.childCount,
  };
}

function handleBlockKeys(view: EditorView, event: KeyboardEvent, selection: BlockSelection): boolean {
  const { state } = view;
  const mod = event.metaKey || event.ctrlKey;
  const { anchor, head, count } = indices(selection);

  switch (event.key) {
    case 'Escape':
    case 'Enter': {
      // Enter edits the last selected block; Escape just leaves block mode.
      view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(selection.to), -1)));
      return true;
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      if (mod) {
        return false; // Cmd+Shift+↑/↓ moves blocks (NotionKeymap)
      }
      const step = event.key === 'ArrowUp' ? -1 : 1;
      if (event.shiftKey) {
        view.dispatch(selectByIndex(state, selection, anchor, Math.min(Math.max(head + step, 0), count - 1)));
      } else {
        const target = step < 0 ? Math.max(Math.min(anchor, head) - 1, 0) : Math.min(Math.max(anchor, head) + 1, count - 1);
        view.dispatch(selectByIndex(state, selection, target, target));
      }
      return true;
    }
    case 'Backspace':
    case 'Delete':
      view.dispatch(state.tr.deleteSelection().scrollIntoView());
      return true;
    case 'Tab':
      return true;
    default:
      // Typing over a block selection does nothing (as in Notion) instead of wiping the blocks.
      return !mod && !event.altKey && event.key.length === 1;
  }
}

/**
 * Notion block selection:
 * - dragging text across blocks selects whole blocks (on mouse up);
 * - Shift+↑/↓ past a block edge, Esc, Cmd+A (twice) select blocks;
 * - selected blocks are highlighted, copied as Markdown, deleted, moved, duplicated together.
 */
export const BlockSelectionExtension = Extension.create({
  name: 'blockSelection',
  priority: 1000,

  addProseMirrorPlugins() {
    let mouseDown = false;
    const key = new PluginKey('mdotionBlockSelection');

    /** Blocks to highlight: the block selection, or the blocks a text drag currently spans. */
    const highlightRange = (state: EditorState): { from: number; to: number } | null => {
      const { selection } = state;
      if (selection instanceof BlockSelection) {
        return { from: selection.from, to: selection.to };
      }
      if (mouseDown && selection instanceof TextSelection && !selection.empty) {
        const range = blockRangeFor(state.doc, selection.anchor, selection.head);
        return range ? { from: Math.min(range.anchor, range.head), to: Math.max(range.anchor, range.head) } : null;
      }
      return null;
    };

    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const range = highlightRange(state);
            if (!range) {
              return null;
            }
            const selection = BlockSelection.create(state.doc, range.from, range.to);
            return DecorationSet.create(
              state.doc,
              selection.blocks().map(({ node, pos }) =>
                Decoration.node(pos, pos + node.nodeSize, { class: 'mdotion-block-selected' }),
              ),
            );
          },
          attributes(state): Record<string, string> {
            return highlightRange(state) ? { class: 'mdotion-has-block-selection' } : {};
          },
          handleKeyDown(view, event) {
            const { selection } = view.state;
            if (selection instanceof BlockSelection) {
              return handleBlockKeys(view, event, selection);
            }
            const mod = event.metaKey || event.ctrlKey;
            if (event.key === 'Escape' && !mod && !slashPluginKey.getState(view.state)?.active) {
              const block = blockAround(selection.$from);
              if (block) {
                view.dispatch(view.state.tr.setSelection(BlockSelection.create(view.state.doc, block.from, block.to)));
                return true;
              }
            }
            if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
              const { $from, $to } = selection;
              const inOneBlock = $from.sameParent($to) && $from.parent.isTextblock;
              const coversBlock = inOneBlock && $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size;
              if (inOneBlock && !coversBlock && $from.parent.content.size > 0) {
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.start(), $from.end())));
              } else {
                view.dispatch(selectAllBlocks(view.state));
              }
              return true;
            }
            return false;
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          const { selection } = newState;
          if (
            mouseDown ||
            !(selection instanceof TextSelection) ||
            selection.empty ||
            !transactions.some((tr) => tr.selectionSet) ||
            transactions.some((tr) => tr.docChanged || tr.getMeta(KEEP_TEXT_SELECTION))
          ) {
            return null;
          }
          const range = blockRangeFor(newState.doc, selection.anchor, selection.head);
          return range ? newState.tr.setSelection(BlockSelection.create(newState.doc, range.anchor, range.head)) : null;
        },
        view(view) {
          const onMouseDown = (event: MouseEvent) => {
            if (event.button === 0) {
              mouseDown = true;
            }
          };
          const onMouseUp = () => {
            if (!mouseDown) {
              return;
            }
            mouseDown = false;
            const { state } = view;
            const { selection } = state;
            const range =
              selection instanceof TextSelection && !selection.empty
                ? blockRangeFor(state.doc, selection.anchor, selection.head)
                : null;
            // Convert a text drag across blocks into a block selection, or just refresh the highlight.
            view.dispatch(
              range
                ? state.tr.setSelection(BlockSelection.create(state.doc, range.anchor, range.head))
                : state.tr.setMeta(key, 'mouseup'),
            );
          };
          view.dom.addEventListener('mousedown', onMouseDown);
          window.addEventListener('mouseup', onMouseUp);
          window.addEventListener('blur', onMouseUp);
          return {
            destroy() {
              view.dom.removeEventListener('mousedown', onMouseDown);
              window.removeEventListener('mouseup', onMouseUp);
              window.removeEventListener('blur', onMouseUp);
            },
          };
        },
      }),
    ];
  },
});
