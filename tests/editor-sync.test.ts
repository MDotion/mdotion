import { Editor } from '@tiptap/core';
import { UndoRedo } from '@tiptap/extensions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import { DEFAULT_PAGE_SETTINGS, EMPTY_VIEW_STATE, type WebviewToHostMessage } from '../src/shared/messages';
import { EditorSync } from '../webview/src/sync/EditorSync';

const SOURCE = '---\ntitle: T\n---\n# Title\n\nFirst paragraph with snake_case.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nLast *one*\n';

function setup() {
  const extensions = [...getMdotionExtensions(), UndoRedo];
  const editor = new Editor({ extensions, element: document.createElement('div') });
  const posted: WebviewToHostMessage[] = [];
  const sync = new EditorSync(editor, new MarkdownAdapter(extensions, editor.schema), (m) => posted.push(m));
  sync.handleMessage({
    type: 'init',
    text: SOURCE,
    version: 1,
    fileName: 'a.md',
    documentDirUri: 'https://x/',
    settings: DEFAULT_PAGE_SETTINGS,
    theme: 'auto',
    viewState: EMPTY_VIEW_STATE,
  });
  return { editor, sync, posted };
}

/** Types `text` at `pos`, like the user would. */
function type(editor: Editor, pos: number, text: string): void {
  editor.view.dispatch(editor.state.tr.insertText(text, pos));
}

function textPos(editor: Editor, needle: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(needle)) {
      found = pos + node.text!.indexOf(needle);
    }
    return found < 0;
  });
  return found;
}

describe('EditorSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not write anything when a file is only opened', () => {
    const { sync, posted } = setup();
    vi.runAllTimers();
    sync.flush();
    expect(posted).toEqual([]);
    expect(sync.currentText()).toBe(SOURCE);
  });

  it('sends one debounced edit that only touches the changed block', () => {
    const { editor, posted } = setup();
    type(editor, textPos(editor, 'First') + 5, '!');
    type(editor, textPos(editor, 'First') + 6, '!');
    expect(posted).toEqual([]);
    vi.advanceTimersByTime(400);
    expect(posted).toEqual([
      { type: 'edit', baseVersion: 1, text: SOURCE.replace('First paragraph', 'First!! paragraph') },
    ]);
  });

  it('applies external changes without moving the caret or emitting an edit', () => {
    const { editor, sync, posted } = setup();
    const caret = textPos(editor, 'Last') + 2;
    editor.commands.setTextSelection(caret);
    sync.handleMessage({ type: 'update', version: 2, text: SOURCE.replace('# Title', '# Title changed') });
    expect(editor.state.doc.firstChild?.textContent).toBe('Title changed');
    expect(editor.state.selection.from).toBe(caret + ' changed'.length);
    vi.runAllTimers();
    expect(posted).toEqual([]);
    expect(sync.currentText()).toBe(SOURCE.replace('# Title', '# Title changed'));
  });

  it('bases later edits on the latest external version', () => {
    const { editor, sync, posted } = setup();
    sync.handleMessage({ type: 'update', version: 5, text: SOURCE.replace('Last', 'Final') });
    type(editor, textPos(editor, 'Final'), '>');
    sync.flush();
    expect(posted.at(-1)).toMatchObject({ type: 'edit', baseVersion: 5 });
    expect((posted.at(-1) as { text: string }).text).toContain('\\>Final *one*');
  });

  it('keeps unsent local changes recoverable when an external change arrives', () => {
    const { editor, sync } = setup();
    type(editor, textPos(editor, 'First'), 'Mine ');
    sync.handleMessage({ type: 'update', version: 2, text: SOURCE.replace('Last', 'Theirs') });
    const state = sync.getState();
    expect(state.conflict).toContain('Mine First paragraph');
    expect(editor.state.doc.textContent).toContain('Theirs');
    sync.restoreConflict();
    expect(editor.state.doc.textContent).toContain('Mine First paragraph');
  });

  it('does not let external updates enter the undo history', () => {
    const { editor, sync } = setup();
    sync.handleMessage({ type: 'update', version: 2, text: SOURCE.replace('Last', 'Changed') });
    editor.commands.undo();
    expect(editor.state.doc.textContent).toContain('Changed');
  });

  it('updates front matter without touching the body', () => {
    const { sync, posted } = setup();
    sync.setFrontMatter('---\ntitle: New\n---\n');
    expect(posted.at(-1)).toEqual({ type: 'edit', baseVersion: 1, text: SOURCE.replace('title: T', 'title: New') });
  });
});
