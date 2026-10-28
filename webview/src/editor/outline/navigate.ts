import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { useEffect, useState } from 'react';
import { foldedPositions, foldingKey, revealPosition } from './SectionFolding';
import { computeOutline, type OutlineItem } from './sections';

/** Scrolls to a heading and puts the caret at its start, unfolding the sections that hide it. */
export function goToHeading(editor: Editor, pos: number): void {
  revealPosition(editor.view, pos);
  editor.chain().focus().setTextSelection(pos + 1).run();
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export interface OutlineSnapshot {
  items: OutlineItem[];
  folded: number[];
}

function readOutline(editor: Editor): OutlineSnapshot {
  return {
    items: foldingKey.getState(editor.state)?.items ?? computeOutline(editor.state.doc),
    folded: foldedPositions(editor.state),
  };
}

/** The outline of the editor document, updated on every change (and fold). */
export function useOutline(editor: Editor): OutlineSnapshot {
  const [snapshot, setSnapshot] = useState(() => readOutline(editor));
  useEffect(() => {
    let frame = 0;
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged && transaction.getMeta(foldingKey) === undefined) {
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSnapshot(readOutline(editor)));
    };
    editor.on('transaction', onTransaction);
    setSnapshot(readOutline(editor));
    return () => {
      cancelAnimationFrame(frame);
      editor.off('transaction', onTransaction);
    };
  }, [editor]);
  return snapshot;
}

/** Items not hidden inside a folded section. */
export function visibleItems(items: OutlineItem[], folded: number[]): OutlineItem[] {
  const foldedSet = new Set(folded);
  return items.filter((item) => {
    for (let parent = item.parent; parent !== null; parent = items[parent].parent) {
      if (foldedSet.has(items[parent].pos)) {
        return false;
      }
    }
    return true;
  });
}

export function depthOf(items: OutlineItem[], item: OutlineItem): number {
  let depth = 0;
  for (let parent = item.parent; parent !== null; parent = items[parent].parent) {
    depth += 1;
  }
  return depth;
}

/** The heading whose section is at the top of the viewport. */
export function useActiveHeading(editor: Editor, items: OutlineItem[], enabled: boolean): number | null {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) {
          return;
        }
        let current: number | null = null;
        for (const item of items) {
          const dom = editor.view.nodeDOM(item.pos);
          if (!(dom instanceof HTMLElement) || dom.offsetParent === null) {
            continue;
          }
          if (dom.getBoundingClientRect().top <= 96) {
            current = item.pos;
          } else {
            break;
          }
        }
        setActive(current ?? items[0]?.pos ?? null);
      });
    };
    update();
    // Capture: the page may scroll in the window (VS Code) or in a container (harness).
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, items, enabled]);
  return active;
}
