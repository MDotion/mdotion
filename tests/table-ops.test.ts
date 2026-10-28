import { Editor } from '@tiptap/core';
import { UndoRedo } from '@tiptap/extensions';
import { CellSelection } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import { TableBehaviour } from '../webview/src/editor/table/TableBehaviour';
import { BlockSelection, BlockSelectionExtension } from '../webview/src/editor/BlockSelection';
import { insertPlainText } from '../webview/src/editor/MarkdownClipboard';
import { NotionKeymap } from '../webview/src/editor/NotionKeymap';
import { selectColumn, tableOps, updateTable, type Cells } from '../webview/src/editor/table/tableOps';
import type { Schema } from '@tiptap/pm/model';

const SOURCE = 'Intro\n\n| Name | Role | Team |\n|------|:----:|-----:|\n| Ada | Lead | Core |\n| Linus | Dev | Kernel |\n\nAfter\n';

let editor: Editor | null = null;

function setup(source = SOURCE) {
  const extensions = [...getMdotionExtensions(), UndoRedo, TableBehaviour, BlockSelectionExtension, NotionKeymap];
  editor = new Editor({ extensions, element: document.createElement('div') });
  const adapter = new MarkdownAdapter(extensions, editor.schema);
  const parsed = adapter.parse(source);
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content).setMeta('addToHistory', false),
  );
  parsed.map.bind(editor.state.doc, parsed.doc);
  const tablePos = editor.state.doc.child(0).nodeSize;
  const markdown = () => adapter.serialize(editor!.state.doc, parsed.map);
  const table = () => markdown().split('\n').filter((line) => line.startsWith('|'));
  const run = (update: (cells: Cells, schema: Schema) => Cells) => {
    editor!.view.dispatch(updateTable(editor!.state, tablePos, update)!);
  };
  return { ed: editor, tablePos, markdown, table, run };
}

function press(ed: Editor, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, ...init });
  return ed.view.someProp('handleKeyDown', (handler) => handler(ed.view, event)) ?? false;
}

function caretIn(ed: Editor, text: string): void {
  let found = -1;
  ed.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text === text) {
      found = pos + 1;
    }
    return found < 0;
  });
  ed.commands.setTextSelection(found);
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('row and column operations', () => {
  it('moves a column with its alignment, leaving the rest of the file untouched', () => {
    const { run, markdown } = setup();
    run(tableOps.moveColumn(2, 0));
    expect(markdown()).toBe(
      'Intro\n\n| Team   | Name  | Role |\n| -----: | ----- | :--: |\n| Core   | Ada   | Lead |\n| Kernel | Linus | Dev  |\n\nAfter\n',
    );
  });

  it('keeps the first row as the header when rows move', () => {
    const { run, table } = setup();
    run(tableOps.moveRow(2, 0));
    expect(table()[0]).toBe('| Linus | Dev  | Kernel |');
    expect(table()[2]).toBe('| Name  | Role | Team   |');
  });

  it('inserts, duplicates, clears and deletes', () => {
    const { run, table } = setup();
    run(tableOps.insertColumn(1));
    expect(table()[0]).toBe('| Name  |     | Role | Team   |');
    run(tableOps.deleteColumn(1));
    run(tableOps.duplicateRow(1));
    expect(table().slice(2)).toEqual(['| Ada   | Lead | Core   |', '| Ada   | Lead | Core   |', '| Linus | Dev  | Kernel |']);
    run(tableOps.clearRow(2));
    run(tableOps.deleteRow(2));
    expect(table()).toHaveLength(4);
    run(tableOps.insertRow(3));
    // New rows keep the column alignment.
    expect(table()[4]).toBe('|       |      |        |');
  });

  it('sets the alignment of a column', () => {
    const { run, table } = setup();
    run(tableOps.alignColumn(0, 'center'));
    run(tableOps.alignColumn(1, null));
    expect(table()[1]).toBe('| :---: | ---- | -----: |');
  });

  it('deletes the table with its last column', () => {
    const { ed } = setup('| a |\n|---|\n| 1 |\n\nAfter\n');
    ed.view.dispatch(updateTable(ed.state, 0, tableOps.deleteColumn(0))!);
    expect(ed.state.doc.firstChild?.textContent).toBe('After');
  });

  it('selects a whole column', () => {
    const { ed, tablePos } = setup();
    const selection = selectColumn(ed.state.doc, tablePos, 1);
    expect(selection).toBeInstanceOf(CellSelection);
    expect((selection as CellSelection).isColSelection()).toBe(true);
  });
});

