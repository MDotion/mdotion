import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Editor } from '@tiptap/core';
import { UndoRedo } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { alignDelimiterRow, getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import { clipboardToGrid, gridFromTsv, gridToTable } from '../webview/src/editor/table/clipboardGrid';
import { pasteGrid, TableBehaviour } from '../webview/src/editor/table/TableBehaviour';

const clipboardDir = path.join(__dirname, 'fixtures', 'clipboard');

function clip(name: string): { html: string; text: string } {
  const read = (ext: string) => readFileSync(path.join(clipboardDir, `${name}.${ext}`), 'utf8');
  return { html: read('html'), text: read('txt') };
}

let editor: Editor | null = null;

function setup(source = '# Doc\n\nIntro\n') {
  const extensions = [...getMdotionExtensions(), UndoRedo, TableBehaviour];
  editor = new Editor({ extensions, element: document.createElement('div') });
  const adapter = new MarkdownAdapter(extensions, editor.schema);
  const parsed = adapter.parse(source);
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content).setMeta('addToHistory', false),
  );
  parsed.map.bind(editor.state.doc, parsed.doc);
  return { editor, adapter, map: parsed.map };
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function tableMarkdown(name: string): string {
  const { editor: ed, adapter } = setup();
  const { html, text } = clip(name);
  const grid = clipboardToGrid(html, text);
  expect(grid).not.toBeNull();
  return adapter.serializeNode(gridToTable(grid!, ed.schema));
}

function textPos(ed: Editor, needle: string): number {
  let found = -1;
  ed.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(needle)) {
      found = pos + node.text!.indexOf(needle);
    }
    return found < 0;
  });
  return found;
}

