import { Editor } from '@tiptap/core';
import { UndoRedo } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import { BlockSelection, BlockSelectionExtension, blockRangeFor } from '../webview/src/editor/BlockSelection';
import { sliceToMarkdown } from '../webview/src/editor/sliceToMarkdown';

const SOURCE = '# Title\n\nFirst _para_ with **bold**.\n\n- one\n- two\n- three\n\n| a  | b |\n|----|---|\n| 1  | 2 |\n\nLast\n';

let editor: Editor | null = null;

function setup(source = SOURCE) {
  const extensions = [...getMdotionExtensions(), UndoRedo, BlockSelectionExtension];
  editor = new Editor({ extensions, element: document.createElement('div') });
  const adapter = new MarkdownAdapter(extensions, editor.schema);
  const parsed = adapter.parse(source);
  editor.view.dispatch(
    editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content).setMeta('addToHistory', false),
  );
  parsed.map.bind(editor.state.doc, parsed.doc);
  return { editor, adapter, map: parsed.map };
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

function press(ed: Editor, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, ...init });
  return ed.view.someProp('handleKeyDown', (handler) => handler(ed.view, event)) ?? false;
}

function selectedTypes(ed: Editor): string[] {
  const { selection } = ed.state;
  return selection instanceof BlockSelection ? selection.blocks().map(({ node }) => node.type.name) : [];
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('blockRangeFor', () => {
  it('returns null inside one textblock and block boundaries across blocks', () => {
    const { editor: ed } = setup();
    const inTitle = textPos(ed, 'Title');
    expect(blockRangeFor(ed.state.doc, inTitle, inTitle + 3)).toBeNull();
    const range = blockRangeFor(ed.state.doc, inTitle + 2, textPos(ed, 'First') + 3)!;
    expect(range.anchor).toBe(0);
    expect(ed.state.doc.resolve(range.head).index()).toBe(2);
  });

  it('selects list items when the range stays inside one list', () => {
    const { editor: ed } = setup();
    const range = blockRangeFor(ed.state.doc, textPos(ed, 'one') + 1, textPos(ed, 'two') + 1)!;
    const selection = BlockSelection.create(ed.state.doc, range.anchor, range.head);
    expect(selection.blocks().map(({ node }) => node.textContent)).toEqual(['one', 'two']);
  });
});

describe('Notion block selection', () => {
  it('turns a text selection across blocks into a block selection', () => {
    const { editor: ed } = setup();
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, textPos(ed, 'Title') + 2, textPos(ed, 'First') + 2)));
    expect(selectedTypes(ed)).toEqual(['heading', 'paragraph']);
  });

  it('Escape selects the current block, Shift+↓ extends, Backspace deletes', () => {
    const { editor: ed } = setup();
    ed.commands.setTextSelection(textPos(ed, 'First') + 1);
    expect(press(ed, 'Escape')).toBe(true);
    expect(selectedTypes(ed)).toEqual(['paragraph']);
    press(ed, 'ArrowDown', { shiftKey: true });
    expect(selectedTypes(ed)).toEqual(['paragraph', 'bulletList']);
    press(ed, 'Backspace');
    expect(ed.state.doc.content.content.map((node) => node.type.name)).toEqual(['heading', 'table', 'paragraph']);
  });

  it('Cmd+A selects the block text first, then every block', () => {
    const { editor: ed } = setup();
    ed.commands.setTextSelection(textPos(ed, 'First') + 1);
    press(ed, 'a', { metaKey: true });
    expect(ed.state.selection).toBeInstanceOf(TextSelection);
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('First para with bold.');
    press(ed, 'a', { metaKey: true });
    expect(selectedTypes(ed)).toEqual(['heading', 'paragraph', 'bulletList', 'table', 'paragraph']);
  });

  it('deleting every item of a list removes the list instead of leaving an empty bullet', () => {
    const { editor: ed } = setup();
    const range = blockRangeFor(ed.state.doc, textPos(ed, 'one'), textPos(ed, 'three') + 2)!;
    ed.view.dispatch(ed.state.tr.setSelection(BlockSelection.create(ed.state.doc, range.anchor, range.head)));
    ed.view.dispatch(ed.state.tr.deleteSelection());
    expect(ed.state.doc.content.content.map((node) => node.type.name)).toEqual(['heading', 'paragraph', 'table', 'paragraph']);
  });

  it('typing over selected blocks does not erase them', () => {
    const { editor: ed } = setup();
    ed.commands.setTextSelection(textPos(ed, 'Last'));
    press(ed, 'Escape');
    expect(press(ed, 'x')).toBe(true);
    expect(ed.state.doc.lastChild?.textContent).toBe('Last');
  });

  it('undo restores deleted blocks as a block selection', () => {
    const { editor: ed } = setup();
    ed.commands.setTextSelection(textPos(ed, 'Last'));
    press(ed, 'Escape');
    press(ed, 'Backspace');
    ed.commands.undo();
    expect(ed.state.doc.lastChild?.textContent).toBe('Last');
  });
});

describe('copy as Markdown', () => {
  it('copies selected blocks with their exact source', () => {
    const { editor: ed, adapter, map } = setup();
    const from = textPos(ed, 'First') - 1;
    ed.view.dispatch(ed.state.tr.setSelection(BlockSelection.create(ed.state.doc, from, ed.state.doc.content.size - 6)));
    expect(sliceToMarkdown(ed.state.selection.content(), adapter, map)).toBe(
      'First _para_ with **bold**.\n\n- one\n- two\n- three\n\n| a  | b |\n|----|---|\n| 1  | 2 |',
    );
  });

  it('copies list items as a list', () => {
    const { editor: ed, adapter, map } = setup();
    const range = blockRangeFor(ed.state.doc, textPos(ed, 'two'), textPos(ed, 'three') + 1)!;
    const selection = BlockSelection.create(ed.state.doc, range.anchor, range.head);
    expect(sliceToMarkdown(selection.content(), adapter, map)).toBe('- two\n- three');
  });

  it('copies text inside one block as inline Markdown, without block prefixes', () => {
    const { editor: ed, adapter, map } = setup();
    const inParagraph = TextSelection.create(ed.state.doc, textPos(ed, 'with'), textPos(ed, 'bold') + 4);
    expect(sliceToMarkdown(inParagraph.content(), adapter, map)).toBe('with **bold**');
    const inList = TextSelection.create(ed.state.doc, textPos(ed, 'two'), textPos(ed, 'two') + 3);
    expect(sliceToMarkdown(inList.content(), adapter, map)).toBe('two');
  });
});
