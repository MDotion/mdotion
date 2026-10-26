import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { joinFrontMatter, splitFrontMatter } from '../../../src/markdown/FrontMatter';
import type { MarkdownAdapter, SourceMap } from '../../../src/markdown/MarkdownAdapter';
import { setSourceMap } from '../editor/adapter';
import {
  PROTOCOL_VERSION,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
} from '../../../src/shared/messages';

const FLUSH_DELAY_MS = 300;
/** Transaction meta marking changes that come from the host, not from the user. */
export const EXTERNAL_META = 'mdotionExternal';

export interface SyncState {
  status: 'loading' | 'ready';
  fileName: string;
  documentDirUri: string;
  frontMatter: string | null;
  /** Text of the user's changes that could not be applied, if any. */
  conflict: string | null;
  error: string | null;
}

/**
 * Keeps the Tiptap document and the host TextDocument in sync.
 *
 * - Local edits are serialized (debounced) and sent as whole-text edits.
 * - External changes are applied as a minimal ProseMirror replace step, so the
 *   cursor, selection and undo history stay where they are.
 * - Blocks the user did not touch are written back byte for byte (SourceMap).
 */
export class EditorSync {
  private map: SourceMap | null = null;
  private frontMatter: string | null = null;
  private hostVersion = 0;
  /** What the host document contains once our sent edits are applied. */
  private syncedText = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: SyncState = {
    status: 'loading',
    fileName: '',
    documentDirUri: '',
    frontMatter: null,
    conflict: null,
    error: null,
  };
  private readonly listeners = new Set<(state: SyncState) => void>();

  constructor(
    private readonly editor: Editor,
    private readonly adapter: MarkdownAdapter,
    private readonly post: (message: WebviewToHostMessage) => void,
  ) {
    editor.on('update', ({ transaction }) => {
      if (!transaction.getMeta(EXTERNAL_META)) {
        this.schedule();
      }
    });
  }

  start(): void {
    this.post({ type: 'ready', protocolVersion: PROTOCOL_VERSION });
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  handleMessage(message: HostToWebviewMessage): void {
    switch (message.type) {
      case 'init':
        this.cancelTimer();
        this.hostVersion = message.version;
        this.syncedText = message.text;
        this.load(message.text, true);
        this.setState({
          status: 'ready',
          fileName: message.fileName,
          documentDirUri: message.documentDirUri,
          conflict: null,
          error: null,
        });
        break;
      case 'update':
        this.onExternalUpdate(message.text, message.version);
        break;
      case 'conflict':
        this.setState({ conflict: message.rejectedText });
        break;
      case 'error':
        this.setState({ error: message.message });
        break;
    }
  }

  /** Sends pending local changes now (before save, on blur, on hide). */
  flush(): void {
    this.cancelTimer();
    if (this.state.status !== 'ready') {
      return;
    }
    const text = this.currentText();
    if (text === this.syncedText) {
      return;
    }
    this.syncedText = text;
    this.post({ type: 'edit', text, baseVersion: this.hostVersion });
  }

  setFrontMatter(frontMatter: string | null): void {
    this.frontMatter = frontMatter;
    this.setState({ frontMatter });
    this.flush();
  }

  /** Re-applies the user's rejected changes on top of the current document. */
  restoreConflict(): void {
    const text = this.state.conflict;
    this.setState({ conflict: null });
    if (text !== null) {
      this.load(text, false);
      this.flush();
    }
  }

  dismissConflict(): void {
    this.setState({ conflict: null });
  }

  dismissError(): void {
    this.setState({ error: null });
  }

  /** Markdown of the whole document as it would be written to disk. */
  currentText(): string {
    return joinFrontMatter(this.frontMatter, this.adapter.serialize(this.editor.state.doc, this.map));
  }

  private onExternalUpdate(text: string, version: number): void {
    this.hostVersion = version;
    if (text === this.syncedText) {
      return;
    }
    if (this.timer) {
      // Unsent local changes would be overwritten: keep them recoverable.
      const mine = this.currentText();
      this.cancelTimer();
      if (mine !== text) {
        this.setState({ conflict: mine });
      }
    }
    this.syncedText = text;
    this.load(text, true);
  }

  /** Replaces the editor content with `text`, touching only the blocks that differ. */
  private load(text: string, external: boolean): void {
    const { frontMatter, body } = splitFrontMatter(text);
    this.frontMatter = frontMatter;
    if (this.state.frontMatter !== frontMatter) {
      this.setState({ frontMatter });
    }

    const parsed = this.adapter.parse(body);
    const { state, view } = this.editor;
    const tr = state.tr;
    const range = diffRange(state.doc, parsed.doc);
    if (range) {
      tr.replace(range.from, range.toA, parsed.doc.slice(range.from, range.toB));
    }
    if (external) {
      tr.setMeta('addToHistory', false).setMeta(EXTERNAL_META, true);
    }
    if (tr.docChanged) {
      view.dispatch(tr);
    }
    parsed.map.bind(this.editor.state.doc, parsed.doc);
    this.map = parsed.map;
    setSourceMap(parsed.map);
  }

  private schedule(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  private cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

function diffRange(a: PMNode, b: PMNode): { from: number; toA: number; toB: number } | null {
  const from = a.content.findDiffStart(b.content);
  if (from === null) {
    return null;
  }
  const end = a.content.findDiffEnd(b.content);
  let toA = end ? end.a : a.content.size;
  let toB = end ? end.b : b.content.size;
  const overlap = from - Math.min(toA, toB);
  if (overlap > 0) {
    toA += overlap;
    toB += overlap;
  }
  return { from, toA, toB };
}
