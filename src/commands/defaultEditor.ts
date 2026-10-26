import * as vscode from 'vscode';
import { MarkdownEditorProvider } from '../editor/MarkdownEditorProvider';
import { isMarkdown } from './activeMarkdown';
import { switchEditor } from './switchEditor';

const PATTERNS = ['*.md', '*.markdown'];
const PROMPT_STATE_KEY = 'mdotion.defaultEditorPrompt';
const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type PromptState = { never: true } | { nextAt: number };

/** True when `*.md` files open in MDotion (user or workspace `workbench.editorAssociations`). */
export function isDefaultEditor(): boolean {
  const associations = vscode.workspace.getConfiguration('workbench').get<Record<string, string>>('editorAssociations') ?? {};
  return PATTERNS.every((pattern) => associations[pattern] === MarkdownEditorProvider.viewType);
}

/** Adds or removes the MDotion association for Markdown files in the user settings. */
export async function setDefaultEditor(enable: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration('workbench');
  const associations = { ...(config.inspect<Record<string, string>>('editorAssociations')?.globalValue ?? {}) };
  for (const pattern of PATTERNS) {
    if (enable) {
      associations[pattern] = MarkdownEditorProvider.viewType;
    } else if (associations[pattern] === MarkdownEditorProvider.viewType) {
      delete associations[pattern];
    }
  }
  await config.update('editorAssociations', associations, vscode.ConfigurationTarget.Global);
  if (!enable && isDefaultEditor()) {
    void vscode.window.showInformationMessage(
      'MDotion is still the default for Markdown in this workspace (workspace setting "workbench.editorAssociations").',
    );
  }
}

/**
 * MDotion is installed as an optional editor so it never takes over Markdown
 * files unasked. The first time a Markdown file is opened as text, offer
 * (once, then at most weekly) to make it the default.
 */
export function registerDefaultEditorPrompt(context: vscode.ExtensionContext): vscode.Disposable {
  let askedThisSession = false;

  const maybeAsk = async (editor: vscode.TextEditor | undefined) => {
    if (askedThisSession || !editor || !isMarkdown(editor.document.uri) || isDefaultEditor()) {
      return;
    }
    const state = context.globalState.get<PromptState>(PROMPT_STATE_KEY);
    if (state && ('never' in state || Date.now() < state.nextAt)) {
      return;
    }
    askedThisSession = true;
    const choice = await vscode.window.showInformationMessage(
      'Open Markdown files in the MDotion visual editor by default?',
      'Use by default',
      'Not now',
      "Don't ask again",
    );
    if (choice === 'Use by default') {
      await setDefaultEditor(true);
      await context.globalState.update(PROMPT_STATE_KEY, { never: true });
      if (vscode.window.activeTextEditor?.document.uri.toString() === editor.document.uri.toString()) {
        await switchEditor(editor.document.uri, 'visual');
      }
    } else if (choice === "Don't ask again") {
      await context.globalState.update(PROMPT_STATE_KEY, { never: true });
    } else {
      await context.globalState.update(PROMPT_STATE_KEY, { nextAt: Date.now() + ASK_AGAIN_AFTER_MS });
    }
  };

  void maybeAsk(vscode.window.activeTextEditor);
  return vscode.window.onDidChangeActiveTextEditor((editor) => void maybeAsk(editor));
}
