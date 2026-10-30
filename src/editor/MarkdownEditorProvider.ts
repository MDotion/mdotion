import * as path from 'node:path';
import * as vscode from 'vscode';
import { copyMarkdown } from '../commands/copyMarkdown';
import { switchEditor } from '../commands/switchEditor';
import { BaselineWatcher } from '../git/baseline';
import { computeTextChange } from '../shared/textDiff';
import { DocumentBridge } from './DocumentBridge';
import {
  DEFAULT_PAGE_SETTINGS,
  pageSettingsSchema,
  parseWebviewMessage,
  themeSchema,
  viewStateSchema,
  type EditorCommand,
  type PageSettings,
  type Theme,
  type ViewState,
} from './protocol';
import { getWebviewHtml } from './WebviewFactory';

const SETTINGS_KEY = 'mdotion.pageSettings';
const VIEW_STATE_PREFIX = 'mdotion.viewState:';

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'mdotion.markdownEditor';

  /** Bridges of open MDotion panels, so saves can wait for pending edits. */
  private readonly bridges = new Map<string, Set<DocumentBridge>>();
  /** The bridge of the focused MDotion panel, for commands aimed at the editor UI. */
  private activeBridge: DocumentBridge | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
  ) {}

  private readSettings(): PageSettings {
    const parsed = pageSettingsSchema.safeParse(this.globalState.get(SETTINGS_KEY));
    return parsed.success ? parsed.data : DEFAULT_PAGE_SETTINGS;
  }

  /** Folded sections and column widths of one file, kept in the workspace state (ADR-009). */
  private readViewState(uri: vscode.Uri): ViewState {
    const parsed = viewStateSchema.safeParse(this.workspaceState.get(VIEW_STATE_PREFIX + uri.toString()));
    return parsed.success ? parsed.data : { folded: [], tableWidths: {} };
  }

  private writeViewState(uri: vscode.Uri, viewState: ViewState): void {
    const empty = viewState.folded.length === 0 && Object.keys(viewState.tableWidths).length === 0;
    void this.workspaceState.update(VIEW_STATE_PREFIX + uri.toString(), empty ? undefined : viewState);
  }

  /** The `mdotion.theme` setting (a user setting, so it applies to every window and file). */
  readTheme(): Theme {
    const parsed = themeSchema.safeParse(vscode.workspace.getConfiguration('mdotion').get('theme'));
    return parsed.success ? parsed.data : 'auto';
  }

  private writeTheme(theme: Theme): void {
    const config = vscode.workspace.getConfiguration('mdotion');
    // A workspace value would shadow a global one: update where the effective value lives.
    const target =
      config.inspect('theme')?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    void config.update('theme', theme, target);
  }

  /** Pushes the theme to every open MDotion panel (call on configuration change). */
  broadcastTheme(): void {
    const theme = this.readTheme();
    this.bridges.forEach((set) => set.forEach((bridge) => bridge.onThemeChanged(theme)));
  }

  /** Runs an editor UI command in the focused MDotion panel; false when none is focused. */
  runInActiveEditor(command: EditorCommand): boolean {
    if (!this.activeBridge) {
      return false;
    }
    this.activeBridge.runCommand(command);
    return true;
  }

  /** Lets `onWillSaveTextDocument` wait until queued webview edits reach the document. */
  whenIdle(document: vscode.TextDocument): Promise<void> {
    const bridges = this.bridges.get(document.uri.toString());
    return Promise.all([...(bridges ?? [])].map((bridge) => bridge.whenIdle())).then(() => undefined);
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const documentDir = vscode.Uri.joinPath(document.uri, '..');
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        documentDir,
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
      ],
    };
    webviewPanel.webview.html = getWebviewHtml(webviewPanel.webview, this.extensionUri);

    let baseline: BaselineWatcher | null = null;
    const bridge: DocumentBridge = new DocumentBridge({
      getText: () => normalizeEol(document.getText()),
      getVersion: () => document.version,
      applyText: (text) => applyText(document, text),
      postMessage: (message) => {
        void webviewPanel.webview.postMessage(message);
      },
      getInitInfo: () => ({
        fileName: path.basename(document.uri.path),
        documentDirUri: `${webviewPanel.webview.asWebviewUri(documentDir).toString()}/`,
        settings: this.readSettings(),
        theme: this.readTheme(),
        viewState: this.readViewState(document.uri),
      }),
      setTheme: (theme) => this.writeTheme(theme),
      saveSettings: (settings) => void this.globalState.update(SETTINGS_KEY, settings),
      saveViewState: (viewState) => this.writeViewState(document.uri, viewState),
      readClipboard: () => Promise.resolve(vscode.env.clipboard.readText()),
      openLink: (href) => void openLink(document, href),
      switchToSource: () => void switchEditor(document.uri, 'source'),
      copyMarkdown: () => void copyMarkdown(this, document.uri),
      requestBaseline: () => {
        baseline ??= new BaselineWatcher(document.uri, (next) => bridge.onBaseline(next));
        void baseline.refresh();
      },
      openTextDiff: () => {
        baseline ??= new BaselineWatcher(document.uri, (next) => bridge.onBaseline(next));
        void baseline.openTextDiff();
      },
      openKeybindings: () => void vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'mdotion.'),
    });

    if (webviewPanel.active) {
      this.activeBridge = bridge;
    }

    const key = document.uri.toString();
    const set = this.bridges.get(key) ?? new Set<DocumentBridge>();
    set.add(bridge);
    this.bridges.set(key, set);

    const subscriptions: vscode.Disposable[] = [
      webviewPanel.onDidChangeViewState(({ webviewPanel: panel }) => {
        if (panel.active) {
          this.activeBridge = bridge;
        } else if (this.activeBridge === bridge) {
          this.activeBridge = null;
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === key && event.contentChanges.length > 0) {
          bridge.onDocumentChanged();
        }
      }),
      webviewPanel.webview.onDidReceiveMessage((raw: unknown) => {
        const message = parseWebviewMessage(raw);
        if (!message) {
          console.warn('[mdotion] Ignored invalid webview message');
          return;
        }
        bridge.handleMessage(message);
      }),
    ];

    webviewPanel.onDidDispose(() => {
      if (this.activeBridge === bridge) {
        this.activeBridge = null;
      }
      bridge.dispose();
      baseline?.dispose();
      set.delete(bridge);
      if (set.size === 0) {
        this.bridges.delete(key);
      }
      subscriptions.forEach((subscription) => subscription.dispose());
    });
  }
}

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** Applies the smallest edit turning the document into `text` (LF), keeping its EOL style. */
async function applyText(document: vscode.TextDocument, text: string): Promise<boolean> {
  const target = document.eol === vscode.EndOfLine.CRLF ? text.replace(/\n/g, '\r\n') : text;
  const current = document.getText();
  const change = computeTextChange(current, target);
  if (!change) {
    return true;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(change.start), document.positionAt(change.oldEnd)),
    change.insert,
  );
  return vscode.workspace.applyEdit(edit);
}

