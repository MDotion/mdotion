import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { CellSelection, handlePaste as pasteCells, isInTable } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';
import { slashPluginKey } from '../slash/SlashCommandExtension';
import { clipboardToGrid, gridToTable } from './clipboardGrid';
import { selectCell, tableAround, tableOps, updateTable } from './tableOps';

const tableBehaviourKey = new PluginKey('mdotionTableBehaviour');

/**
 * Pastes a spreadsheet selection or a web table as a GFM table: a new table
 * outside tables, cells filled from the caret (growing the table) inside one.
 */
export function pasteGrid(view: EditorView, html: string, text: string): boolean {
  const { state } = view;
  const { $from } = state.selection;
  if ($from.parent.type.spec.code) {
    return false;
  }
  const grid = clipboardToGrid(html, text);
  if (!grid) {
    return false;
  }
  const table = gridToTable(grid, state.schema);
  if (isInTable(state)) {
    return pasteCells(view, null as unknown as ClipboardEvent, new Slice(Fragment.from(table), 0, 0));
  }
  const tr = state.tr;
  const parent = $from.parent;
  const replacesEmptyParagraph =
    state.selection.empty && parent.type.name === 'paragraph' && parent.content.size === 0 && $from.depth > 0;
  let tablePos: number;
  if (replacesEmptyParagraph) {
    tablePos = $from.before();
    tr.replaceWith(tablePos, $from.after(), table);
  } else {
    tr.replaceSelectionWith(table);
    tablePos = tr.mapping.map(state.selection.from, -1);
    // replaceSelectionWith may split the paragraph: find the inserted table.
    tr.doc.nodesBetween(tablePos, Math.min(tablePos + 2, tr.doc.content.size), (node, pos) => {
      if (node.type.name === 'table') {
        tablePos = pos;
      }
      return node.type.name !== 'table';
    });
  }
  const after = tablePos + table.nodeSize;
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(after, tr.doc.content.size)), 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** Row 0 holds header cells and every other row body cells (GFM always has one header row). */
export function fixHeaderRows(state: EditorState): Transaction | null {
  let tr: Transaction | null = null;
  const { tableHeader, tableCell } = state.schema.nodes;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') {
      return node.isBlock && !node.isTextblock;
    }
    node.forEach((row, rowOffset, rowIndex) => {
      row.forEach((cell, cellOffset) => {
        const want = rowIndex === 0 ? tableHeader : tableCell;
        if (cell.type !== want) {
          tr ??= state.tr;
          tr.setNodeMarkup(pos + 1 + rowOffset + 1 + cellOffset, want, cell.attrs);
        }
      });
    });
    return false;
  });
  return tr;
}

function inCell(state: EditorState) {
  const { selection } = state;
  if (selection instanceof CellSelection) {
    return null;
  }
  return tableAround(selection.$head);
}

/**
 * Spreadsheet-like table behaviour on top of prosemirror-tables: paste from
 * Excel / Sheets / web pages, Enter moves down, Cmd+Shift+↑/↓ moves the row.
 * Runs before the table extension and the block keymap (priority).
 */
export const TableBehaviour = Extension.create({
  name: 'mdotionTableBehaviour',
  priority: 200,

  addKeyboardShortcuts() {
    const moveRow = (direction: -1 | 1) => () => {
      const { state, view } = this.editor;
      const cell = inCell(state);
      if (!cell) {
        return false;
      }
      const target = cell.row + direction;
      if (target < 0 || target >= cell.node.childCount) {
        return true;
      }
      const tr = updateTable(state, cell.pos, tableOps.moveRow(cell.row, target), (doc, pos) => selectCell(doc, pos, target, cell.col));
      if (tr) {
        view.dispatch(tr.scrollIntoView());
      }
      return true;
    };
    return {
      Enter: () => {
        const { state, view } = this.editor;
        if (slashPluginKey.getState(state)?.active) {
          return false;
        }
        const cell = inCell(state);
        if (!cell) {
          return false;
        }
        const below = cell.row + 1;
        if (below < cell.node.childCount) {
          view.dispatch(state.tr.setSelection(selectCell(state.doc, cell.pos, below, cell.col)).scrollIntoView());
          return true;
        }
        const tr = updateTable(state, cell.pos, tableOps.insertRow(below), (doc, pos) => selectCell(doc, pos, below, cell.col));
        if (tr) {
          view.dispatch(tr.scrollIntoView());
        }
        return true;
      },
      // Here, not in the table extension: the block keymap (Tab indents lists) would take Tab first.
      Tab: () => {
        const { state, view } = this.editor;
        const cell = inCell(state);
        if (!cell) {
          return false;
        }
        const cols = cell.node.firstChild!.childCount;
        if (cell.col + 1 < cols) {
          view.dispatch(state.tr.setSelection(selectCell(state.doc, cell.pos, cell.row, cell.col + 1)).scrollIntoView());
        } else if (cell.row + 1 < cell.node.childCount) {
          view.dispatch(state.tr.setSelection(selectCell(state.doc, cell.pos, cell.row + 1, 0)).scrollIntoView());
        } else {
          const below = cell.row + 1;
          const tr = updateTable(state, cell.pos, tableOps.insertRow(below), (doc, pos) => selectCell(doc, pos, below, 0));
          if (tr) {
            view.dispatch(tr.scrollIntoView());
          }
        }
        return true;
      },
      'Shift-Tab': () => {
        const { state, view } = this.editor;
        const cell = inCell(state);
        if (!cell) {
          return false;
        }
        const cols = cell.node.firstChild!.childCount;
        if (cell.col > 0) {
          view.dispatch(state.tr.setSelection(selectCell(state.doc, cell.pos, cell.row, cell.col - 1)).scrollIntoView());
        } else if (cell.row > 0) {
          view.dispatch(state.tr.setSelection(selectCell(state.doc, cell.pos, cell.row - 1, cols - 1)).scrollIntoView());
        }
        return true;
      },
      'Mod-Shift-ArrowUp': moveRow(-1),
      'Mod-Shift-ArrowDown': moveRow(1),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tableBehaviourKey,
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            return data ? pasteGrid(view, data.getData('text/html'), data.getData('text/plain')) : false;
          },
        },
        appendTransaction: (transactions, _old, state) =>
          transactions.some((tr) => tr.docChanged) ? fixHeaderRows(state) : null,
      }),
    ];
  },
});
