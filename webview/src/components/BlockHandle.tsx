import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdapter, getSourceMap } from '../editor/adapter';
import { BlockSelection, KEEP_TEXT_SELECTION } from '../editor/BlockSelection';
import { CONVERTIBLE_TYPES } from '../editor/blockTypes';
import { duplicateBlocks, moveBlocks } from '../editor/NotionKeymap';
import { foldingKey, isFolded, toggleFold } from '../editor/outline/SectionFolding';
import { itemAt, moveSectionDown, moveSectionUp, nextSibling, previousSibling, type OutlineItem } from '../editor/outline/sections';
import { CHEVRON } from './OutlinePanel';
import { sliceToMarkdown } from '../editor/sliceToMarkdown';
import { copyText } from '../lib/clipboard';
import { modKey } from '../lib/env';

const LIST_ITEMS = new Set(['listItem', 'taskItem']);
const CONVERTIBLE_NODES = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote', 'callout', 'codeBlock']);
const HANDLE_WIDTH = 44;
const FOLD_WIDTH = 22;

interface HoverTarget {
  pos: number;
  node: PMNode;
  top: number;
  left: number;
  /** The section the block opens, when it is a top-level heading. */
  section: OutlineItem | null;
}

/** The outline item of a top-level heading at `pos` (sections only start at the top level). */
function sectionAt(editor: Editor, pos: number, node: PMNode): OutlineItem | null {
  if (node.type.name !== 'heading' || editor.state.doc.resolve(pos).depth !== 0) {
    return null;
  }
  return itemAt(foldingKey.getState(editor.state)?.items ?? [], pos) ?? null;
}

/** The block under the given coordinates: the innermost list item, or the top-level block. */
function blockAtCoords(view: EditorView, x: number, y: number): { pos: number; node: PMNode } | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) {
    return null;
  }
  const { doc } = view.state;
  const target = hit.inside >= 0 ? hit.inside : hit.pos;
  const $pos = doc.resolve(target);
  let found: { pos: number; node: PMNode } | null = null;
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    if (depth === 1 || LIST_ITEMS.has(node.type.name)) {
      found = { pos: $pos.before(depth), node };
    }
  }
  if (!found && $pos.depth === 0) {
    const node = doc.nodeAt(target);
    if (node) {
      found = { pos: target, node };
    }
  }
  return found;
}

function firstLineOffset(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  return paddingTop + Math.max((lineHeight - 24) / 2, 0);
}