describe('table keyboard', () => {
  it('Enter moves to the cell below, and adds a row at the bottom', () => {
    const { ed, table } = setup();
    caretIn(ed, 'Role');
    expect(press(ed, 'Enter')).toBe(true);
    expect(ed.state.selection.$from.parent.textContent).toBe('Lead');
    press(ed, 'Enter');
    press(ed, 'Enter');
    expect(table()).toHaveLength(5);
    expect(ed.state.selection.$from.parent.textContent).toBe('');
    ed.commands.undo();
    expect(table()).toHaveLength(4);
  });

  it('Cmd+Shift+↑ moves the row with the caret', () => {
    const { ed, table } = setup();
    caretIn(ed, 'Linus');
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    expect(press(ed, 'ArrowUp', { metaKey: mac, ctrlKey: !mac, shiftKey: true })).toBe(true);
    expect(table()[2]).toBe('| Linus | Dev  | Kernel |');
    expect(ed.state.selection.$from.parent.textContent).toBe('Linus');
  });
});

describe('table keyboard, as documented in the changelog', () => {
  it('Tab goes to the next cell, and adds a row from the last one', () => {
    const { ed, table } = setup();
    caretIn(ed, 'Name');
    expect(press(ed, 'Tab')).toBe(true);
    expect(ed.state.selection.$from.parent.textContent).toBe('Role');
    expect(press(ed, 'Tab', { shiftKey: true })).toBe(true);
    expect(ed.state.selection.$from.parent.textContent).toBe('Name');
    caretIn(ed, 'Team');
    press(ed, 'Tab');
    expect(ed.state.selection.$from.parent.textContent).toBe('Ada');
    caretIn(ed, 'Kernel');
    press(ed, 'Tab');
    expect(table()).toHaveLength(5);
    expect(ed.state.selection.$from.parent.textContent).toBe('');
  });

  it('Escape selects the whole table as a block', () => {
    const { ed } = setup();
    caretIn(ed, 'Lead');
    expect(press(ed, 'Escape')).toBe(true);
    const selection = ed.state.selection as BlockSelection;
    expect(selection).toBeInstanceOf(BlockSelection);
    expect(selection.blocks().map(({ node }) => node.type.name)).toEqual(['table']);
  });

  it('Shift+Enter writes <br>, and the table reopens as a table', () => {
    const { ed, markdown } = setup();
    caretIn(ed, 'Lead');
    ed.commands.setTextSelection(ed.state.selection.from + 3);
    expect(press(ed, 'Enter', { shiftKey: true })).toBe(true);
    ed.view.dispatch(ed.state.tr.insertText('er'));
    const out = markdown();
    expect(out).toContain('| Lead<br>er |');
    const reopened = new MarkdownAdapter(getMdotionExtensions()).parse(out);
    expect(reopened.rawBlocks).toBe(0);
  });
});

describe('paste as plain text', () => {
  it('inserts lines as paragraphs, literally', () => {
    const { ed, markdown } = setup('Intro\n');
    ed.commands.setTextSelection(6);
    insertPlainText(ed.view, '\n# not a heading\na\tb');
    expect(markdown()).toBe('Intro\n\n\\# not a heading\n\na\tb\n');
  });

  it('keeps one paragraph per cell, with line breaks', () => {
    const { ed, table } = setup();
    caretIn(ed, 'Ada');
    ed.commands.setTextSelection(ed.state.selection.from + 2);
    insertPlainText(ed.view, 'x\ny');
    expect(table()[2]).toContain('| Adax<br>y |');
  });
});

describe('tableAround', () => {
  it('finds the column from inside a cell and from a cell position', async () => {
    const { tableAround, cellPos } = await import('../webview/src/editor/table/tableOps');
    const { ed, tablePos } = setup();
    const table = ed.state.doc.nodeAt(tablePos)!;
    const before = cellPos(table, tablePos, 2, 1);
    expect(tableAround(ed.state.doc.resolve(before))).toMatchObject({ row: 2, col: 1 });
    expect(tableAround(ed.state.doc.resolve(before + 2))).toMatchObject({ row: 2, col: 1 });
  });
});
