import * as vscode from 'vscode';
import { getActiveMarkdown } from './activeMarkdown';
import { switchEditor } from './switchEditor';

/** Switches the active Markdown tab between the visual editor and the text editor, in place. */
export async function toggleEditor(uri?: vscode.Uri): Promise<void> {
  const active = getActiveMarkdown();
  const target = uri ?? active?.uri;
  if (!target) {
    void vscode.window.showWarningMessage('Mdotion: no Markdown file is active.');
    return;
  }
  const inVisual = active?.uri.toString() === target.toString() && active.inVisualEditor;
  await switchEditor(target, inVisual ? 'source' : 'visual');
}
