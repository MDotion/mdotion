import * as vscode from 'vscode';
import { getActiveMarkdown } from './activeMarkdown';

export async function openSource(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? getActiveMarkdown()?.uri;
  if (!target) {
    void vscode.window.showWarningMessage('MDotion: no Markdown file to open in source mode.');
    return;
  }
  await vscode.commands.executeCommand('vscode.openWith', target, 'default');
}