export function BlockHandle({ editor, container }: { editor: Editor; container: HTMLElement | null }): React.ReactElement | null {
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [menu, setMenu] = useState<HoverTarget | null>(null);
  const [turnInto, setTurnInto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const locate = useCallback(
    (clientX: number, clientY: number): HoverTarget | null => {
      if (!container || editor.isDestroyed) {
        return null;
      }
      const view = editor.view;
      const content = view.dom.getBoundingClientRect();
      const x = Math.min(Math.max(clientX, content.left + 4), content.right - 4);
      const block = blockAtCoords(view, x, clientY);
      if (!block) {
        return null;
      }
      const dom = view.nodeDOM(block.pos);
      if (!(dom instanceof HTMLElement)) {
        return null;
      }
      const rect = dom.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      // Tables have their own row grips on the left edge.
      const markerGap = LIST_ITEMS.has(block.node.type.name) ? 22 : block.node.type.name === 'table' ? 12 : 0;
      const section = sectionAt(editor, block.pos, block.node);
      const foldGap = section && section.end > block.pos + block.node.nodeSize ? FOLD_WIDTH : 0;
      return {
        pos: block.pos,
        node: block.node,
        top: rect.top - box.top + container.scrollTop + firstLineOffset(dom),
        left: rect.left - box.left - HANDLE_WIDTH - markerGap - foldGap - 4,
        section,
      };
    },
    [container, editor],
  );

  useEffect(() => {
    if (!container) {
      return;
    }
    const onMove = (event: MouseEvent) => {
      if (menu || draggingRef.current || !editor.isEditable) {
        return;
      }
      if ((event.target as HTMLElement).closest('.mdotion-block-handle')) {
        return;
      }
      setHover(locate(event.clientX, event.clientY));
    };
    const onLeave = () => {
      if (!menu && !draggingRef.current) {
        setHover(null);
      }
    };
    const onKey = () => setHover(null);
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    editor.view.dom.addEventListener('keydown', onKey);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
      editor.view.dom.removeEventListener('keydown', onKey);
    };
  }, [container, editor, locate, menu]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) {
        setMenu(null);
        setTurnInto(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  /** The node at `pos` if it still is the one the handle was shown for. */
  const nodeAt = (target: HoverTarget): PMNode | null => {
    const node = editor.state.doc.nodeAt(target.pos);
    return node && node.type === target.node.type ? node : null;
  };

  const addBelow = (event: React.MouseEvent) => {
    if (!hover) {
      return;
    }
    const node = nodeAt(hover);
    if (!node) {
      return;
    }
    const isEmptyParagraph = node.type.name === 'paragraph' && node.childCount === 0;
    if (isEmptyParagraph) {
      editor.chain().focus().setTextSelection(hover.pos + 1).insertContent('/').run();
      return;
    }
    const above = event.altKey;
    const insertAt = above ? hover.pos : hover.pos + node.nodeSize;
    const content = LIST_ITEMS.has(node.type.name)
      ? { type: node.type.name, content: [{ type: 'paragraph' }] }
      : { type: 'paragraph' };
    const caret = insertAt + (LIST_ITEMS.has(node.type.name) ? 2 : 1);
    editor.chain().focus().insertContentAt(insertAt, content).setTextSelection(caret).insertContent('/').run();
  };

  /**
   * Selects the hovered block as a Notion block selection, unless it is already
   * part of one (then the whole multi-block selection is kept).
   */
  const selectHovered = (target: HoverTarget): BlockSelection | null => {
    const node = nodeAt(target);
    if (!node) {
      return null;
    }
    const { state, view } = editor;
    const current = state.selection;
    if (current instanceof BlockSelection && current.from <= target.pos && target.pos < current.to) {
      return current;
    }
    const selection = BlockSelection.create(state.doc, target.pos, target.pos + node.nodeSize);
    view.dispatch(state.tr.setSelection(selection));
    return selection;
  };

  const openMenu = () => {
    if (hover && selectHovered(hover)) {
      editor.view.focus();
      setMenu(hover);
    }
  };

  const onDragStart = (event: React.DragEvent) => {
    const view = editor.view;
    const selection = hover ? selectHovered(hover) : null;
    const dom = hover ? view.nodeDOM(hover.pos) : null;
    if (!selection || !(dom instanceof HTMLElement)) {
      event.preventDefault();
      return;
    }
    draggingRef.current = true;
    // ProseMirror's drop handler moves the dragged slice and deletes the current (block) selection.
    (view as unknown as { dragging: unknown }).dragging = { slice: selection.content(), move: true };
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', sliceToMarkdown(selection.content(), getAdapter(), getSourceMap()));
    event.dataTransfer.setDragImage(dom, 0, 0);
  };

  const onDragEnd = () => {
    draggingRef.current = false;
    setHover(null);
  };

  /** Runs a menu action on the selected blocks. */
  const withSelection = (action: (selection: BlockSelection) => void) => {
    setMenu(null);
    setTurnInto(false);
    const { selection } = editor.state;
    if (selection instanceof BlockSelection) {
      action(selection);
    }
  };

  const convert = (selection: BlockSelection, apply: (ed: Editor) => boolean) => {
    const { state, view } = editor;
    // Commands work on a text range spanning the blocks; keep it from turning back into blocks.
    const text = TextSelection.between(state.doc.resolve(selection.from), state.doc.resolve(selection.to));
    view.dispatch(state.tr.setSelection(text).setMeta(KEEP_TEXT_SELECTION, true));
    apply(editor);
  };

  /** Moves the section of the heading the menu was opened on. */
  const moveSection = (direction: -1 | 1) => {
    setMenu(null);
    const item = menu?.section ? itemAt(foldingKey.getState(editor.state)?.items ?? [], menu.pos) : undefined;
    if (!item) {
      return;
    }
    const items = foldingKey.getState(editor.state)!.items;
    const tr = (direction === -1 ? moveSectionUp : moveSectionDown)(editor.state, items, item.index);
    if (tr) {
      editor.view.dispatch(tr);
      editor.view.focus();
    }
  };

  const shown = menu ?? hover;
  if (!shown) {
    return null;
  }
  const foldable = !!shown.section && shown.section.end > shown.pos + shown.node.nodeSize;
  const folded = foldable && isFolded(editor.state, shown.pos);
  const sectionItems = foldingKey.getState(editor.state)?.items ?? [];
  const menuSection = menu?.section ? itemAt(sectionItems, menu.pos) : undefined;
  const menuNode = menu ? nodeAt(menu) : null;
  const selectedBlocks = editor.state.selection instanceof BlockSelection ? editor.state.selection.blocks() : [];
  const canConvert = selectedBlocks.length > 0 && selectedBlocks.every(({ node }) => CONVERTIBLE_NODES.has(node.type.name));

  return (
    <>
      <div className="mdotion-block-handle" style={{ top: shown.top, left: shown.left }}>
        {foldable ? (
          <button
            type="button"
            className={`mdotion-handle-button mdotion-fold-toggle${folded ? '' : ' is-open'}`}
            title={folded ? 'Unfold section' : 'Fold section'}
            aria-label={folded ? 'Unfold section' : 'Fold section'}
            aria-expanded={!folded}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => toggleFold(editor.view, shown.pos)}
          >
            {CHEVRON}
          </button>
        ) : null}
        <button
          type="button"
          className="mdotion-handle-button"
          title={`Click to add below\n${navigatorAltLabel()}-click to add above`}
          aria-label="Add block"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addBelow}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
            <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <div
          className="mdotion-handle-button mdotion-drag"
          role="button"
          tabIndex={-1}
          title={'Drag to move\nClick to open menu'}
          aria-label="Block menu"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={openMenu}
        >
          <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
            {[3, 8, 13].map((cy) => (
              <g key={cy}>
                <circle cx="2.5" cy={cy} r="1.3" fill="currentColor" />
                <circle cx="7.5" cy={cy} r="1.3" fill="currentColor" />
              </g>
            ))}
          </svg>
        </div>
      </div>
      {menu && menuNode ? (
        <div
          ref={menuRef}
          className="mdotion-popover mdotion-menu mdotion-block-menu"
          style={{ top: menu.top + 26, left: menu.left + HANDLE_WIDTH / 2 }}
          role="menu"
        >
          {selectedBlocks.length > 1 ? <div className="mdotion-menu-section">{selectedBlocks.length} blocks</div> : null}
          {canConvert ? (
            <div className="mdotion-submenu-anchor">
              <button type="button" role="menuitem" className="mdotion-menu-item" onClick={() => setTurnInto((v) => !v)}>
                <span className="mdotion-menu-icon">↻</span>
                Turn into
                <span className="mdotion-menu-shortcut">›</span>
              </button>
              {turnInto ? (
                <div className="mdotion-popover mdotion-menu mdotion-submenu" role="menu">
                  {CONVERTIBLE_TYPES.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      role="menuitem"
                      className="mdotion-menu-item"
                      onClick={() => withSelection((selection) => convert(selection, type.apply))}
                    >
                      <span className="mdotion-menu-icon">{type.icon}</span>
                      {type.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button type="button" role="menuitem" className="mdotion-menu-item" onClick={() => withSelection(({ from, to }) => duplicateBlocks(editor, from, to))}>
            <span className="mdotion-menu-icon">⧉</span>
            Duplicate
            <span className="mdotion-menu-shortcut">{modKey}D</span>
          </button>
          <button type="button" role="menuitem" className="mdotion-menu-item" onClick={() => withSelection(({ from, to }) => moveBlocks(editor, from, to, -1))}>
            <span className="mdotion-menu-icon">↑</span>
            Move up
            <span className="mdotion-menu-shortcut">{modKey}⇧↑</span>
          </button>
          <button type="button" role="menuitem" className="mdotion-menu-item" onClick={() => withSelection(({ from, to }) => moveBlocks(editor, from, to, 1))}>
            <span className="mdotion-menu-icon">↓</span>
            Move down
            <span className="mdotion-menu-shortcut">{modKey}⇧↓</span>
          </button>
          {menuSection && selectedBlocks.length === 1 ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="mdotion-menu-item"
                disabled={previousSibling(sectionItems, menuSection.index) === null}
                onClick={() => moveSection(-1)}
              >
                <span className="mdotion-menu-icon">⇡</span>
                Move section up
              </button>
              <button
                type="button"
                role="menuitem"
                className="mdotion-menu-item"
                disabled={nextSibling(sectionItems, menuSection.index) === null}
                onClick={() => moveSection(1)}
              >
                <span className="mdotion-menu-icon">⇣</span>
                Move section down
              </button>
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="mdotion-menu-item"
            onClick={() =>
              withSelection((selection) => void copyText(sliceToMarkdown(selection.content(), getAdapter(), getSourceMap())))
            }
          >
            <span className="mdotion-menu-icon">⎘</span>
            Copy as Markdown
          </button>
          <div className="mdotion-menu-divider" />
          <button type="button" role="menuitem" className="mdotion-menu-item mdotion-danger" onClick={() => withSelection(() => editor.view.dispatch(editor.state.tr.deleteSelection().scrollIntoView()))}>
            <span className="mdotion-menu-icon">🗑</span>
            Delete
            <span className="mdotion-menu-shortcut">Del</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

function navigatorAltLabel(): string {
  return /Mac/.test(navigator.platform) ? '⌥' : 'Alt';
}
