import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Baseline } from '../../../src/shared/messages';
import { diffRows, layoutHunks, lineStats, type DiffItem } from '../changes/lineDiff';
import type { ChangesResult } from '../changes/model';
import { createReviewExtensions, hunksOf, reviewContent, reviewDecorations, reviewEntries, reviewKey } from '../changes/review';
import { scrollToHeading } from '../lib/scroll';
import { shortcutLabel } from '../lib/shortcuts';
import { onUiEvent } from '../lib/uiEvents';
import { SourceDiff } from './SourceDiff';

interface ChangesViewProps {
  result: ChangesResult | null;
  baseline: Baseline | null;
  pageClass: string;
  /** Start on the first (1) or last (-1) change instead of the top of the page. */
  startAt: 1 | -1 | null;
  onClose: () => void;
  /** Back to editing, with the caret on the block at this position of the editor document. */
  onLocate: (pos: number) => void;
  onOpenTextDiff: () => void;
}

type Mode = 'source' | 'rendered';

/** The tab last used, kept while the editor is open (like GitHub's Source / Rendered toggle). */
let lastMode: Mode = 'source';

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function ago(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relativeTime.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
}

const icon = (path: string) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The page compared with the last commit, read-only (ADR-010), in the two views
 * GitHub has for Markdown: Source, a unified diff of the file, and Rendered,
 * the formatted page with removed blocks in red and new ones in green.
 */
