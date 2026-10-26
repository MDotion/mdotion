import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';

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

  const previous = group.tabs.find((tab) => isKind(tab, uri, source));
  await vscode.commands.executeCommand('vscode.openWith', uri, editorId, {
    viewColumn: group.viewColumn,
    preview: false,
  });
  const document = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (previous && !document?.isDirty) {
    await vscode.window.tabGroups.close(previous, true);
  }
}
