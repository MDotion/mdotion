import type * as vscode from 'vscode';

/** Files the user switched to the Markdown source in this session: they stay in the text editor. */
const keptAsText = new Set<string>();

export function setKeptAsText(uri: vscode.Uri, keep: boolean): void {
  if (keep) {
    keptAsText.add(uri.toString());
  } else {
    keptAsText.delete(uri.toString());
  }
}

export function isKeptAsText(uri: vscode.Uri): boolean {
  return keptAsText.has(uri.toString());
}
