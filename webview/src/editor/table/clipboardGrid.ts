import { DOMParser as PMDOMParser, type Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model';

/** A cell as copied: an HTML cell element, or plain text (TSV). */
export type GridCell = HTMLElement | string;

/** A rectangular grid of cells, first row first. */
export type Grid = GridCell[][];

/** Elements that never hold visible content (Excel and Sheets put styles next to the table). */
const INVISIBLE = 'style, script, meta, title, link, template';

/**
 * Reads a spreadsheet selection or a web table from the clipboard. Returns null
 * when the clipboard is not just a table, so normal paste handles it.
 */
export function clipboardToGrid(html: string, text: string): Grid | null {
  if (html) {
    // Copied from a ProseMirror editor (MDotion itself): its own paste keeps the structure.
    if (html.includes('data-pm-slice')) {
      return null;
    }
    const grid = gridFromHtml(html);
    if (grid) {
      return grid;
    }
    if (/<table[\s>]/i.test(html)) {
      return null;
    }
  }
  return gridFromTsv(text);
}

/** The cells of the only table in `html`, if there is nothing else visible around it. */
export function gridFromHtml(html: string): Grid | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(INVISIBLE).forEach((element) => element.remove());
  const tables = doc.querySelectorAll('table');
  if (tables.length !== 1) {
    return null;
  }
  const table = tables[0];
  const outside = doc.body.cloneNode(true) as HTMLElement;
  outside.querySelector('table')?.remove();
  if ((outside.textContent ?? '').trim() !== '') {
    return null;
  }

  const rows = Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
  const grid: (GridCell | undefined)[][] = [];
  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ??= [];
    let column = 0;
    for (const child of Array.from(row.children)) {
      if (child.tagName !== 'TD' && child.tagName !== 'TH') {
        continue;
      }
      const cell = child as HTMLElement;
      while (grid[rowIndex][column] !== undefined) {
        column += 1;
      }
      // GFM has no merged cells: the content goes in the first one, the others stay empty.
      const colspan = span(cell.getAttribute('colspan'));
      const rowspan = Math.min(span(cell.getAttribute('rowspan')), rows.length - rowIndex);
      for (let r = 0; r < rowspan; r += 1) {
        grid[rowIndex + r] ??= [];
        for (let c = 0; c < colspan; c += 1) {
          grid[rowIndex + r][column + c] = r === 0 && c === 0 ? cell : '';
        }
      }
      column += colspan;
    }
  });
  return rectangular(grid.filter((row) => row.length > 0), 2);
}

