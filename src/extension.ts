import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/MarkdownEditorProvider';
import { openVisualEditor } from './commands/openVisualEditor';
import { openSource } from './commands/openSource';
import { toggleEditor } from './commands/toggleEditor';
import { getActiveMarkdown } from './commands/activeMarkdown';
import { copyMarkdown } from './commands/copyMarkdown';
import { registerDefaultEditorPrompt, setDefaultEditor } from './commands/defaultEditor';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownEditorProvider(context.extensionUri, context.globalState);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'mdotion.toggleEditor';
  const refreshStatus = () => {
    const active = getActiveMarkdown();
    if (!active) {
      status.hide();
      return;
    }
    status.text = active.inVisualEditor ? '$(code) Markdown' : '$(book) Mdotion';
    status.tooltip = active.inVisualEditor ? 'Show the Markdown source' : 'Open in the Mdotion visual editor';
    status.show();
  };
  refreshStatus();

  context.subscriptions.push(
    status,
    vscode.window.tabGroups.onDidChangeTabs(refreshStatus),
    vscode.window.onDidChangeActiveTextEditor(refreshStatus),
    vscode.window.registerCustomEditorProvider(MarkdownEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true, enableFindWidget: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    // Edits typed just before Cmd+S may still be in flight from the webview.
    vscode.workspace.onWillSaveTextDocument((event) => {
      event.waitUntil(provider.whenIdle(event.document).then(() => []));
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mdotion.theme')) {
        provider.broadcastTheme();
      }
    }),
    vscode.commands.registerCommand('mdotion.openVisualEditor', openVisualEditor),
    vscode.commands.registerCommand('mdotion.openSource', openSource),
    vscode.commands.registerCommand('mdotion.toggleEditor', toggleEditor),
    vscode.commands.registerCommand('mdotion.copyMarkdown', (uri?: vscode.Uri) => copyMarkdown(provider, uri)),
    vscode.commands.registerCommand('mdotion.useAsDefault', () => setDefaultEditor(true)),
    vscode.commands.registerCommand('mdotion.stopUsingAsDefault', () => setDefaultEditor(false)),
    registerDefaultEditorPrompt(context),
  );
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered in context.subscriptions.
}
