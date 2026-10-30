import { Selection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PageSettings, Theme } from '../../src/shared/messages';
import { DEFAULT_PAGE_SETTINGS, type EditorCommand } from '../../src/shared/protocolConstants';
import { changesModel, useChanges } from './changes/model';
import { BlockHandle } from './components/BlockHandle';
import { BlockMarquee } from './components/BlockMarquee';
import { BubbleToolbar } from './components/BubbleToolbar';
import { ChangesView } from './components/ChangesView';
import { FindBar } from './components/FindBar';
import { HeadingJump } from './components/HeadingJump';
import { LinkPopover } from './components/LinkPopover';
import { OutlinePanel } from './components/OutlinePanel';
import { Properties } from './components/Properties';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { TableControls } from './components/TableControls';
import { Topbar } from './components/Topbar';
import { initAdapter } from './editor/adapter';
import { createEditorExtensions } from './editor/extensions';
import { insertPlainText } from './editor/MarkdownClipboard';
import { foldAll, foldSectionAtCaret, revealPosition, toggleFoldAll, unfoldAll, unfoldSectionAtCaret } from './editor/outline/SectionFolding';
import { openLink, postToHost, setDocumentDirUri, toHostMessage } from './lib/env';
import { pageScroller, scrollToHeading } from './lib/scroll';
import { isIdeShortcut } from './lib/shortcuts';
import { applyTheme } from './lib/theme';
import { emitUiEvent } from './lib/uiEvents';
import { viewState } from './lib/viewState';
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
  const [settings, setSettings] = useState<PageSettings>({ ...DEFAULT_PAGE_SETTINGS });
  /** Latest settings, for commands coming from the IDE (handled outside React renders). */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [theme, setTheme] = useState<Theme>('auto');
  const [page, setPage] = useState<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  /** The Changes view, open on the top of the page (null) or on the first / last change. */
  const [review, setReview] = useState<{ startAt: 1 | -1 | null } | null>(null);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  /** Where the page was scrolled before the Changes view opened, restored when it closes. */
  const savedScroll = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const changes = useChanges(editor, sync);
  const changesAvailable = useChangesAvailable();

  const openReview = (startAt: 1 | -1 | null) => {
    if (!changesModel.available()) {
      setNotice('Changes are shown for files in a Git repository, compared with the last commit.');
      return;
    }
    if (!reviewRef.current) {
      savedScroll.current = pageScroller().scrollTop;
    }
    setReview({ startAt });
  };
  const closeReview = () => setReview(null);

  /** IDE commands aimed at the editor UI (Command Palette and rebindable shortcuts). */
  const runCommand = (command: EditorCommand) => {
    if (!editor) {
      return;
    }
    const reviewing = reviewRef.current !== null;
    switch (command) {
      case 'toggleOutline': {
        const next = { ...settingsRef.current, outline: !settingsRef.current.outline };
        setSettings(next);
        postToHost({ type: 'saveSettings', settings: next });
        return;
      }
      case 'goToHeading':
        if (!reviewing) {
          emitUiEvent('jumpToHeading', undefined);
        }
        return;
      case 'showChanges':
        if (reviewing) {
          closeReview();
        } else {
          openReview(null);
        }
        return;
      case 'nextChange':
      case 'previousChange':
        if (reviewing) {
          emitUiEvent('command', command);
        } else {
          openReview(command === 'nextChange' ? 1 : -1);
        }
        return;
      case 'foldSection':
      case 'unfoldSection':
      case 'toggleFoldAll':
      case 'foldAll':
      case 'unfoldAll':
        if (!reviewing) {
          ({ foldSection: foldSectionAtCaret, unfoldSection: unfoldSectionAtCaret, toggleFoldAll, foldAll, unfoldAll })[command](editor.view);
        }
        return;
      default:
        emitUiEvent('command', command);
    }
  };
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  // Back from the Changes view: the page is where it was.
  useLayoutEffect(() => {
    if (!review && savedScroll.current !== null) {
      pageScroller().scrollTop = savedScroll.current;
      savedScroll.current = null;
    }
  }, [review]);

  useEffect(() => {
    if (!sync) {
      return;
    }
    const unsubscribe = sync.subscribe(setState);
    const onMessage = (event: MessageEvent) => {
      const message = toHostMessage(event.data);
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
      if (message.type === 'clipboardText') {
        if (editor) {
          insertPlainText(editor.view, message.text);
        }
        return;
      }
      if (message.type === 'command') {
        runCommandRef.current(message.command);
        return;
      }
      if (message.type === 'baseline') {
        changesModel.setBaseline(message.baseline);
        return;
      }
      sync.handleMessage(message);
      if (message.type === 'init') {
        // After the document is loaded, so folded sections can be found by anchor.
        viewState.load(message.viewState);
        postToHost({ type: 'requestBaseline' });
      }
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
      // The IDE runs these (Find, Fold Section, Switch, Copy all…): no browser default, but the key
      // goes on to VS Code, with the pending edits sent first.
      if (isIdeShortcut(event)) {
        event.preventDefault();
        sync.flush();
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) {
        return;
      }
      const key = event.key.toLowerCase();
      // Save and close are IDE commands too: send pending edits first.
      if (key === 's' || key === 'w') {
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
    <div className={`mdotion-app${settings.outline ? ' has-outline' : ''}`}>
      <Topbar
        fileName={state?.fileName ?? ''}
        settings={settings}
        onSettingsChange={updateSettings}
        onToggleOutline={() => updateSettings({ ...settings, outline: !settings.outline })}
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
        onFind={() => runCommand('find')}
        changes={changesAvailable === null ? null : { available: changesAvailable, total: changes?.total ?? 0, open: review !== null }}
        onShowChanges={() => (review ? closeReview() : openReview(null))}
        onShowShortcuts={() => runCommand('showShortcuts')}
      />
      {notice ? (
        <div className="mdotion-banner" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
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
      {review ? (
        <ChangesView
          result={changes}
          baseline={changesModel.getBaseline()}
          pageClass={pageClass}
          startAt={review.startAt}
          onClose={closeReview}
          onLocate={(pos) => {
            savedScroll.current = null;
            setReview(null);
            requestAnimationFrame(() => locateBlock(editor, pos));
          }}
          onOpenTextDiff={() => postToHost({ type: 'openTextDiff' })}
        />
      ) : null}
      <div className={`mdotion-body${review ? ' is-hidden' : ''}`}>
        <main className="mdotion-scroller" ref={setScroller}>
          <div className={pageClass} ref={setPage}>
            <Properties frontMatter={state?.frontMatter ?? null} onChange={(fm) => sync.setFrontMatter(fm)} />
            <EditorContent editor={editor} className="mdotion-editor" />
            <div className="mdotion-page-tail" />
            <BlockHandle editor={editor} container={page} />
            <TableControls editor={editor} container={page} />
          </div>
        </main>
        {settings.outline && state?.status === 'ready' ? (
          <OutlinePanel editor={editor} onClose={() => updateSettings({ ...settings, outline: false })} />
        ) : null}
      </div>
      <BlockMarquee editor={editor} container={scroller} />
      <BubbleToolbar editor={editor} />
      <LinkPopover editor={editor} />
      <HeadingJump editor={editor} />
      <FindBar editor={editor} frontMatter={state?.frontMatter ?? null} disabled={review !== null} />
      <ShortcutsHelp editor={editor} />
    </div>
  );
}

/** Caret at the start of a block of the editor, scrolled below the top bar (from the Changes view). */
function locateBlock(editor: NonNullable<ReturnType<typeof useEditor>>, pos: number): void {
  const { view } = editor;
  if (pos > view.state.doc.content.size) {
    return;
  }
  revealPosition(view, pos);
  view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size)))));
  view.focus();
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    scrollToHeading(dom);
  }
}

/** Whether the file is in a Git repository: null until the host has answered. */
function useChangesAvailable(): boolean | null {
  const read = () => (changesModel.getBaseline() === null ? null : changesModel.available());
  const [available, setAvailable] = useState(read);
  useEffect(() => changesModel.onChange(() => setAvailable(read())), []);
  return available;
}
