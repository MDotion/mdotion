import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { modKey } from '../lib/env';
import { depthOf, goToHeading, useActiveHeading, useOutline, visibleItems } from '../editor/outline/navigate';
import { setFolded, toggleFold } from '../editor/outline/SectionFolding';
import {
  contentEnd,
  ISSUE_MESSAGES,
  moveSection,
  moveSectionDown,
  moveSectionUp,
  type OutlineItem,
} from '../editor/outline/sections';

const DRAG_THRESHOLD = 4;

interface DragState {
  index: number;
  /** Visible row the section would be dropped before (rows.length = at the end), null when not allowed. */
  slot: number | null;
}

export const CHEVRON = (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function hasContent(editor: Editor, item: OutlineItem): boolean {
  const heading = editor.state.doc.nodeAt(item.pos);
  return !!heading && item.end > item.pos + heading.nodeSize;
}

/**
 * The document outline: click to jump, drag (or Alt+↑/↓) to move a whole
 * section, chevrons fold sections in the editor.
 */
export function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }): React.ReactElement {
  const { items, folded } = useOutline(editor);
  const rows = useMemo(() => visibleItems(items, folded), [items, folded]);
  const active = useActiveHeading(editor, rows, true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const focusAfterMove = useRef<number | null>(null);
  /** A drag ends with a click on the row: it must not also jump to the heading. */
  const suppressClick = useRef(false);
  const foldedSet = new Set(folded);

  useEffect(() => {
    const pos = focusAfterMove.current;
    if (pos === null) {
      return;
    }
    focusAfterMove.current = null;
    const item = items.find((candidate) => candidate.pos === pos);
    if (item) {
      rowRefs.current.get(item.index)?.querySelector<HTMLButtonElement>('.mdotion-outline-label')?.focus();
    }
  }, [items]);

  const dispatchMove = (tr: ReturnType<typeof moveSection>) => {
    if (!tr) {
      return;
    }
    focusAfterMove.current = tr.selection.from - 1;
    editor.view.dispatch(tr);
  };

  const slotTarget = (slot: number): number => (slot < rows.length ? rows[slot].pos : contentEnd(editor.state.doc));

  const slotAt = (dragged: OutlineItem, clientY: number): number | null => {
    let slot = rows.length;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rowRefs.current.get(rows[i].index)?.getBoundingClientRect();
      if (rect && clientY < rect.top + rect.height / 2) {
        slot = i;
        break;
      }
    }
    const target = slotTarget(slot);
    return target >= dragged.pos && target <= dragged.end ? null : slot;
  };

  const onPointerDown = (event: React.PointerEvent, item: OutlineItem) => {
    if (event.button !== 0) {
      return;
    }
    const startY = event.clientY;
    let dragging = false;
    let slot: number | null = null;
    const onMove = (move: PointerEvent) => {
      if (!dragging && Math.abs(move.clientY - startY) < DRAG_THRESHOLD) {
        return;
      }
      dragging = true;
      slot = slotAt(item, move.clientY);
      setDrag({ index: item.index, slot });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      suppressClick.current = dragging;
      if (dragging && slot !== null) {
        dispatchMove(moveSection(editor.state, items, item.index, slotTarget(slot)));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onKeyDown = (event: React.KeyboardEvent, item: OutlineItem, rowIndex: number) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      dispatchMove((event.key === 'ArrowUp' ? moveSectionUp : moveSectionDown)(editor.state, items, item.index));
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = rows[rowIndex + (event.key === 'ArrowUp' ? -1 : 1)];
      if (next) {
        rowRefs.current.get(next.index)?.querySelector<HTMLButtonElement>('.mdotion-outline-label')?.focus();
      }
      return;
    }
    if ((event.key === 'ArrowLeft' && !foldedSet.has(item.pos)) || (event.key === 'ArrowRight' && foldedSet.has(item.pos))) {
      if (hasContent(editor, item)) {
        event.preventDefault();
        toggleFold(editor.view, item.pos);
      }
    }
  };

  const foldAll = () => setFolded(editor.view, items.filter((item) => hasContent(editor, item)).map((item) => item.pos));
  const unfoldAll = () => setFolded(editor.view, []);

  return (
    <aside className={`mdotion-outline${drag ? ' is-dragging' : ''}`} aria-label="Outline">
      <div className="mdotion-outline-header">
        <span className="mdotion-outline-title">Outline</span>
        <button type="button" className="mdotion-outline-action" title="Fold all sections" aria-label="Fold all sections" onClick={foldAll} disabled={items.length === 0}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 6l4-3 4 3M4 10l4 3 4-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 8 8)" />
          </svg>
        </button>
        <button type="button" className="mdotion-outline-action" title="Unfold all sections" aria-label="Unfold all sections" onClick={unfoldAll} disabled={folded.length === 0}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 6l4-3 4 3M4 10l4 3 4-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="mdotion-outline-action" title="Close outline" aria-label="Close outline" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mdotion-outline-empty">Headings you add to this page appear here.</p>
      ) : (
        <div className="mdotion-outline-list" role="tree" aria-label="Sections">
          {rows.map((item, rowIndex) => {
            const isFolded = foldedSet.has(item.pos);
            const foldable = hasContent(editor, item);
            const depth = depthOf(items, item);
            const issues = item.issues.map((issue) => ISSUE_MESSAGES[issue]);
            const indicator = drag && drag.slot === rowIndex;
            return (
              <div
                key={item.pos}
                ref={(element) => {
                  if (element) {
                    rowRefs.current.set(item.index, element);
                  } else {
                    rowRefs.current.delete(item.index);
                  }
                }}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={foldable ? !isFolded : undefined}
                className={[
                  'mdotion-outline-row',
                  active === item.pos ? 'is-active' : '',
                  drag?.index === item.index ? 'is-dragged' : '',
                  indicator ? 'has-drop-before' : '',
                  drag && drag.slot === rows.length && rowIndex === rows.length - 1 ? 'has-drop-after' : '',
                ].join(' ')}
                style={{ paddingLeft: 4 + depth * 14 }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={`mdotion-outline-chevron${isFolded ? '' : ' is-open'}${foldable ? '' : ' is-hidden'}`}
                  aria-label={isFolded ? 'Unfold section' : 'Fold section'}
                  onClick={() => toggleFold(editor.view, item.pos)}
                >
                  {CHEVRON}
                </button>
                <button
                  type="button"
                  className={`mdotion-outline-label is-h${item.level}`}
                  title={`${item.text || 'Untitled'}\nDrag to move the section · Alt+↑/↓`}
                  onPointerDown={(event) => onPointerDown(event, item)}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    goToHeading(editor, item.pos);
                  }}
                  onKeyDown={(event) => onKeyDown(event, item, rowIndex)}
                >
                  {item.text || <span className="mdotion-outline-untitled">Untitled</span>}
                </button>
                {issues.length > 0 ? (
                  <span className="mdotion-outline-issue" title={issues.join('\n')} aria-label={issues.join(' ')}>
                    !
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <div className="mdotion-outline-hint">{modKey}⇧O jump to a heading</div>
    </aside>
  );
}
