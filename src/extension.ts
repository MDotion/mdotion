import * as vscode from 'vscode';
import { MarkdownEditorProvider } from './editor/MarkdownEditorProvider';
import { openVisualEditor } from './commands/openVisualEditor';
import { openSource } from './commands/openSource';
import { toggleEditor } from './commands/toggleEditor';
import { getActiveMarkdown } from './commands/activeMarkdown';
import { copyMarkdown } from './commands/copyMarkdown';
import { registerDefaultEditorPrompt, setDefaultEditor } from './commands/defaultEditor';
import { EDITOR_COMMANDS, type EditorCommand } from './shared/messages';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownEditorProvider(context.extensionUri, context.globalState, context.workspaceState);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = 'mdotion.toggleEditor';
  const refreshStatus = () => {
    const active = getActiveMarkdown();
    if (!active) {
      status.hide();
      return;
    }
    status.text = active.inVisualEditor ? '$(code) Markdown' : '$(book) MDotion';
    status.tooltip = active.inVisualEditor ? 'Show the Markdown source' : 'Open in the MDotion visual editor';
    status.show();
  };
  refreshStatus();

  context.subscriptions.push(
    status,
    vscode.window.tabGroups.onDidChangeTabs(refreshStatus),
    vscode.window.onDidChangeActiveTextEditor(refreshStatus),
    vscode.window.registerCustomEditorProvider(MarkdownEditorProvider.viewType, provider, {
      // The webview has its own Find and Replace (Cmd+F), which sees folded sections and can replace.
      webviewOptions: { retainContextWhenHidden: true, enableFindWidget: false },
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
    ...EDITOR_COMMANDS.map((command) => vscode.commands.registerCommand(`mdotion.${command}`, () => runInVisualEditor(provider, command))),
    vscode.commands.registerCommand('mdotion.useAsDefault', () => setDefaultEditor(true)),
    vscode.commands.registerCommand('mdotion.stopUsingAsDefault', () => setDefaultEditor(false)),
    registerDefaultEditorPrompt(context),
  );
}

function runInVisualEditor(provider: MarkdownEditorProvider, command: EditorCommand): void {
  if (!provider.runInActiveEditor(command)) {
    void vscode.window.showInformationMessage('MDotion: open a Markdown file in the visual editor first.');
  }
}

export function deactivate(): void {
  // Nothing to clean up: everything is registered in context.subscriptions.
}
