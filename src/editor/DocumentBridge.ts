import {
  PROTOCOL_VERSION,
  type Baseline,
  type EditorCommand,
  type HostToWebviewMessage,
  type PageSettings,
  type Theme,
  type ViewState,
  type WebviewToHostMessage,
} from './protocol';

export interface DocumentBridgeHost {
  /** Current document text with LF line endings. */
  getText(): string;
  getVersion(): number;
  /** Replaces the document text (LF line endings); resolves to false if the IDE refused the edit. */
  applyText(text: string): Promise<boolean>;
  postMessage(message: HostToWebviewMessage): void;
  /** Static data for the `init` message. */
  getInitInfo(): { fileName: string; documentDirUri: string; settings: PageSettings; theme: Theme; viewState: ViewState };
  saveSettings?(settings: PageSettings): void;
  saveViewState?(viewState: ViewState): void;
  readClipboard?(): Promise<string>;
  setTheme?(theme: Theme): void;
  openLink?(href: string): void;
  switchToSource?(): void;
  copyMarkdown?(): void;
  /** Starts sending the HEAD version of the file through `onBaseline`. */
  requestBaseline?(): void;
  openTextDiff?(): void;
  openKeybindings?(): void;
}

/**
 * Keeps one webview in sync with one TextDocument. The TextDocument is the
 * source of truth; the webview sends whole-text edits and receives external
 * changes. No VS Code imports, so it can be unit-tested.
 *
 * Conflict rule: an edit is applied only if the webview had already seen the
 * latest external change (`baseVersion === lastSentVersion`). Our own edits
 * never move `lastSentVersion`, so a fast typist never conflicts with themself.
 */
export class DocumentBridge {
  private lastSentVersion = -1;
  /** Text produced by our last applied edit; used to recognise our own change events. */
  private ownText: string | null = null;
  private queue: Promise<void> = Promise.resolve();
  private ready = false;
  private disposed = false;

  constructor(private readonly host: DocumentBridgeHost) {}

  handleMessage(message: WebviewToHostMessage): void {
    if (this.disposed) {
      return;
    }
    switch (message.type) {
      case 'ready':
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          this.host.postMessage({
            type: 'error',
            message: `MDotion webview protocol ${message.protocolVersion} does not match host protocol ${PROTOCOL_VERSION}. Reload the window.`,
          });
          return;
        }
        this.ready = true;
        this.sendInit();
        break;
      case 'edit':
        this.enqueueEdit(message.text, message.baseVersion);
        break;
      case 'openLink':
        this.host.openLink?.(message.href);
        break;
      case 'switchToSource':
        this.host.switchToSource?.();
        break;
      case 'copyMarkdown':
        this.host.copyMarkdown?.();
        break;
      case 'saveSettings':
        this.host.saveSettings?.(message.settings);
        break;
      case 'setTheme':
        this.host.setTheme?.(message.theme);
        break;
      case 'saveViewState':
        this.host.saveViewState?.(message.viewState);
        break;
      case 'readClipboard':
        void this.host.readClipboard?.().then((text) => {
          if (!this.disposed) {
            this.host.postMessage({ type: 'clipboardText', text });
          }
        });
        break;
      case 'requestBaseline':
        this.host.requestBaseline?.();
        break;
      case 'openTextDiff':
        this.host.openTextDiff?.();
        break;
      case 'openKeybindings':
        this.host.openKeybindings?.();
        break;
    }
  }

  /** Forwards an IDE command (Toggle Outline, Find, Show Changes…) to the editor UI. */
  runCommand(command: EditorCommand): void {
    if (!this.disposed && this.ready) {
      this.host.postMessage({ type: 'command', command });
    }
  }

  /** The HEAD version of the file, for the Changes view. */
  onBaseline(baseline: Baseline): void {
    if (!this.disposed && this.ready) {
      this.host.postMessage({ type: 'baseline', baseline });
    }
  }

  /** Call when the `mdotion.theme` setting changes. */
  onThemeChanged(theme: Theme): void {
    if (!this.disposed && this.ready) {
      this.host.postMessage({ type: 'theme', theme });
    }
  }

  /** Call from `onDidChangeTextDocument` for this document. */
  onDocumentChanged(): void {
    if (this.disposed || !this.ready) {
      return;
    }
    const text = this.host.getText();
    if (this.ownText !== null && text === this.ownText) {
      return;
    }
    this.ownText = null;
    this.lastSentVersion = this.host.getVersion();
    this.host.postMessage({ type: 'update', text, version: this.lastSentVersion });
  }

  /** Resolves once every queued webview edit has been applied (used before save). */
  whenIdle(): Promise<void> {
    return this.queue;
  }

  dispose(): void {
    this.disposed = true;
  }

  private sendInit(): void {
    this.lastSentVersion = this.host.getVersion();
    this.ownText = null;
    this.host.postMessage({
      type: 'init',
      text: this.host.getText(),
      version: this.lastSentVersion,
      ...this.host.getInitInfo(),
    });
  }

  private enqueueEdit(text: string, baseVersion: number): void {
    this.queue = this.queue.then(() => this.applyEdit(text, baseVersion)).catch((error: unknown) => {
      this.host.postMessage({
        type: 'error',
        message: `MDotion could not apply the edit: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
  }

  private async applyEdit(text: string, baseVersion: number): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (baseVersion !== this.lastSentVersion) {
      this.host.postMessage({ type: 'conflict', rejectedText: text });
      return;
    }
    if (text === this.host.getText()) {
      return;
    }
    this.ownText = text;
    const ok = await this.host.applyText(text);
    if (!ok) {
      this.ownText = null;
      this.host.postMessage({ type: 'conflict', rejectedText: text });
      this.onDocumentChanged();
    }
  }
}
