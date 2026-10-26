import * as vscode from 'vscode';
import type { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';
import { getActiveMarkdown } from './activeMarkdown';

/** Copies the whole Markdown file (front matter included), after pending visual edits are applied. */
export async function copyMarkdown(provider: MarkdownEditorProvider, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? getActiveMarkdown()?.uri;
  if (!target) {
    void vscode.window.showWarningMessage('Mdotion: no Markdown file is active.');
    return;
  }
  const document = await vscode.workspace.openTextDocument(target);
  await provider.whenIdle(document);
  await vscode.env.clipboard.writeText(document.getText());
  vscode.window.setStatusBarMessage('$(check) Markdown copied to the clipboard', 2500);
}