export function ChangesView({ result, baseline, pageClass, startAt, onClose, onLocate, onOpenTextDiff }: ChangesViewProps): React.ReactElement {
  const extensions = useMemo(() => createReviewExtensions(), []);
  const review = useEditor({
    extensions,
    editable: false,
    editorProps: { attributes: { class: 'mdotion-prose mdotion-review-prose' } },
    shouldRerenderOnTransaction: false,
  });
  const [mode, setMode] = useState<Mode>(lastMode);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [current, setCurrent] = useState<number | null>(null);
  const pendingStart = useRef(startAt);

  const rows = useMemo(() => (result ? diffRows(result.source.before, result.source.after) : []), [result]);
  const stats = useMemo(() => lineStats(rows), [rows]);
  const items = useMemo(() => layoutHunks(rows, expanded), [rows, expanded]);
  const entries = useMemo(() => reviewEntries(result?.changes ?? []), [result]);
  const frontMatterItems = useMemo<DiffItem[]>(() => {
    if (!result?.frontMatter) {
      return [];
    }
    const lines = diffRows(result.frontMatter.before ? `${result.frontMatter.before}\n` : '', result.frontMatter.after ? `${result.frontMatter.after}\n` : '');
    return lines.map((row, index) => ({ type: 'row', row, index }));
  }, [result]);

  const hunkCount = mode === 'source' ? items.filter((item) => item.type === 'hunk').length : hunksOf(entries).length;

  const goTo = (hunk: number) => {
    setCurrent(hunk);
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`.mdotion-review [data-hunk="${hunk}"]`);
      if (target) {
        scrollToHeading(target);
      }
    });
  };
  const step = (direction: 1 | -1) => {
    if (hunkCount === 0) {
      return;
    }
    const from = current ?? (direction === 1 ? -1 : hunkCount);
    goTo((from + direction + hunkCount) % hunkCount);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  const switchMode = (next: Mode) => {
    lastMode = next;
    setMode(next);
    setCurrent(null);
  };

  useEffect(() => {
    review?.commands.setContent(reviewContent(entries), { emitUpdate: false });
  }, [review, entries]);

  useEffect(() => {
    if (review) {
      review.view.dispatch(review.state.tr.setMeta(reviewKey, reviewDecorations(review.state.doc, entries, mode === 'rendered' ? current : null)));
    }
  }, [review, entries, current, mode]);

  // Opened with Next / Previous Change: go to the first (last) change once it is rendered.
  useEffect(() => {
    if (pendingStart.current !== null && review && hunkCount > 0) {
      const direction = pendingStart.current;
      pendingStart.current = null;
      goTo(direction === 1 ? 0 : hunkCount - 1);
    }
  }, [review, hunkCount]);

  useEffect(
    () =>
      onUiEvent('command', (command) => {
        if (command === 'nextChange') {
          stepRef.current(1);
        } else if (command === 'previousChange') {
          stepRef.current(-1);
        }
      }),
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const onRenderedClick = (event: React.MouseEvent) => {
    if (!window.getSelection()?.isCollapsed) {
      return;
    }
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]');
    const locate = element ? entries[Number(element.dataset.entry)]?.locate : null;
    if (locate !== null && locate !== undefined) {
      onLocate(locate);
    }
  };

  const empty = rows.length > 0 && stats.added === 0 && stats.removed === 0;

  return (
    <div className="mdotion-body mdotion-review">
      <div className="mdotion-changes-bar" role="toolbar" aria-label="Changes">
        <div className="mdotion-view-switch" role="tablist" aria-label="Diff view">
          <button type="button" role="tab" aria-selected={mode === 'source'} className={mode === 'source' ? 'is-active' : ''} onClick={() => switchMode('source')}>
            Source
          </button>
          <button type="button" role="tab" aria-selected={mode === 'rendered'} className={mode === 'rendered' ? 'is-active' : ''} onClick={() => switchMode('rendered')}>
            Rendered
          </button>
        </div>
        <div className="mdotion-changes-title">
          {baseline?.status === 'untracked' ? (
            <span>New file, not committed yet</span>
          ) : (
            <span>
              Since the last commit
              {baseline?.status === 'ok' ? (
                <>
                  {' '}
                  <code>{baseline.commit}</code>
                  {baseline.committedAt ? ` · ${ago(baseline.committedAt)}` : ''}
                </>
              ) : null}
            </span>
          )}
          <span className="mdotion-changes-stats" aria-label={`${stats.added} lines added, ${stats.removed} lines removed`}>
            <span className="is-add">+{stats.added}</span> <span className="is-del">−{stats.removed}</span>
          </span>
        </div>
        <div className="mdotion-changes-actions">
          <button
            type="button"
            className="mdotion-topbar-button mdotion-changes-step"
            title={`Previous change (${shortcutLabel('previousChange')})`}
            aria-label="Previous change"
            disabled={hunkCount === 0}
            onClick={() => step(-1)}
          >
            {icon('M8 12.5v-9M4 7.5l4-4 4 4')}
          </button>
          <span className="mdotion-changes-position">{hunkCount === 0 ? '0 of 0' : `${current === null ? '–' : current + 1} of ${hunkCount}`}</span>
          <button
            type="button"
            className="mdotion-topbar-button mdotion-changes-step"
            title={`Next change (${shortcutLabel('nextChange')})`}
            aria-label="Next change"
            disabled={hunkCount === 0}
            onClick={() => step(1)}
          >
            {icon('M8 3.5v9M4 8.5l4 4 4-4')}
          </button>
          {baseline?.status === 'ok' ? (
            <button type="button" className="mdotion-topbar-button" title="Open VS Code's diff editor" onClick={onOpenTextDiff}>
              Open in diff editor
            </button>
          ) : null}
          <button type="button" className="mdotion-button-primary" title="Back to editing (Esc)" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      {mode === 'source' ? (
        <main className="mdotion-sdiff-page">
          {empty ? (
            <p className="mdotion-changes-empty">No changes since the last commit.</p>
          ) : (
            <div className="mdotion-sdiff-file">
              <SourceDiff
                items={items}
                currentHunk={current}
                onExpand={(key) => {
                  setExpanded((previous) => new Set(previous).add(key));
                  setCurrent(null);
                }}
              />
            </div>
          )}
        </main>
      ) : null}
      <main className="mdotion-scroller" hidden={mode !== 'rendered'}>
        <div className={pageClass}>
          {frontMatterItems.length > 0 ? (
            <div className="mdotion-sdiff-file mdotion-changes-properties">
              <SourceDiff items={frontMatterItems} currentHunk={null} onExpand={() => undefined} />
            </div>
          ) : null}
          {empty ? <p className="mdotion-changes-empty">No changes since the last commit.</p> : null}
          <div className="mdotion-editor" onClick={onRenderedClick}>
            <EditorContent editor={review} />
          </div>
          <div className="mdotion-page-tail" />
        </div>
      </main>
    </div>
  );
}
