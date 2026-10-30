import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { isMac } from '../lib/env';
import { shortcutLabel } from '../lib/shortcuts';
import { onUiEvent } from '../lib/uiEvents';
import {
  currentMatch,
  isValidQuery,
  matchesOf,
  nearestMatch,
  replaceEverything,
  replaceOne,
  selectMatch,
  setQuery,
  step,
  unsearchedMatches,
  type FindOptions,
} from '../editor/search/Search';
import { CHEVRON } from './OutlinePanel';

interface FindBarProps {
  editor: Editor;
  frontMatter: string | null;
  /** The Changes view is open: the editor is hidden, so Find waits. */
  disabled: boolean;
}

interface Counts {
  total: number;
  current: number;
  raw: number;
  properties: number;
}

const EMPTY_COUNTS: Counts = { total: 0, current: -1, raw: 0, properties: 0 };

const icon = (path: string) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ARROW_UP = icon('M8 12.5v-9M4 7.5l4-4 4 4');
const ARROW_DOWN = icon('M8 3.5v9M4 8.5l4 4 4-4');
const CLOSE = icon('M4.5 4.5l7 7M11.5 4.5l-7 7');

/** Text selected in the editor, when it can seed the query (one short line). */
function selectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    return '';
  }
  const text = editor.state.doc.textBetween(from, to, '\n');
  return text.includes('\n') || text.length > 200 ? '' : text;
}

function toggleKey(event: React.KeyboardEvent): 'caseSensitive' | 'wholeWord' | 'regexp' | null {
  const modifiers = isMac ? event.metaKey && event.altKey : event.altKey && !event.ctrlKey && !event.metaKey;
  if (!modifiers) {
    return null;
  }
  return ({ KeyC: 'caseSensitive', KeyW: 'wholeWord', KeyR: 'regexp' } as const)[event.code as 'KeyC' | 'KeyW' | 'KeyR'] ?? null;
}

/**
 * Find and Replace (Cmd+F, Cmd+Alt+F / Ctrl+H), floating under the top bar like
 * VS Code's. Matches in folded sections count, and going to one unfolds it.
 */
