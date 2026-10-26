import { describe, expect, it } from 'vitest';
import { DocumentBridge, type DocumentBridgeHost } from '../src/editor/DocumentBridge';
import { DEFAULT_PAGE_SETTINGS, PROTOCOL_VERSION, type HostToWebviewMessage } from '../src/shared/messages';

/** In-memory TextDocument: applying an edit bumps the version and fires a change event, like VS Code. */
function createHost(initial: string) {
  let text = initial;
  let version = 1;
  const posted: HostToWebviewMessage[] = [];
  const applied: string[] = [];
  const themes: string[] = [];
  let bridge: DocumentBridge;
  const host: DocumentBridgeHost = {
    getText: () => text,
    getVersion: () => version,
    applyText: async (next) => {
      applied.push(next);
      text = next;
      version += 1;
      bridge.onDocumentChanged();
      return true;
    },
    postMessage: (message) => posted.push(message),
    getInitInfo: () => ({ fileName: 'a.md', documentDirUri: 'https://x/', settings: DEFAULT_PAGE_SETTINGS, theme: 'auto' }),
    setTheme: (theme) => themes.push(theme),
  };
  bridge = new DocumentBridge(host);
  return {
    bridge,
    posted,
    applied,
    themes,
    externalEdit(next: string) {
      text = next;
      version += 1;
      bridge.onDocumentChanged();
    },
    get text() {
      return text;
    },
  };
}

const ready = { type: 'ready', protocolVersion: PROTOCOL_VERSION } as const;

describe('DocumentBridge', () => {
  it('answers ready with the document and its version', () => {
    const doc = createHost('# Hi\n');
    doc.bridge.handleMessage(ready);
    expect(doc.posted).toEqual([
      {
        type: 'init',
        text: '# Hi\n',
        version: 1,
        fileName: 'a.md',
        documentDirUri: 'https://x/',
        settings: DEFAULT_PAGE_SETTINGS,
        theme: 'auto',
      },
    ]);
  });

  it('rejects a webview built for another protocol version', () => {
    const doc = createHost('');
    doc.bridge.handleMessage({ type: 'ready', protocolVersion: 1 });
    expect(doc.posted[0]?.type).toBe('error');
  });

  it('applies edits without echoing them back to the webview', async () => {
    const doc = createHost('a\n');
    doc.bridge.handleMessage(ready);
    doc.bridge.handleMessage({ type: 'edit', text: 'ab\n', baseVersion: 1 });
    await doc.bridge.whenIdle();
    expect(doc.text).toBe('ab\n');
    expect(doc.posted.map((m) => m.type)).toEqual(['init']);
  });

  it('accepts consecutive edits sent before the first one was applied (fast typing)', async () => {
    const doc = createHost('a\n');
    doc.bridge.handleMessage(ready);
    doc.bridge.handleMessage({ type: 'edit', text: 'ab\n', baseVersion: 1 });
    doc.bridge.handleMessage({ type: 'edit', text: 'abc\n', baseVersion: 1 });
    await doc.bridge.whenIdle();
    expect(doc.applied).toEqual(['ab\n', 'abc\n']);
    expect(doc.posted.some((m) => m.type === 'conflict')).toBe(false);
  });

  it('forwards external changes and rejects edits based on an older version', async () => {
    const doc = createHost('a\n');
    doc.bridge.handleMessage(ready);
    doc.externalEdit('external\n');
    expect(doc.posted.at(-1)).toEqual({ type: 'update', text: 'external\n', version: 2 });

    doc.bridge.handleMessage({ type: 'edit', text: 'stale\n', baseVersion: 1 });
    await doc.bridge.whenIdle();
    expect(doc.text).toBe('external\n');
    expect(doc.posted.at(-1)).toEqual({ type: 'conflict', rejectedText: 'stale\n' });

    doc.bridge.handleMessage({ type: 'edit', text: 'fresh\n', baseVersion: 2 });
    await doc.bridge.whenIdle();
    expect(doc.text).toBe('fresh\n');
  });

  it('reports an external change back to text it had written itself (undo in the source editor)', async () => {
    const doc = createHost('a\n');
    doc.bridge.handleMessage(ready);
    doc.bridge.handleMessage({ type: 'edit', text: 'b\n', baseVersion: 1 });
    await doc.bridge.whenIdle();
    doc.externalEdit('c\n');
    doc.externalEdit('b\n');
    expect(doc.posted.filter((m) => m.type === 'update').map((m) => (m as { text: string }).text)).toEqual(['c\n', 'b\n']);
  });

  it('persists the theme chosen in the webview and pushes setting changes to it', () => {
    const doc = createHost('a\n');
    doc.bridge.onThemeChanged('dark');
    expect(doc.posted).toEqual([]); // not ready yet
    doc.bridge.handleMessage(ready);
    doc.bridge.handleMessage({ type: 'setTheme', theme: 'light' });
    expect(doc.themes).toEqual(['light']);
    doc.bridge.onThemeChanged('dark');
    expect(doc.posted.at(-1)).toEqual({ type: 'theme', theme: 'dark' });
  });

  it('ignores messages after dispose', async () => {
    const doc = createHost('a\n');
    doc.bridge.handleMessage(ready);
    doc.bridge.dispose();
    doc.bridge.handleMessage({ type: 'edit', text: 'b\n', baseVersion: 1 });
    await doc.bridge.whenIdle();
    expect(doc.text).toBe('a\n');
  });
});
