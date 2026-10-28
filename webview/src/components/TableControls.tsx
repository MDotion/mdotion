import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { useCallback, useEffect, useRef, useState } from 'react';
import { columnWidths } from '../editor/table/columnWidths';
import {
  columnAlign,
  columnCount,
  selectCell,
  selectColumn,
  selectRow,
  tableAround,
  tableAt,
  tableOps,
  updateTable,
  type Cells,
  type ColumnAlign,
} from '../editor/table/tableOps';
import { modKey } from '../lib/env';
import type { Schema } from '@tiptap/pm/model';

const DRAG_THRESHOLD = 4;

type Axis = 'row' | 'col';

interface Hover {
  tablePos: number;
  row: number;
  col: number;
}

interface Geometry {
  table: DOMRect;
  /** Visible part of the table (the wrapper scrolls horizontally). */
  clip: DOMRect;
  rows: DOMRect[];
  cols: DOMRect[];
}

interface Menu {
  axis: Axis;
  index: number;
  tablePos: number;
}

interface Drag {
  axis: Axis;
  from: number;
  /** Insertion slot (0…count) under the pointer. */
  slot: number;
}

interface Grow {
  axis: Axis;
  count: number;
}

function tableDom(editor: Editor, tablePos: number): { wrapper: HTMLElement; table: HTMLTableElement } | null {
  const dom = editor.view.nodeDOM(tablePos);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  const table = dom instanceof HTMLTableElement ? dom : dom.querySelector('table');
  return table ? { wrapper: dom, table } : null;
}

function measure(editor: Editor, tablePos: number): Geometry | null {
  const dom = tableDom(editor, tablePos);
  if (!dom) {
    return null;
  }
  const rows = Array.from(dom.table.rows);
  const first = rows[0];
  if (!first) {
    return null;
  }
  return {
    table: dom.table.getBoundingClientRect(),
    clip: dom.wrapper.getBoundingClientRect(),
    rows: rows.map((row) => row.getBoundingClientRect()),
    cols: Array.from(first.cells).map((cell) => cell.getBoundingClientRect()),
  };
}

/** Insertion slot for a pointer coordinate, from the centers of the rows / columns. */
function slotAt(rects: DOMRect[], axis: Axis, coordinate: number): number {
  for (let i = 0; i < rects.length; i += 1) {
    const center = axis === 'col' ? rects[i].left + rects[i].width / 2 : rects[i].top + rects[i].height / 2;
    if (coordinate < center) {
      return i;
    }
  }
  return rects.length;
}

/** Final index of an item moved from `from` into insertion slot `slot`. */
function targetIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot;
}

/**
 * Notion-style table controls: grips above columns and left of rows (click for
 * the menu, drag to reorder), and + bars on the right and bottom edges (click
 * to add one, drag to add several).
 */