describe('clipboard to table', () => {
  it('reads an Excel selection, escaping pipes and keeping number alignment', () => {
    expect(tableMarkdown('excel')).toBe(
      [
        '| Feature               | Status      | Cost    |',
        '| --------------------- | ----------- | ------: |',
        '| Authentication        | Done        | 1200.50 |',
        '| Notifications \\| push | In progress | 80.00   |',
        '| Billing               |             | 0.00    |',
      ].join('\n'),
    );
  });

  it('reads Google Sheets: links kept, line breaks become <br>, styles ignored', () => {
    expect(tableMarkdown('google-sheets')).toBe(
      [
        '| Task            | Owner                          | Points |',
        '| --------------- | ------------------------------ | -----: |',
        '| Write docs      | [Ada](https://example.com/ada) | 5      |',
        '| Ship<br>release | Linus                          | 8      |',
      ].join('\n'),
    );
  });

  it('reads a GitHub table with code, bold, links and a centered column', () => {
    expect(tableMarkdown('github')).toBe(
      [
        '| Option    | Default | Description                                                            |',
        '| --------- | :-----: | ---------------------------------------------------------------------- |',
        '| `--watch` | `false` | Rebuild on **every** change. See [the docs](https://example.com/docs). |',
        '| `--out`   | `dist`  | Output folder                                                          |',
      ].join('\n'),
    );
  });

  it('unmerges Wikipedia cells and flattens lists and images', () => {
    const markdown = tableMarkdown('wikipedia');
    const lines = markdown.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[2]).toMatch(/^\| 1 +\| \[Rome\]\(\/wiki\/Rome "Rome"\)\[\[1\]\]\(#cite_note-1\) +\| \[Lazio\]\(\/wiki\/Lazio\) and nearby \|$/);
    expect(lines[3]).toMatch(/^\| 2 +\| flag Latina +\| +\|$/);
    expect(lines[4]).toMatch(/^\| Others +\| +\| North<br>South +\|$/);
  });

  it('reads a real Excel for Mac selection: header, currency, percentages, line break, merged cells', () => {
    expect(tableMarkdown('excel-mac')).toBe(
      [
        '| Feature               | Status      | Cost       | Done |',
        '| --------------------- | ----------- | ---------: | ---: |',
        '| Authentication        | Done        | 1.200,50 € | 95%  |',
        '| Notifications \\| push | In progress | 80,00 €    | 40%  |',
        '| Billing               |             | 0,00 €     | 0%   |',
        '| Ship<br>release       | Planned     | 15,00 €    | 0%   |',
        '| Total                 |             | 1.295,50 € |      |',
      ].join('\n'),
    );
  });

  it('reads a table copied from a GitHub page in Chrome (inline styles, interchange line break)', () => {
    expect(tableMarkdown('github-chrome')).toBe(
      [
        '| Tables        | Are           | Cool  |',
        '| ------------- | :-----------: | ----: |',
        '| col 3 is      | right-aligned | $1600 |',
        '| col 2 is      | centered      | $12   |',
        '| zebra stripes | are neat      | $1    |',
      ].join('\n'),
    );
  });

  it('splits Wikipedia rowspan / colspan cells copied in Chrome', () => {
    expect(tableMarkdown('wikipedia-spans-chrome')).toBe(
      [
        '| Column 1 | Column 2 | Column 3 |',
        '| -------- | -------- | -------- |',
        '| A        | B        |          |',
        '|          | C        | D        |',
        '| E        | F        |          |',
        '| G        |          |          |',
        '| H        |          |          |',
      ].join('\n'),
    );
  });

  it('keeps links and emphasis from a Wikipedia article table', () => {
    const lines = tableMarkdown('wikipedia-regions-chrome').split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toMatch(/^\| Map \| Macroregion<br>\*Italian name\* +\| Regions /);
    expect(lines[3]).toContain('[**Centre**](https://en.wikipedia.org/wiki/Central_Italy "Central Italy")<br>*Centro*');
    expect(lines[3]).toContain('[Rome](https://en.wikipedia.org/wiki/Rome "Rome")');
  });

  it.each([
    'excel',
    'google-sheets',
    'numbers',
    'libreoffice',
    'github',
    'wikipedia',
    'excel-mac',
    'github-chrome',
    'wikipedia-spans-chrome',
    'wikipedia-regions-chrome',
  ])(
    '%s produces a table that stays a table when the file is reopened',
    (name) => {
      const markdown = tableMarkdown(name);
      const { adapter } = setup();
      const reparsed = adapter.parse(markdown);
      expect(reparsed.rawBlocks).toBe(0);
      expect(reparsed.doc.firstChild?.type.name).toBe('table');
      expect(adapter.serialize(reparsed.doc, null).trimEnd()).toBe(markdown);
    },
  );

  it('ignores HTML with content around the table, and single cells', () => {
    const { html, text } = clip('not-a-table');
    expect(clipboardToGrid(html, text)).toBeNull();
    expect(clipboardToGrid('<table><tr><td>only</td></tr></table>', 'only')).toBeNull();
    expect(clipboardToGrid('<p data-pm-slice="1 1 []"><table><tr><td>a</td><td>b</td></tr></table></p>', 'a\tb\nc\td')).toBeNull();
  });

  it('falls back to tab-separated text, with quoted fields', () => {
    expect(gridFromTsv('a\tb\n1\t2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(gridFromTsv('name\tnote\nx\t"two\nlines, ""quoted"""\n')).toEqual([
      ['name', 'note'],
      ['x', 'two\nlines, "quoted"'],
    ]);
    expect(gridFromTsv('"open\tquote\nrest\tx')).toEqual([
      ['"open', 'quote'],
      ['rest', 'x'],
    ]);
  });

  it('does not treat ordinary text with tabs as a table', () => {
    expect(gridFromTsv('one\ttwo')).toBeNull();
    expect(gridFromTsv('a\tb\nc')).toBeNull();
    expect(gridFromTsv('no tabs\nhere')).toBeNull();
  });
});

describe('pasting a grid', () => {
  it('replaces an empty paragraph with the table, as one undo step', () => {
    const { editor: ed, adapter, map } = setup('# Doc\n\nIntro\n\n\n\nEnd\n');
    const empty = ed.state.doc.child(2);
    expect(empty.type.name).toBe('paragraph');
    const start = ed.state.doc.child(0).nodeSize + ed.state.doc.child(1).nodeSize + 1;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, start)));
    expect(empty.childCount).toBe(0);
    const { html, text } = clip('numbers');
    expect(pasteGrid(ed.view, html, text)).toBe(true);
    expect(adapter.serialize(ed.state.doc, map)).toBe(
      '# Doc\n\nIntro\n\n| City   | Population |\n| ------ | ---------: |\n| Milano | 1,371,850  |\n| Torino | 841,600    |\n\nEnd\n',
    );
    ed.commands.undo();
    expect(adapter.serialize(ed.state.doc, map)).toBe('# Doc\n\nIntro\n\n\n\nEnd\n');
  });

  it('pastes cells into an existing table from the caret and grows it', () => {
    const { editor: ed, adapter, map } = setup('| a | b |\n|---|---|\n| 1 | 2 |\n');
    ed.commands.setTextSelection(textPos(ed, '2'));
    expect(pasteGrid(ed.view, '', 'x\ty\nz\tw')).toBe(true);
    expect(adapter.serialize(ed.state.doc, map)).toBe(
      ['| a   | b   |     |', '| --- | --- | --- |', '| 1   | x   | y   |', '|     | z   | w   |', ''].join('\n'),
    );
  });

  it('keeps the first row as the header when pasting over it', () => {
    const { editor: ed } = setup('| a | b |\n|---|---|\n| 1 | 2 |\n');
    ed.commands.setTextSelection(textPos(ed, 'a') + 1);
    pasteGrid(ed.view, '', 'h1\th2\nv1\tv2');
    const table = ed.state.doc.firstChild!;
    expect(table.child(0).child(0).type.name).toBe('tableHeader');
    expect(table.child(1).child(0).type.name).toBe('tableCell');
    expect(table.child(0).textContent).toBe('h1h2');
  });

  it('never pastes a grid into a code block', () => {
    const { editor: ed } = setup('```\ncode\n```\n');
    ed.commands.setTextSelection(textPos(ed, 'code') + 2);
    expect(pasteGrid(ed.view, '', 'a\tb\nc\td')).toBe(false);
  });
});

describe('delimiter row', () => {
  const table = '| Table    | Owner   | Rows  |\n| :-------- | :-------: | -------: |\n| users    | auth    | 1200  |';
  const aligned = '| Table    | Owner   | Rows  |\n| :------- | :-----: | ----: |\n| users    | auth    | 1200  |';

  it('lines up with the header and is idempotent', () => {
    expect(alignDelimiterRow(table)).toBe(aligned);
    expect(alignDelimiterRow(aligned)).toBe(aligned);
  });

  it('is applied once even when the editor injects a table view', () => {
    const extensions = getMdotionExtensions({ table: () => ({ dom: document.createElement('div') }) });
    const withViews = new MarkdownAdapter(extensions);
    const parsed = withViews.parse('| a | b |\n|:---|---:|\n| 1 | 2 |\n');
    expect(withViews.serialize(parsed.doc, null)).toBe('| a   | b   |\n| :-- | --: |\n| 1   | 2   |\n');
  });

  it('copes with escaped pipes in the header', () => {
    expect(alignDelimiterRow('| a \\| b | c   |\n| ------: | --- |')).toBe('| a \\| b | c   |\n| -----: | --- |');
  });
});
