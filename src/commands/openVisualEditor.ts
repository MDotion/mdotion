import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';
import { getActiveMarkdown } from './activeMarkdown';

export async function openVisualEditor(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? getActiveMarkdown()?.uri ?? (await pickMarkdownFile());
  if (!target) {
    return;
  }
  try {
    await vscode.commands.executeCommand('vscode.openWith', target, MarkdownEditorProvider.viewType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Mdotion could not open the visual editor: ${message}`);
  }
}

async function pickMarkdownFile(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { Markdown: ['md', 'markdown'] },
  });
  return picked?.[0];
}
