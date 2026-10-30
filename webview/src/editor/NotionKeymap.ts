import { Extension, type Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state';
import { emitUiEvent } from '../lib/uiEvents';
import { BlockSelection, blockAround } from './BlockSelection';
import { BLOCK_TYPES } from './blockTypes';

/** The blocks an action applies to: the block selection, a selected node, or the block around the caret. */
export function selectedRange(editor: Editor): { from: number; to: number } | null {
  const { selection } = editor.state;
  if (selection instanceof BlockSelection || selection instanceof NodeSelection) {
    return { from: selection.from, to: selection.to };
  }
  return blockAround(selection.$from);
}

/** Keeps the kind of selection (blocks / node / caret) after the range moved by `delta`. */
function shiftedSelection(selection: Selection, doc: Selection['$from']['doc'], delta: number): Selection {
  if (selection instanceof BlockSelection) {
    return BlockSelection.create(doc, selection.anchor + delta, selection.head + delta);
  }
  if (selection instanceof NodeSelection) {
    return NodeSelection.create(doc, selection.from + delta);
  }
  const anchor = Math.min(Math.max(selection.from + delta, 0), doc.content.size);
  return TextSelection.near(doc.resolve(anchor));
}

/** Inserts a copy of the sibling blocks between `from` and `to` right after them and selects the copy. */
export function duplicateBlocks(editor: Editor, from: number, to: number): boolean {
  const { state } = editor;
  const tr = state.tr.insert(to, state.doc.slice(from, to).content);
  tr.setSelection(shiftedSelection(state.selection, tr.doc, to - from));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** Moves the sibling blocks between `from` and `to` one sibling up (-1) or down (+1). */
export function moveBlocks(editor: Editor, from: number, to: number, direction: -1 | 1): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(from);
  const parent = $from.parent;
  const first = $from.index();
  const after = state.doc.resolve(to).index();
  const otherIndex = direction === 1 ? after : first - 1;
  if (otherIndex < 0 || otherIndex >= parent.childCount) {
    return false;
  }
  const other = parent.child(otherIndex);
  const blocks = state.doc.slice(from, to).content;
  const tr =
    direction === 1
      ? state.tr.replaceWith(from, to + other.nodeSize, Fragment.from(other).append(blocks))
      : state.tr.replaceWith(from - other.nodeSize, to, blocks.addToEnd(other));
  tr.setSelection(shiftedSelection(state.selection, tr.doc, direction === 1 ? other.nodeSize : -other.nodeSize));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** Notion keyboard behaviour on top of Tiptap's defaults. */
export const NotionKeymap = Extension.create({
  name: 'notionKeymap',

  addKeyboardShortcuts() {
    return {
      // Backspace at the start of a heading turns it into text first (Notion), instead of merging.
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty || $from.parentOffset !== 0) {
          return false;
        }
        if ($from.parent.type.name === 'heading') {
          return editor.commands.setParagraph();
        }
        const wrapper = $from.depth >= 2 ? $from.node($from.depth - 1) : null;
        if (wrapper && (wrapper.type.name === 'blockquote' || wrapper.type.name === 'callout') && $from.index($from.depth - 1) === 0) {
          return editor.commands.lift(wrapper.type.name);
        }
        return false;
      },
      'Mod-Enter': ({ editor }) => {
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const node = $from.node(depth);
          if (node.type.name === 'taskItem') {
            const pos = $from.before(depth);
            return editor
              .chain()
              .command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked });
                return true;
              })
              .run();
          }
        }
        return false;
      },
      'Mod-k': () => {
        emitUiEvent('editLink', undefined);
        return true;
      },
      'Mod-d': ({ editor }) => {
        const range = selectedRange(editor);
        return range ? duplicateBlocks(editor, range.from, range.to) : false;
      },
      'Mod-Shift-ArrowUp': ({ editor }) => {
        const range = selectedRange(editor);
        return range ? moveBlocks(editor, range.from, range.to, -1) : false;
      },
      'Mod-Shift-ArrowDown': ({ editor }) => {
        const range = selectedRange(editor);
        return range ? moveBlocks(editor, range.from, range.to, 1) : false;
      },
      // Keep focus in the page: Tab indents lists and code, and never leaves the editor.
      Tab: ({ editor }) => {
        if (editor.isActive('codeBlock')) {
          return editor.commands.insertContent('  ');
        }
        if (editor.can().sinkListItem('taskItem')) {
          return editor.commands.sinkListItem('taskItem');
        }
        if (editor.can().sinkListItem('listItem')) {
          return editor.commands.sinkListItem('listItem');
        }
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.can().liftListItem('taskItem')) {
          return editor.commands.liftListItem('taskItem');
        }
        if (editor.can().liftListItem('listItem')) {
          return editor.commands.liftListItem('listItem');
        }
        return true;
      },
    };
  },
});

/**
 * Always takes the key: a block type's chain can report false although it
 * converted the block (`setParagraph` on a paragraph), and the key would then
 * reach Tiptap's own ⌘⌥4–6, which turns the result into a heading.
 */
function turnInto(editor: Editor, id: string): boolean {
  BLOCK_TYPES.find((type) => type.id === id)?.apply(editor);
  return true;
}

/**
 * Notion's "turn into" shortcuts. They take ⌘⌥4–6 from Tiptap's H4–H6 (still
 * available from `/` and by typing `####`), so they run first.
 */
export const BlockShortcuts = Extension.create({
  name: 'notionBlockShortcuts',
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-4': ({ editor }) => turnInto(editor, 'taskList'),
      'Mod-Alt-5': ({ editor }) => turnInto(editor, 'bulletList'),
      'Mod-Alt-6': ({ editor }) => turnInto(editor, 'orderedList'),
      'Mod-Alt-8': ({ editor }) => turnInto(editor, 'codeBlock'),
      'Mod-Alt-9': ({ editor }) => turnInto(editor, 'callout'),
    };
  },
});
