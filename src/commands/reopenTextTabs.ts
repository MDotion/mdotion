import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';
import { isMarkdown } from './activeMarkdown';
import { isDefaultEditor } from './defaultEditor';
import { isKeptAsText } from './keptAsText';
import { switchEditor } from './switchEditor';

/** Files on disk only: `git:` and other virtual documents (Open File at HEAD, …) stay as text. */
const SCHEMES = new Set(['file', 'vscode-remote']);
/** A text tab opening this close to the visual one closing is a deliberate "Reopen Editor With…". */
const REPLACED_MS = 500;
const SETTLE_MS = 150;

/**
 * Other extensions (the links of AI chats, task runners) open files with `showTextDocument`,
 * which skips the user's editor associations. When MDotion is the default Markdown editor,
 * a Markdown file they open that way is reopened in the visual editor.
 *
 * It stays in the text editor when it was opened at a line (search results, Problems,
 * `file.md:42` links), has unsaved changes, or the user switched it to the source.
 */
export function registerReopenTextTabs(): vscode.Disposable {
  const visualClosedAt = new Map<string, number>();

  return vscode.window.tabGroups.onDidChangeTabs((event) => {
    const now = Date.now();
    for (const tab of event.closed) {
      if (
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.viewType === MarkdownEditorProvider.viewType
      ) {
        visualClosedAt.set(tab.input.uri.toString(), now);
      }
    }
    for (const tab of event.opened) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText && isEnabled() && isCandidate(input.uri)) {
        // Checked once the editor shows: the visual tab can close just before or just after.
        const replaced = () =>
          Math.abs(Date.now() - (visualClosedAt.get(input.uri.toString()) ?? 0)) < REPLACED_MS;
        void reopen(input.uri, replaced);
      }
    }
  });
}

function isEnabled(): boolean {
  return (
    vscode.workspace.getConfiguration('mdotion').get<boolean>('reopenTextTabs', true) &&
    isDefaultEditor()
  );
}

function isCandidate(uri: vscode.Uri): boolean {
  return SCHEMES.has(uri.scheme) && isMarkdown(uri) && !isKeptAsText(uri);
}

async function reopen(uri: vscode.Uri, replaced: () => boolean): Promise<void> {
  const editor = await activeTextEditorFor(uri);
  // Lets the opener set its selection, and a replaced visual tab close, before deciding.
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  if (!editor || replaced() || editor.document.isDirty || !isAtStart(editor.selection)) {
    return;
  }
  await switchEditor(uri, 'visual');
}

function isAtStart(selection: vscode.Selection): boolean {
  return selection.isEmpty && selection.active.line === 0 && selection.active.character === 0;
}

/**
 * The text editor of `uri` once it is active. A new tab is not active yet when it is reported,
 * and one opened in the background never becomes active: it is left alone.
 */
function activeTextEditorFor(uri: vscode.Uri): Promise<vscode.TextEditor | undefined> {
  const matches = (editor: vscode.TextEditor | undefined) =>
    editor?.document.uri.toString() === uri.toString();
  if (matches(vscode.window.activeTextEditor)) {
    return Promise.resolve(vscode.window.activeTextEditor);
  }
  return new Promise((resolve) => {
    const done = (editor: vscode.TextEditor | undefined) => {
      clearTimeout(timer);
      listener.dispose();
      resolve(editor);
    };
    const timer = setTimeout(() => done(undefined), 1000);
    const listener = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (matches(editor)) {
        done(editor);
      }
    });
  });
}
