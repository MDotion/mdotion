import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';
import { setKeptAsText } from './keptAsText';

export type EditorKind = 'visual' | 'source';

function isKind(tab: vscode.Tab | undefined, uri: vscode.Uri, kind: EditorKind): boolean {
  const input = tab?.input;
  if (kind === 'visual') {
    return (
      input instanceof vscode.TabInputCustom &&
      input.viewType === MarkdownEditorProvider.viewType &&
      input.uri.toString() === uri.toString()
    );
  }
  return input instanceof vscode.TabInputText && input.uri.toString() === uri.toString();
}

/**
 * Shows `uri` in the `target` editor in place of the other one, so switching
 * between the Notion view and the Markdown source never piles up tabs.
 */
export async function switchEditor(uri: vscode.Uri, target: EditorKind): Promise<void> {
  const group = vscode.window.tabGroups.activeTabGroup;
  const source: EditorKind = target === 'visual' ? 'source' : 'visual';
  const editorId = target === 'visual' ? MarkdownEditorProvider.viewType : 'default';
  setKeptAsText(uri, target === 'source');

  if (isKind(group.activeTab, uri, source)) {
    try {
      // What "Reopen Editor With…" runs: replaces the editor in place and keeps unsaved changes.
      // Closing the old tab through the API instead would revert a dirty custom editor.
      await vscode.commands.executeCommand('reopenActiveEditorWith', editorId);
      return;
    } catch {
      // Older or forked IDEs without the command: fall through.
    }
  }

  const column = group.viewColumn;
  const hadPrevious = group.tabs.some((tab) => isKind(tab, uri, source));
  await vscode.commands.executeCommand('vscode.openWith', uri, editorId, {
    viewColumn: column,
    preview: false,
  });
  if (hadPrevious) {
    await closeOldTab(column, uri, source);
  }
}

/**
 * Closes the tab the switch replaced. Cursor has no "reopenActiveEditorWith", and right after
 * the open its tab objects can lag behind the editors: closing one then throws "Tab close:
 * Invalid tab not found!". So the tab is read again on every attempt.
 */
async function closeOldTab(
  column: vscode.ViewColumn | undefined,
  uri: vscode.Uri,
  kind: EditorKind,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const tab = (
      vscode.window.tabGroups.all.find((group) => group.viewColumn === column)?.tabs ?? []
    ).find((candidate) => isKind(candidate, uri, kind));
    const document = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.toString() === uri.toString(),
    );
    if (!tab || document?.isDirty) {
      return;
    }
    try {
      await vscode.window.tabGroups.close(tab, true);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
