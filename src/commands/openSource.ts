import * as vscode from 'vscode';
import { getActiveMarkdown } from './activeMarkdown';
import { setKeptAsText } from './keptAsText';

export async function openSource(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? getActiveMarkdown()?.uri;
  if (!target) {
    void vscode.window.showWarningMessage('MDotion: no Markdown file to open in source mode.');
    return;
  }
  setKeptAsText(target, true);
  await vscode.commands.executeCommand('vscode.openWith', target, 'default');
}