/**
 * Opens a link clicked in the editor. Only web/mail links go to the browser;
 * relative paths open inside the IDE. Other schemes (command:, vscode:, …) are refused.
 */
async function openLink(document: vscode.TextDocument, href: string): Promise<void> {
  if (/^(https?:|mailto:)/i.test(href)) {
    await vscode.env.openExternal(vscode.Uri.parse(href));
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^file:/i.test(href)) {
    void vscode.window.showWarningMessage(`MDotion: links with this scheme are not opened (${href}).`);
    return;
  }
  const [rawPath, fragment] = href.split('#', 2);
  if (!rawPath) {
    return;
  }
  const documentDir = vscode.Uri.joinPath(document.uri, '..');
  let target: vscode.Uri;
  try {
    target = /^file:/i.test(rawPath)
      ? vscode.Uri.parse(rawPath)
      : rawPath.startsWith('/')
        ? vscode.Uri.joinPath(vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? documentDir, decodeURI(rawPath))
        : vscode.Uri.joinPath(documentDir, decodeURI(rawPath));
  } catch {
    void vscode.window.showWarningMessage(`MDotion: invalid link ${href}`);
    return;
  }
  try {
    const stat = await vscode.workspace.fs.stat(target);
    if (stat.type & vscode.FileType.Directory) {
      await vscode.commands.executeCommand('revealInExplorer', target);
      return;
    }
  } catch {
    void vscode.window.showWarningMessage(`MDotion: file not found: ${rawPath}`);
    return;
  }
  await vscode.commands.executeCommand('vscode.open', fragment ? target.with({ fragment }) : target);
}