/** Tab-separated text as Excel, Sheets and Numbers put on the clipboard. */
export function gridFromTsv(text: string): Grid | null {
  const source = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!source.includes('\t')) {
    return null;
  }
  const rows: string[][] = [[]];
  let field = '';
  let i = 0;
  const atFieldStart = () => field === '';
  while (i < source.length) {
    const char = source[i];
    if (char === '"' && atFieldStart()) {
      // Quoted field: may contain tabs, newlines and doubled quotes.
      let j = i + 1;
      let value = '';
      while (j < source.length) {
        if (source[j] === '"') {
          if (source[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += source[j];
        j += 1;
      }
      const next = source[j + 1];
      if (j < source.length && (next === undefined || next === '\t' || next === '\n')) {
        field = value;
        i = j + 1;
        continue;
      }
      // Not a well-formed quoted field: keep the quote as text.
    }
    if (char === '\t') {
      rows[rows.length - 1].push(field);
      field = '';
    } else if (char === '\n') {
      rows[rows.length - 1].push(field);
      rows.push([]);
      field = '';
    } else {
      field += char;
    }
    i += 1;
  }
  rows[rows.length - 1].push(field);

  const width = rows[0].length;
  if (rows.length < 2 || width < 2 || rows.some((row) => row.length !== width)) {
    return null;
  }
  return rows;
}

/**
 * Builds a GFM table: the first row is the header, every cell holds one line of
 * inline content, and columns keep the alignment the source gave all their cells.
 */
export function gridToTable(grid: Grid, schema: Schema): PMNode {
  const { table, tableRow, tableHeader, tableCell, paragraph } = schema.nodes;
  const width = Math.max(...grid.map((row) => row.length));
  const aligns = Array.from({ length: width }, (_, column) => columnAlign(grid, column));
  const rows = grid.map((row, rowIndex) => {
    const type = rowIndex === 0 ? tableHeader : tableCell;
    const cells = Array.from({ length: width }, (_, column) => {
      const cell = row[column] ?? '';
      let content = typeof cell === 'string' ? textInline(cell, schema) : htmlInline(cell, schema);
      if (rowIndex === 0) {
        content = withoutWholeBold(content, schema);
      }
      return type.create(aligns[column] ? { align: aligns[column] } : null, paragraph.create(null, content));
    });
    return tableRow.create(null, cells);
  });
  return table.create(null, rows);
}

/** Header cells are bold already: drop a bold mark that covers the whole cell (`<b>City</b>`). */
function withoutWholeBold(nodes: PMNode[], schema: Schema): PMNode[] {
  const bold = schema.marks.bold;
  const texts = nodes.filter((node) => node.isText);
  if (!bold || texts.length === 0 || !texts.every((node) => bold.isInSet(node.marks))) {
    return nodes;
  }
  return nodes.map((node) => (node.isText ? node.mark(bold.removeFromSet(node.marks)) : node));
}

type Align = 'center' | 'right';

/** Center / right when every non-empty body cell of the column (or the header alone) has it. */
function columnAlign(grid: Grid, column: number): Align | null {
  const cells = grid.slice(grid.length > 1 ? 1 : 0).map((row) => row[column]);
  const filled = cells.filter((cell): cell is HTMLElement => typeof cell !== 'string' && (cell.textContent ?? '').trim() !== '');
  if (filled.length === 0 || filled.length < cells.filter((cell) => typeof cell === 'string' && cell.trim() !== '').length) {
    return null;
  }
  const first = cellAlign(filled[0]);
  return first && filled.every((cell) => cellAlign(cell) === first) ? first : null;
}

function cellAlign(cell: HTMLElement): Align | null {
  const inner = cell.firstElementChild as HTMLElement | null;
  const value = (cell.style.textAlign || cell.getAttribute('align') || inner?.style.textAlign || '').trim().toLowerCase();
  return value === 'center' || value === 'right' ? value : null;
}

function textInline(text: string, schema: Schema): PMNode[] {
  const lines = text.split('\n').map((line) => line.trim());
  const nodes: PMNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0 && nodes.length > 0) {
      nodes.push(schema.nodes.hardBreak.create());
    }
    if (line) {
      nodes.push(schema.text(line));
    }
  });
  return trimBreaks(nodes, schema);
}

/**
 * Inline content of an HTML cell: marks and links are kept, blocks (paragraphs,
 * lists) become line breaks, images become their alt text, styles are ignored.
 */
function htmlInline(element: HTMLElement, schema: Schema): PMNode[] {
  const slice = PMDOMParser.fromSchema(schema).parseSlice(element);
  const nodes: PMNode[] = [];
  const lineBreak = () => {
    if (nodes.length > 0 && nodes[nodes.length - 1].type !== schema.nodes.hardBreak) {
      nodes.push(schema.nodes.hardBreak.create());
    }
  };
  const walk = (fragment: Fragment) => {
    fragment.forEach((node) => {
      if (node.type.name === 'image') {
        const alt = String(node.attrs.alt ?? '').trim();
        if (alt) {
          nodes.push(schema.text(alt));
        }
      } else if (node.isText) {
        const text = node.text!.replace(/\s*\n\s*/g, ' ');
        if (text) {
          nodes.push(schema.text(text, node.marks));
        }
      } else if (node.isInline) {
        nodes.push(node);
      } else if (node.isTextblock) {
        lineBreak();
        walk(node.content);
        lineBreak();
      } else {
        walk(node.content);
      }
    });
  };
  walk(slice.content);
  return trimBreaks(nodes, schema);
}

/** Drops line breaks and spaces at the start and end of a cell. */
function trimBreaks(nodes: PMNode[], schema: Schema): PMNode[] {
  const blank = (node: PMNode | undefined) =>
    !!node && (node.type === schema.nodes.hardBreak || (node.isText && node.text!.trim() === ''));
  while (blank(nodes[0])) {
    nodes.shift();
  }
  while (blank(nodes[nodes.length - 1])) {
    nodes.pop();
  }
  const trim = (index: number, pattern: RegExp) => {
    const node = nodes[index];
    if (node?.isText) {
      nodes[index] = schema.text(node.text!.replace(pattern, ''), node.marks);
    }
  };
  trim(0, /^\s+/);
  trim(nodes.length - 1, /\s+$/);
  return nodes;
}

function span(value: string | null): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, 100) : 1;
}

/** Pads rows to the same width; null when there are fewer than `minCells` cells. */
function rectangular(rows: (GridCell | undefined)[][], minCells: number): Grid | null {
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || width * rows.length < minCells) {
    return null;
  }
  return rows.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? ''));
}
