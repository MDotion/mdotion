import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import { BlockShortcuts, NotionKeymap } from '../webview/src/editor/NotionKeymap';

let editor: Editor | null = null;

function setup(source: string) {
  const extensions = [...getMdotionExtensions(), NotionKeymap, BlockShortcuts];
  editor = new Editor({ extensions, element: document.createElement('div') });
  const adapter = new MarkdownAdapter(extensions, editor.schema);
  const parsed = adapter.parse(source);
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content));
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
  return { ed: editor, markdown: () => adapter.serialize(editor!.state.doc, null) };
}

/** ⌘⌥<key> on macOS, Ctrl+Alt+<key> elsewhere, as ProseMirror's keymap reads it. */
function press(ed: Editor, key: string): boolean {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const event = new KeyboardEvent('keydown', { key, code: `Digit${key}`, keyCode: 48 + Number(key), altKey: true, metaKey: mac, ctrlKey: !mac });
  return ed.view.someProp('handleKeyDown', (handler) => handler(ed.view, event)) ?? false;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('Notion block shortcuts', () => {
  it.each([
    ['4', '- [ ] Text\n'],
    ['5', '- Text\n'],
    ['6', '1. Text\n'],
    ['8', '```\nText\n```\n'],
    ['9', '> [!NOTE]\n> Text\n'],
    ['1', '# Text\n'],
    ['3', '### Text\n'],
  ])('⌘⌥%s turns a paragraph into its block type, and nothing else', (key, expected) => {
    const { ed, markdown } = setup('Text\n');
    expect(press(ed, key)).toBe(true);
    expect(markdown()).toBe(expected);
  });

  it('turns a bulleted list into a numbered one, then back into text', () => {
    const { ed, markdown } = setup('- Text\n');
    press(ed, '6');
    expect(markdown()).toBe('1. Text\n');
    press(ed, '0');
    expect(markdown()).toBe('Text\n');
  });
});
