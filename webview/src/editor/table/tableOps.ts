import type { Node as PMNode, ResolvedPos, Schema } from '@tiptap/pm/model';
import { Selection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

/**
 * Row / column operations on GFM tables. GFM tables have no merged cells, so a
 * table is a plain matrix of cells: operations rebuild it from the matrix, which
 * also keeps the invariant that the first row (and only the first row) is the header.
 */

export type Cells = PMNode[][];
export type ColumnAlign = 'left' | 'center' | 'right' | null;

export interface TableRef {
  /** Position right before the table node. */
  pos: number;
  node: PMNode;
}

/** The table around a position, with the row and column of the cell it is in. */
export function tableAround($pos: ResolvedPos): (TableRef & { row: number; col: number }) | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'table') {
      // Inside a cell, or right before one (CellSelection.$anchorCell points between cells of a row).
      const row = depth + 1 <= $pos.depth ? $pos.index(depth) : 0;
      const col = depth + 1 <= $pos.depth ? $pos.index(depth + 1) : 0;
      return { pos: $pos.before(depth), node: $pos.node(depth), row, col };
    }
  }
  return null;
}

export function tableAt(doc: PMNode, pos: number): TableRef | null {
  const node = doc.nodeAt(pos);
  return node?.type.name === 'table' ? { pos, node } : null;
}

export function tableCells(table: PMNode): Cells {
  const rows: Cells = [];
  table.forEach((row) => {
    const cells: PMNode[] = [];
    row.forEach((cell) => cells.push(cell));
    rows.push(cells);
  });
  return rows;
}

export function columnCount(table: PMNode): number {
  return table.firstChild?.childCount ?? 0;
}

/** Builds a table from a matrix; cell types follow the row (header first). */
export function buildTable(schema: Schema, rows: Cells, attrs: PMNode['attrs'] | null = null): PMNode {
  const { table, tableRow, tableHeader, tableCell } = schema.nodes;
  return table.create(
    attrs,
    rows.map((cells, index) => {
      const type = index === 0 ? tableHeader : tableCell;
      return tableRow.create(
        null,
        cells.map((cell) => (cell.type === type ? cell : type.create(cell.attrs, cell.content, cell.marks))),
      );
    }),
  );
}

/** Position right before the cell at `row`, `col` of the table at `tablePos`. */
export function cellPos(table: PMNode, tablePos: number, row: number, col: number): number {
  let pos = tablePos + 1;
  for (let r = 0; r < row; r += 1) {
    pos += table.child(r).nodeSize;
  }
  pos += 1;
  const cells = table.child(row);
  for (let c = 0; c < col; c += 1) {
    pos += cells.child(c).nodeSize;
  }
  return pos;
}

/** Caret at the end of a cell's text. */
export function selectCell(doc: PMNode, tablePos: number, row: number, col: number): Selection {
  const table = doc.nodeAt(tablePos)!;
  const pos = cellPos(table, tablePos, row, col);
  const cell = table.child(row).child(col);
  return Selection.near(doc.resolve(pos + cell.nodeSize - 1), -1);
}

export function selectRow(doc: PMNode, tablePos: number, row: number): Selection {
  const table = doc.nodeAt(tablePos)!;
  const last = columnCount(table) - 1;
  return CellSelection.rowSelection(
    doc.resolve(cellPos(table, tablePos, row, 0)),
    doc.resolve(cellPos(table, tablePos, row, last)),
  );
}

export function selectColumn(doc: PMNode, tablePos: number, col: number): Selection {
  const table = doc.nodeAt(tablePos)!;
  return CellSelection.colSelection(
    doc.resolve(cellPos(table, tablePos, 0, col)),
    doc.resolve(cellPos(table, tablePos, table.childCount - 1, col)),
  );
}

function emptyCell(schema: Schema, like: PMNode | undefined): PMNode {
  const align = (like?.attrs.align as ColumnAlign | undefined) ?? null;
  return schema.nodes.tableCell.create(align ? { align } : null, schema.nodes.paragraph.create());
}

function clearCell(schema: Schema, cell: PMNode): PMNode {
  return cell.type.create(cell.attrs, schema.nodes.paragraph.create());
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Rebuilds the table at `tablePos` with `update` applied to its cells and
 * selects what `select` returns. A null update (or no rows / columns left)
 * deletes the table.
 */
export function updateTable(
  state: EditorState,
  tablePos: number,
  update: (cells: Cells, schema: Schema) => Cells,
  select?: (doc: PMNode, tablePos: number) => Selection,
): Transaction | null {
  const ref = tableAt(state.doc, tablePos);
  if (!ref) {
    return null;
  }
  const rows = update(tableCells(ref.node), state.schema);
  const tr = state.tr;
  if (rows.length === 0 || rows[0].length === 0) {
    tr.delete(tablePos, tablePos + ref.node.nodeSize);
    return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tablePos, tr.doc.content.size)))).scrollIntoView();
  }
  tr.replaceWith(tablePos, tablePos + ref.node.nodeSize, buildTable(state.schema, rows, ref.node.attrs));
  if (select) {
    tr.setSelection(select(tr.doc, tablePos));
  }
  return tr;
}

export const tableOps = {
  insertRow: (index: number) => (rows: Cells, schema: Schema) => {
    const template = rows[Math.min(index, rows.length - 1)];
    const row = template.map((cell) => emptyCell(schema, cell));
    return [...rows.slice(0, index), row, ...rows.slice(index)];
  },
  insertColumn: (index: number) => (rows: Cells, schema: Schema) =>
    rows.map((cells) => [...cells.slice(0, index), emptyCell(schema, undefined), ...cells.slice(index)]),
  duplicateRow: (index: number) => (rows: Cells) => [...rows.slice(0, index + 1), rows[index], ...rows.slice(index + 1)],
  duplicateColumn: (index: number) => (rows: Cells) =>
    rows.map((cells) => [...cells.slice(0, index + 1), cells[index], ...cells.slice(index + 1)]),
  deleteRow: (index: number) => (rows: Cells) => rows.filter((_, i) => i !== index),
  deleteColumn: (index: number) => (rows: Cells) => {
    const next = rows.map((cells) => cells.filter((_, i) => i !== index));
    return next[0].length === 0 ? [] : next;
  },
  clearRow: (index: number) => (rows: Cells, schema: Schema) =>
    rows.map((cells, i) => (i === index ? cells.map((cell) => clearCell(schema, cell)) : cells)),
  clearColumn: (index: number) => (rows: Cells, schema: Schema) =>
    rows.map((cells) => cells.map((cell, i) => (i === index ? clearCell(schema, cell) : cell))),
  moveRow: (from: number, to: number) => (rows: Cells) => move(rows, from, to),
  moveColumn: (from: number, to: number) => (rows: Cells) => rows.map((cells) => move(cells, from, to)),
  /** `left` is written as `:---`; null is the default (`---`). */
  alignColumn: (index: number, align: ColumnAlign) => (rows: Cells) =>
    rows.map((cells) => cells.map((cell, i) => (i === index ? cell.type.create({ ...cell.attrs, align }, cell.content) : cell))),
};

export function columnAlign(table: PMNode, col: number): ColumnAlign {
  return (table.firstChild?.child(col).attrs.align as ColumnAlign | undefined) ?? null;
}