export function TableControls({ editor, container }: { editor: Editor; container: HTMLElement | null }): React.ReactElement | null {
  const [hover, setHover] = useState<Hover | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [grow, setGrow] = useState<Grow | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const refresh = useCallback(
    (target: Hover | null) => {
      if (!target || editor.isDestroyed || !tableAt(editor.state.doc, target.tablePos)) {
        setHover(null);
        setGeometry(null);
        return;
      }
      setHover(target);
      setGeometry(measure(editor, target.tablePos));
    },
    [editor],
  );

  // Hover tracking: the cell under the pointer decides which grips are shown.
  useEffect(() => {
    if (!container) {
      return;
    }
    const onMove = (event: MouseEvent) => {
      if (busy.current || menu || !editor.isEditable) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('.mdotion-table-control')) {
        return;
      }
      const cell = target.closest('td, th');
      if (!cell || !editor.view.dom.contains(cell)) {
        if (!target.closest('.tableWrapper')) {
          refresh(null);
        }
        return;
      }
      const found = tableAround(editor.state.doc.resolve(editor.view.posAtDOM(cell, 0)));
      refresh(found ? { tablePos: found.pos, row: found.row, col: found.col } : null);
    };
    const onLeave = () => {
      if (!busy.current && !menu) {
        refresh(null);
      }
    };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [container, editor, menu, refresh]);

  // Keep the controls on the table while it changes, scrolls or the window resizes.
  useEffect(() => {
    if (!hover) {
      return;
    }
    const update = () => {
      const pos = hover.tablePos;
      const table = tableAt(editor.state.doc, pos);
      if (!table) {
        refresh(null);
        return;
      }
      const rows = table.node.childCount;
      const cols = columnCount(table.node);
      refresh({ tablePos: pos, row: Math.min(hover.row, rows - 1), col: Math.min(hover.col, cols - 1) });
    };
    editor.on('update', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      editor.off('update', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, hover, refresh]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  if (!container || !hover || !geometry) {
    return null;
  }

  const box = container.getBoundingClientRect();
  const x = (value: number) => value - box.left;
  const y = (value: number) => value - box.top;
  const table = tableAt(editor.state.doc, hover.tablePos);
  if (!table) {
    return null;
  }
  const rowCount = table.node.childCount;
  const colCount = columnCount(table.node);

  /** Applies a matrix operation to the hovered table, then selects what `select` returns. */
  const apply = (
    update: (cells: Cells, schema: Schema) => Cells,
    select?: Parameters<typeof updateTable>[3],
  ) => {
    setMenu(null);
    const tr = updateTable(editor.state, hover.tablePos, update, select);
    if (tr) {
      editor.view.dispatch(tr.scrollIntoView());
      editor.view.focus();
    }
  };

  const selection = editor.state.selection;
  const selectedAxis = (axis: Axis, index: number): boolean => {
    if (!(selection instanceof CellSelection)) {
      return false;
    }
    const around = tableAround(selection.$anchorCell);
    if (!around || around.pos !== hover.tablePos) {
      return false;
    }
    const head = tableAround(selection.$headCell)!;
    return axis === 'col'
      ? selection.isColSelection() && Math.min(around.col, head.col) <= index && index <= Math.max(around.col, head.col)
      : selection.isRowSelection() && Math.min(around.row, head.row) <= index && index <= Math.max(around.row, head.row);
  };

  const onGripDown = (event: React.PointerEvent, axis: Axis, index: number) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const start = axis === 'col' ? event.clientX : event.clientY;
    const rects = axis === 'col' ? geometry.cols : geometry.rows;
    let dragging = false;
    let slot = index;
    busy.current = true;
    const onMove = (move: PointerEvent) => {
      const coordinate = axis === 'col' ? move.clientX : move.clientY;
      if (!dragging && Math.abs(coordinate - start) < DRAG_THRESHOLD) {
        return;
      }
      dragging = true;
      slot = slotAt(rects, axis, coordinate);
      setDrag({ axis, from: index, slot });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      busy.current = false;
      setDrag(null);
      const pos = hover.tablePos;
      if (!dragging) {
        const select = axis === 'col' ? selectColumn : selectRow;
        editor.view.dispatch(editor.state.tr.setSelection(select(editor.state.doc, pos, index)));
        editor.view.focus();
        setMenu({ axis, index, tablePos: pos });
        return;
      }
      const to = targetIndex(index, slot);
      if (to !== index) {
        apply(
          axis === 'col' ? tableOps.moveColumn(index, to) : tableOps.moveRow(index, to),
          (doc, tablePos) => (axis === 'col' ? selectColumn : selectRow)(doc, tablePos, to),
        );
        columnWidths.move(editor.view, pos, axis, index, to);
        setHover({ ...hover, [axis]: to });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onGrowDown = (event: React.PointerEvent, axis: Axis) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const start = axis === 'col' ? event.clientX : event.clientY;
    const unit = axis === 'col' ? Math.max(geometry.cols[geometry.cols.length - 1]?.width ?? 120, 80) : Math.max(geometry.rows[geometry.rows.length - 1]?.height ?? 36, 28);
    let count = 1;
    busy.current = true;
    setGrow({ axis, count });
    const onMove = (move: PointerEvent) => {
      const delta = (axis === 'col' ? move.clientX : move.clientY) - start;
      count = Math.max(1, Math.min(50, 1 + Math.floor(delta / unit)));
      setGrow({ axis, count });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      busy.current = false;
      setGrow(null);
      if (axis === 'row') {
        apply(
          (cells, schema) => {
            let next = cells;
            for (let i = 0; i < count; i += 1) {
              next = tableOps.insertRow(next.length)(next, schema);
            }
            return next;
          },
          (doc, tablePos) => selectCell(doc, tablePos, rowCount, 0),
        );
      } else {
        apply(
          (cells, schema) => {
            let next = cells;
            for (let i = 0; i < count; i += 1) {
              next = tableOps.insertColumn(next[0].length)(next, schema);
            }
            return next;
          },
          (doc, tablePos) => selectCell(doc, tablePos, 0, colCount),
        );
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const { table: tableRect, clip } = geometry;
  const visibleLeft = Math.max(tableRect.left, clip.left);
  const visibleRight = Math.min(tableRect.right, clip.right);
  const col = geometry.cols[hover.col];
  const row = geometry.rows[hover.row];
  const colVisible = !!col && col.left + col.width / 2 >= clip.left && col.left + col.width / 2 <= clip.right;

  const indicator = (() => {
    if (!drag) {
      return null;
    }
    const rects = drag.axis === 'col' ? geometry.cols : geometry.rows;
    const edge =
      drag.slot < rects.length
        ? drag.axis === 'col'
          ? rects[drag.slot].left
          : rects[drag.slot].top
        : drag.axis === 'col'
          ? rects[rects.length - 1].right
          : rects[rects.length - 1].bottom;
    return drag.axis === 'col' ? (
      <div className="mdotion-table-drop is-col" style={{ left: x(edge) - 1, top: y(tableRect.top), height: tableRect.height }} />
    ) : (
      <div className="mdotion-table-drop is-row" style={{ top: y(edge) - 1, left: x(visibleLeft), width: visibleRight - visibleLeft }} />
    );
  })();

  const menuStyle =
    menu?.axis === 'col'
      ? { top: y(tableRect.top) + 10, left: x(geometry.cols[menu.index]?.left ?? tableRect.left) }
      : { top: y(geometry.rows[menu?.index ?? 0]?.top ?? tableRect.top), left: x(tableRect.left) + 12 };

  return (
    <>
      {colVisible ? (
        <button
          type="button"
          className={`mdotion-table-control mdotion-table-grip is-col${selectedAxis('col', hover.col) ? ' is-selected' : ''}`}
          style={{ top: y(tableRect.top) - 7, left: x(col.left + col.width / 2) - 12 }}
          title={'Drag to move the column\nClick for column options'}
          aria-label="Column options"
          onPointerDown={(event) => onGripDown(event, 'col', hover.col)}
        >
          <svg viewBox="0 0 16 8" width="14" height="7" aria-hidden>
            {[3, 8, 13].map((cx) => (
              <circle key={cx} cx={cx} cy="4" r="1.3" fill="currentColor" />
            ))}
          </svg>
        </button>
      ) : null}
      {row ? (
        <button
          type="button"
          className={`mdotion-table-control mdotion-table-grip is-row${selectedAxis('row', hover.row) ? ' is-selected' : ''}`}
          style={{ top: y(row.top + row.height / 2) - 12, left: x(visibleLeft) - 7 }}
          title={'Drag to move the row\nClick for row options'}
          aria-label="Row options"
          onPointerDown={(event) => onGripDown(event, 'row', hover.row)}
        >
          <svg viewBox="0 0 8 16" width="7" height="14" aria-hidden>
            {[3, 8, 13].map((cy) => (
              <circle key={cy} cx="4" cy={cy} r="1.3" fill="currentColor" />
            ))}
          </svg>
        </button>
      ) : null}
      {hover.col === colCount - 1 || grow?.axis === 'col' ? (
        <button
          type="button"
          className="mdotion-table-control mdotion-table-grow is-col"
          style={{ top: y(tableRect.top), left: x(visibleRight) + 4, height: tableRect.height }}
          title={'Click to add a column\nDrag to add several'}
          aria-label="Add column"
          onPointerDown={(event) => onGrowDown(event, 'col')}
        >
          {grow?.axis === 'col' && grow.count > 1 ? <span>+{grow.count}</span> : '+'}
        </button>
      ) : null}
      {hover.row === rowCount - 1 || grow?.axis === 'row' ? (
        <button
          type="button"
          className="mdotion-table-control mdotion-table-grow is-row"
          style={{ top: y(tableRect.bottom) + 4, left: x(visibleLeft), width: visibleRight - visibleLeft }}
          title={'Click to add a row\nDrag to add several'}
          aria-label="Add row"
          onPointerDown={(event) => onGrowDown(event, 'row')}
        >
          {grow?.axis === 'row' && grow.count > 1 ? <span>+{grow.count} rows</span> : '+'}
        </button>
      ) : null}
      {indicator}
      {menu ? (
        <div ref={menuRef} className="mdotion-table-control mdotion-popover mdotion-menu mdotion-table-axis-menu" style={menuStyle} role="menu">
          {menu.axis === 'col' ? (
            <ColumnMenu
              index={menu.index}
              count={colCount}
              align={columnAlign(table.node, menu.index)}
              apply={apply}
              onResetWidths={() => {
                setMenu(null);
                columnWidths.reset(editor.view, menu.tablePos);
              }}
              hasWidths={columnWidths.has(editor.view, menu.tablePos)}
            />
          ) : (
            <RowMenu index={menu.index} count={rowCount} apply={apply} />
          )}
        </div>
      ) : null}
    </>
  );
}

type Apply = (update: (cells: Cells, schema: Schema) => Cells, select?: Parameters<typeof updateTable>[3]) => void;

function Item(props: { icon: string; label: string; shortcut?: string; danger?: boolean; disabled?: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      className={`mdotion-menu-item${props.danger ? ' mdotion-danger' : ''}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="mdotion-menu-icon">{props.icon}</span>
      {props.label}
      {props.shortcut ? <span className="mdotion-menu-shortcut">{props.shortcut}</span> : null}
    </button>
  );
}

const ALIGNMENTS: { value: ColumnAlign; label: string; path: string }[] = [
  { value: null, label: 'Align left', path: 'M2.5 4h11M2.5 8h7M2.5 12h9' },
  { value: 'center', label: 'Align center', path: 'M2.5 4h11M4.5 8h7M3.5 12h9' },
  { value: 'right', label: 'Align right', path: 'M2.5 4h11M6.5 8h7M4.5 12h9' },
];

function ColumnMenu(props: {
  index: number;
  count: number;
  align: ColumnAlign;
  apply: Apply;
  hasWidths: boolean;
  onResetWidths: () => void;
}): React.ReactElement {
  const { index, count, apply } = props;
  const current = props.align === 'left' ? null : props.align;
  return (
    <>
      <div className="mdotion-table-align" role="group" aria-label="Column alignment">
        {ALIGNMENTS.map((option) => (
          <button
            key={option.label}
            type="button"
            className={current === option.value ? 'is-active' : ''}
            title={option.label}
            aria-label={option.label}
            aria-pressed={current === option.value}
            onClick={() => apply(tableOps.alignColumn(index, option.value), (doc, pos) => selectColumn(doc, pos, index))}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d={option.path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        ))}
      </div>
      <div className="mdotion-menu-divider" />
      <Item icon="←" label="Insert left" onClick={() => apply(tableOps.insertColumn(index), (doc, pos) => selectCell(doc, pos, 0, index))} />
      <Item icon="→" label="Insert right" onClick={() => apply(tableOps.insertColumn(index + 1), (doc, pos) => selectCell(doc, pos, 0, index + 1))} />
      <Item
        icon="⇠"
        label="Move left"
        disabled={index === 0}
        onClick={() => apply(tableOps.moveColumn(index, index - 1), (doc, pos) => selectColumn(doc, pos, index - 1))}
      />
      <Item
        icon="⇢"
        label="Move right"
        disabled={index === count - 1}
        onClick={() => apply(tableOps.moveColumn(index, index + 1), (doc, pos) => selectColumn(doc, pos, index + 1))}
      />
      <Item icon="⧉" label="Duplicate" onClick={() => apply(tableOps.duplicateColumn(index), (doc, pos) => selectColumn(doc, pos, index + 1))} />
      <Item icon="⌫" label="Clear contents" onClick={() => apply(tableOps.clearColumn(index), (doc, pos) => selectColumn(doc, pos, index))} />
      {props.hasWidths ? <Item icon="↔" label="Reset column widths" onClick={props.onResetWidths} /> : null}
      <div className="mdotion-menu-divider" />
      <Item
        icon="🗑"
        label={count === 1 ? 'Delete table' : 'Delete column'}
        danger
        onClick={() => apply(tableOps.deleteColumn(index), (doc, pos) => selectCell(doc, pos, 0, Math.max(0, Math.min(index, count - 2))))}
      />
    </>
  );
}

function RowMenu(props: { index: number; count: number; apply: Apply }): React.ReactElement {
  const { index, count, apply } = props;
  return (
    <>
      {index === 0 ? <div className="mdotion-menu-section">Header row</div> : null}
      <Item icon="↑" label="Insert above" onClick={() => apply(tableOps.insertRow(index), (doc, pos) => selectCell(doc, pos, index, 0))} />
      <Item icon="↓" label="Insert below" onClick={() => apply(tableOps.insertRow(index + 1), (doc, pos) => selectCell(doc, pos, index + 1, 0))} />
      <Item
        icon="⇡"
        label="Move up"
        shortcut={`${modKey}⇧↑`}
        disabled={index === 0}
        onClick={() => apply(tableOps.moveRow(index, index - 1), (doc, pos) => selectRow(doc, pos, index - 1))}
      />
      <Item
        icon="⇣"
        label="Move down"
        shortcut={`${modKey}⇧↓`}
        disabled={index === count - 1}
        onClick={() => apply(tableOps.moveRow(index, index + 1), (doc, pos) => selectRow(doc, pos, index + 1))}
      />
      <Item icon="⧉" label="Duplicate" onClick={() => apply(tableOps.duplicateRow(index), (doc, pos) => selectRow(doc, pos, index + 1))} />
      <Item icon="⌫" label="Clear contents" onClick={() => apply(tableOps.clearRow(index), (doc, pos) => selectRow(doc, pos, index))} />
      <div className="mdotion-menu-divider" />
      <Item
        icon="🗑"
        label={count === 1 ? 'Delete table' : 'Delete row'}
        danger
        onClick={() => apply(tableOps.deleteRow(index), (doc, pos) => selectCell(doc, pos, Math.max(0, Math.min(index, count - 2)), 0))}
      />
    </>
  );
}
