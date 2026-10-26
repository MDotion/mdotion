import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { BlockSelection } from '../editor/BlockSelection';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Things a drag must not start from: the text itself and every control around it. */
const NOT_A_MARGIN = [
  'button',
  'input',
  'textarea',
  'select',
  'a',
  '.mdotion-block-handle',
  '.mdotion-popover',
  '.mdotion-properties',
  '.mdotion-page-actions',
  '.mdotion-banner',
].join(', ');

/** Selects the top-level blocks the rectangle touches, anchored on the side the drag started from. */
function selectBlocksIn(editor: Editor, box: Box, upward: boolean): void {
  const { view, state } = editor;
  let from = -1;
  let to = -1;
  state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) {
      return;
    }
    const rect = dom.getBoundingClientRect();
    if (rect.bottom > box.top && rect.top < box.bottom && rect.right > box.left && rect.left < box.right) {
      from = from < 0 ? offset : from;
      to = offset + node.nodeSize;
    }
  });
  if (from < 0) {
    return;
  }
  const next = upward ? BlockSelection.create(state.doc, to, from) : BlockSelection.create(state.doc, from, to);
  if (!state.selection.eq(next)) {
    view.dispatch(state.tr.setSelection(next));
  }
}

/**
 * Notion rubber-band selection: dragging from the page margins (or below the
 * last block) draws a rectangle and selects the blocks it touches. A plain
 * click below the content puts the caret at the end.
 */
export function BlockMarquee({ editor, container }: { editor: Editor; container: HTMLElement | null }): React.ReactElement | null {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!container) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (event.button !== 0 || !editor.isEditable || editor.view.dom.contains(target) || target.closest(NOT_A_MARGIN)) {
        return;
      }
      // Keep the browser from starting a native text selection across the page.
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;

      const onMove = (move: MouseEvent) => {
        if (!dragging && Math.hypot(move.clientX - startX, move.clientY - startY) < 4) {
          return;
        }
        dragging = true;
        const next = {
          left: Math.min(startX, move.clientX),
          top: Math.min(startY, move.clientY),
          right: Math.max(startX, move.clientX),
          bottom: Math.max(startY, move.clientY),
        };
        setBox(next);
        selectBlocksIn(editor, next, move.clientY < startY);
        if (move.clientY > window.innerHeight - 32) {
          window.scrollBy(0, 16);
        } else if (move.clientY < 32) {
          window.scrollBy(0, -16);
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setBox(null);
        if (dragging) {
          editor.view.focus();
        } else if (target.closest('.mdotion-page-tail')) {
          editor.commands.focus('end');
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    container.addEventListener('mousedown', onMouseDown);
    return () => container.removeEventListener('mousedown', onMouseDown);
  }, [container, editor]);

  if (!box) {
    return null;
  }
  return (
    <div
      className="mdotion-marquee"
      style={{ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }}
    />
  );
}