export function FindBar({ editor, frontMatter, disabled }: FindBarProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState<FindOptions>({ search: '', replace: '', caseSensitive: false, wholeWord: false, regexp: false });
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [replaced, setReplaced] = useState<number | null>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  /** Where the caret was when the bar opened: typing finds the first match from there. */
  const origin = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const openRef = useRef(open);
  openRef.current = open;

  const recount = () => {
    const matches = matchesOf(editor.state);
    const hidden = unsearchedMatches(editor.state.doc, frontMatter, optionsRef.current);
    setCounts({ total: matches.length, current: currentMatch(editor.state, matches), ...hidden });
  };
  const recountRef = useRef(recount);
  recountRef.current = recount;

  // Every open applies the query; closing clears the highlights.
  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery(editor.view, options);
    recount();
  }, [open, options, editor]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let frame = 0;
    const onTransaction = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => recountRef.current());
    };
    editor.on('transaction', onTransaction);
    return () => {
      cancelAnimationFrame(frame);
      editor.off('transaction', onTransaction);
    };
  }, [open, editor]);

  useEffect(
    () =>
      onUiEvent('command', (command) => {
        if (disabled || (command !== 'find' && command !== 'replace' && command !== 'findNext' && command !== 'findPrevious')) {
          return;
        }
        if (command === 'findNext' || command === 'findPrevious') {
          if (!openRef.current) {
            setOpen(true);
            origin.current = editor.state.selection.from;
          }
          requestAnimationFrame(() => {
            step(editor.view, command === 'findNext' ? 1 : -1);
            recountRef.current();
          });
          return;
        }
        const seed = selectedText(editor);
        origin.current = editor.state.selection.from;
        if (seed) {
          setOptions((previous) => ({ ...previous, search: seed }));
        }
        setOpen(true);
        if (command === 'replace') {
          setShowReplace(true);
        }
        requestAnimationFrame(() => {
          const input = command === 'replace' && seed ? replaceRef.current : findRef.current;
          input?.focus();
          input?.select();
        });
      }),
    [editor, disabled],
  );

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open) {
      setQuery(editor.view, null);
    }
  }, [open, editor]);

  if (!open) {
    return null;
  }

  const update = (patch: Partial<FindOptions>, jump: boolean) => {
    const next = { ...options, ...patch };
    setOptions(next);
    setReplaced(null);
    if (jump) {
      // Apply now, so the first match can be selected while typing (incremental search).
      setQuery(editor.view, next);
      const match = nearestMatch(editor.state, origin.current);
      if (match) {
        selectMatch(editor.view, match);
      }
    }
  };

  const close = () => {
    setOpen(false);
    editor.view.focus();
  };

  const go = (direction: 1 | -1) => {
    step(editor.view, direction);
    recount();
  };

  const onKeyDown = (event: React.KeyboardEvent, field: 'find' | 'replace') => {
    const toggle = toggleKey(event);
    if (toggle) {
      event.preventDefault();
      update({ [toggle]: !options[toggle] }, true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Enter' && field === 'find') {
      event.preventDefault();
      go(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Enter' && field === 'replace') {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        setReplaced(replaceEverything(editor.view));
      } else {
        replaceOne(editor.view);
      }
      recount();
    }
  };

  const valid = !options.search || isValidQuery(options);
  const status = !options.search
    ? ''
    : !valid
      ? 'Invalid regular expression'
      : counts.total === 0
        ? 'No results'
        : counts.current === -1
          ? `${counts.total} ${counts.total === 1 ? 'result' : 'results'}`
          : `${counts.current + 1} of ${counts.total}`;
  const elsewhere = [
    counts.raw > 0 ? `${counts.raw} in raw Markdown` : '',
    counts.properties > 0 ? `${counts.properties} in the properties` : '',
  ].filter(Boolean);

  const optionButton = (key: 'caseSensitive' | 'wholeWord' | 'regexp', label: string, title: string, shortcut: string) => (
    <button
      type="button"
      className={`mdotion-find-option${options[key] ? ' is-active' : ''}`}
      aria-pressed={options[key]}
      title={`${title} (${shortcutLabel(shortcut)})`}
      onClick={() => update({ [key]: !options[key] }, true)}
    >
      {label}
    </button>
  );

  return (
    <div
      className="mdotion-popover mdotion-find"
      role="search"
      aria-label="Find and replace"
      // The buttons keep the focus in the field, so Esc, Enter and the toggles keep working.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="button"
        className={`mdotion-find-expand${showReplace ? ' is-open' : ''}`}
        aria-label={showReplace ? 'Hide replace' : 'Show replace'}
        aria-expanded={showReplace}
        title={`Toggle replace (${shortcutLabel('replace')})`}
        onClick={() => setShowReplace((value) => !value)}
      >
        {CHEVRON}
      </button>
      <div className="mdotion-find-rows">
        <div className="mdotion-find-row">
          <div className={`mdotion-find-field${valid ? '' : ' is-invalid'}`}>
            <input
              ref={findRef}
              autoFocus
              className="mdotion-find-input"
              placeholder="Find"
              aria-label="Find"
              spellCheck={false}
              value={options.search}
              onChange={(event) => update({ search: event.target.value }, true)}
              onKeyDown={(event) => onKeyDown(event, 'find')}
            />
            {optionButton('caseSensitive', 'Aa', 'Match case', 'matchCase')}
            {optionButton('wholeWord', 'ab', 'Match whole word', 'wholeWord')}
            {optionButton('regexp', '.*', 'Use regular expression', 'regexp')}
          </div>
          <div className="mdotion-find-actions">
            <span className="mdotion-find-status" aria-live="polite" title={elsewhere.length > 0 ? `Not searched: ${elsewhere.join(', ')}` : undefined}>
              {replaced !== null ? `${replaced} replaced` : status}
              {elsewhere.length > 0 && replaced === null ? <span className="mdotion-find-elsewhere"> +{counts.raw + counts.properties}</span> : null}
            </span>
            <button type="button" className="mdotion-find-button" aria-label="Previous match" title={`Previous match (${shortcutLabel('findPrevious')}, ⇧Enter)`} disabled={counts.total === 0} onClick={() => go(-1)}>
              {ARROW_UP}
            </button>
            <button type="button" className="mdotion-find-button" aria-label="Next match" title={`Next match (${shortcutLabel('findNext')}, Enter)`} disabled={counts.total === 0} onClick={() => go(1)}>
              {ARROW_DOWN}
            </button>
            <button type="button" className="mdotion-find-button" aria-label="Close" title="Close (Esc)" onClick={close}>
              {CLOSE}
            </button>
          </div>
        </div>
        {showReplace ? (
          <div className="mdotion-find-row">
            <div className="mdotion-find-field">
              <input
                ref={replaceRef}
                className="mdotion-find-input"
                placeholder="Replace"
                aria-label="Replace"
                spellCheck={false}
                value={options.replace}
                onChange={(event) => update({ replace: event.target.value }, false)}
                onKeyDown={(event) => onKeyDown(event, 'replace')}
              />
            </div>
            <div className="mdotion-find-actions">
              <button
                type="button"
                className="mdotion-find-text-button"
                title="Replace (Enter)"
                disabled={counts.total === 0}
                onClick={() => {
                  replaceOne(editor.view);
                  recount();
                }}
              >
                Replace
              </button>
              <button
                type="button"
                className="mdotion-find-text-button"
                title={`Replace all (${shortcutLabel('replaceAll')})`}
                disabled={counts.total === 0}
                onClick={() => {
                  setReplaced(replaceEverything(editor.view));
                  recount();
                }}
              >
                Replace all
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
