import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SETTINGS, parseHostMessage, type PageSettings, type Theme } from '../../src/shared/messages';
import { BlockHandle } from './components/BlockHandle';
import { BlockMarquee } from './components/BlockMarquee';
import { BubbleToolbar } from './components/BubbleToolbar';
import { LinkPopover } from './components/LinkPopover';
import { Properties } from './components/Properties';
import { TableMenu } from './components/TableMenu';
import { Topbar } from './components/Topbar';
import { initAdapter } from './editor/adapter';
import { createEditorExtensions } from './editor/extensions';
import { openLink, postToHost, setDocumentDirUri } from './lib/env';
import { applyTheme } from './lib/theme';
import { EditorSync, type SyncState } from './sync/EditorSync';

export function App(): React.ReactElement | null {
  const extensions = useMemo(() => createEditorExtensions(), []);
  const editor = useEditor({
    extensions,
    editorProps: {
      attributes: { class: 'mdotion-prose', spellcheck: 'true' },
    },
    shouldRerenderOnTransaction: false,
  });
  const sync = useMemo(
    () => (editor ? new EditorSync(editor, initAdapter(extensions, editor.schema), postToHost) : null),
    [editor, extensions],
  );
  const [state, setState] = useState<SyncState | null>(null);
  const [settings, setSettings] = useState<PageSettings>(DEFAULT_PAGE_SETTINGS);
  const [theme, setTheme] = useState<Theme>('auto');
  const [page, setPage] = useState<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!sync) {
      return;
    }
    const unsubscribe = sync.subscribe(setState);
    const onMessage = (event: MessageEvent) => {
      const message = parseHostMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === 'init') {
        setDocumentDirUri(message.documentDirUri);
        setSettings(message.settings);
        setTheme(message.theme);
      }
      if (message.type === 'theme') {
        setTheme(message.theme);
        return;
      }
      sync.handleMessage(message);
    };
    window.addEventListener('message', onMessage);
    sync.start();
    return () => {
      unsubscribe();
      window.removeEventListener('message', onMessage);
    };
  }, [sync]);

  useEffect(() => applyTheme(theme), [theme]);

  // Flush pending edits whenever the page may go away or a save is coming.
  useEffect(() => {
    if (!sync) {
      return;
    }
    const flush = () => sync.flush();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('blur', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sync]);

  useEffect(() => {
    if (!editor || !sync) {
      return;
    }
    const root = document.getElementById('root');
    if (!root) {
      return;
    }
    /**
     * VS Code forwards every key pressed in a webview to the workbench. Shortcuts the
     * editor handles must stop here, or Cmd+B would also toggle the sidebar, Cmd+Z
     * would also undo the TextDocument, Cmd+K/I would trigger Cursor's AI commands…
     */
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) {
        return;
      }
      const key = event.key.toLowerCase();
      // Save, close, switch view (⌘⌥M) and copy all (⌘⇧⌥C) are IDE commands: send pending edits first.
      if (key === 's' || key === 'w' || (event.altKey && (event.code === 'KeyM' || event.code === 'KeyC'))) {
        sync.flush();
        return;
      }
      const target = event.target as HTMLElement;
      const inTextField = !!target.closest?.('input, textarea, select');
      if (key === 'z' || key === 'y') {
        event.stopPropagation();
        if (!inTextField && !event.defaultPrevented) {
          // Never fall back to the browser's own contenteditable undo.
          event.preventDefault();
        }
        return;
      }
      if (event.defaultPrevented) {
        event.stopPropagation();
      }
    };
    /** VS Code opens every clicked <a> in the browser; inside the editor a click only places the caret. */
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.('a');
      if (!anchor) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const href = anchor.getAttribute('href');
      if (!href) {
        return;
      }
      const editableText =
        editor.isEditable &&
        editor.view.dom.contains(anchor) &&
        !anchor.closest('.mdotion-raw-preview, .mdotion-html-inline');
      if (!editableText || event.metaKey || event.ctrlKey) {
        openLink(href);
      }
    };
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('click', onClick);
    };
  }, [editor, sync]);

  if (!editor || !sync) {
    return null;
  }

  const updateSettings = (next: PageSettings) => {
    setSettings(next);
    postToHost({ type: 'saveSettings', settings: next });
  };

  const pageClass = [
    'mdotion-page',
    settings.fullWidth ? 'is-full-width' : '',
    settings.smallText ? 'is-small-text' : '',
    `is-font-${settings.font}`,
    state?.status === 'ready' ? '' : 'is-loading',
  ].join(' ');

  return (
    <div className="mdotion-app">
      <Topbar
        fileName={state?.fileName ?? ''}
        settings={settings}
        onSettingsChange={updateSettings}
        theme={theme}
        onThemeChange={(next) => {
          setTheme(next);
          postToHost({ type: 'setTheme', theme: next });
        }}
        onSwitchToSource={() => {
          sync.flush();
          postToHost({ type: 'switchToSource' });
        }}
        onCopyAll={() => {
          sync.flush();
          postToHost({ type: 'copyMarkdown' });
        }}
      />
      {state?.error ? (
        <div className="mdotion-banner is-error" role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={() => sync.dismissError()}>
            Dismiss
          </button>
        </div>
      ) : null}
      {state?.conflict !== null && state?.conflict !== undefined ? (
        <div className="mdotion-banner" role="alert">
          <span>
            The file changed outside this editor while you were typing, so your latest changes were not applied.
          </span>
          <button type="button" className="mdotion-button-primary" onClick={() => sync.restoreConflict()}>
            Restore my version
          </button>
          <button type="button" onClick={() => sync.dismissConflict()}>
            Keep file version
          </button>
        </div>
      ) : null}
      <main className="mdotion-scroller" ref={setScroller}>
        <div className={pageClass} ref={setPage}>
          <Properties frontMatter={state?.frontMatter ?? null} onChange={(fm) => sync.setFrontMatter(fm)} />
          <EditorContent editor={editor} className="mdotion-editor" />
          <div className="mdotion-page-tail" />
          <BlockHandle editor={editor} container={page} />
        </div>
      </main>
      <BlockMarquee editor={editor} container={scroller} />
      <BubbleToolbar editor={editor} />
      <LinkPopover editor={editor} />
      <TableMenu editor={editor} />
    </div>
  );
}
