import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';

export interface ActiveMarkdown {
  uri: vscode.Uri;
  inVisualEditor: boolean;
}

/**
 * The Markdown file of the active tab. `activeTextEditor` is undefined while a
 * custom editor (webview) is focused, so the tab input is the reliable source.
 */
export function getActiveMarkdown(): ActiveMarkdown | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom && input.viewType === MarkdownEditorProvider.viewType) {
    return { uri: input.uri, inVisualEditor: true };
  }
  if (input instanceof vscode.TabInputText && isMarkdown(input.uri)) {
    return { uri: input.uri, inVisualEditor: false };
  }
  const document = vscode.window.activeTextEditor?.document;
  if (document && (document.languageId === 'markdown' || isMarkdown(document.uri))) {
    return { uri: document.uri, inVisualEditor: false };
  }
  return undefined;
}

export function isMarkdown(uri: vscode.Uri): boolean {
  return /\.(md|markdown)$/i.test(uri.path);
}
