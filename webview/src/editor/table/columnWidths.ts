import { TableView, updateColumns } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@tiptap/pm/view';
import { viewState } from '../../lib/viewState';

/**
 * Column widths are view state (ADR-009): GFM has no widths, and storing them
 * in the cells' `colwidth` would change the nodes and rewrite the whole table.
 * They live on the table node views, applied to the <colgroup>, and are saved
 * per file by the host, keyed by the header row (and its occurrence).
 */

const MIN_WIDTH = 60;
const MAX_FIT_WIDTH = 640;
const EDGE = 4;
const CELL_MIN_WIDTH = 25;

type Axis = 'row' | 'col';

function headerKey(node: PMNode): string {
  const cells: string[] = [];
  node.firstChild?.forEach((cell) => cells.push(cell.textContent));
  return cells.join('|').slice(0, 1000);
}

class Registry {
  private readonly views = new Set<MdotionTableView>();

  constructor() {
    viewState.onLoad(() => this.views.forEach((view) => view.restore()));
  }

  add(view: MdotionTableView): void {
    this.views.add(view);
  }

  delete(view: MdotionTableView): void {
    this.views.delete(view);
  }

  /** Key of a table in the saved state: its header text and how many tables before it share it. */
  keyOf(editorView: EditorView, node: PMNode, pos: number): string {
    const header = headerKey(node);
    let occurrence = 0;
    editorView.state.doc.descendants((other, otherPos) => {
      if (otherPos >= pos) {
        return false;
      }
      if (other.type.name === 'table') {
        if (headerKey(other) === header) {
          occurrence += 1;
        }
        return false;
      }
      return other.isBlock && !other.isTextblock;
    });
    return `${header}#${occurrence}`;
  }

  private viewAt(editorView: EditorView, pos: number): MdotionTableView | undefined {
    return [...this.views].find((view) => view.editorView === editorView && view.pos() === pos);
  }

  has(editorView: EditorView, pos: number): boolean {
    return !!this.viewAt(editorView, pos)?.widths;
  }

  reset(editorView: EditorView, pos: number): void {
    this.viewAt(editorView, pos)?.setWidths(null);
    this.save(editorView);
  }

  /** Keeps widths attached to their column when a column moves. */
  move(editorView: EditorView, pos: number, axis: Axis, from: number, to: number): void {
    const view = this.viewAt(editorView, pos);
    if (axis !== 'col' || !view?.widths) {
      return;
    }
    const widths = [...view.widths];
    const [moved] = widths.splice(from, 1);
    widths.splice(to, 0, moved);
    view.setWidths(widths);
    this.save(editorView);
  }

  /** Saves the widths of every table of the editor, replacing what was stored. */
  save(editorView: EditorView): void {
    const tableWidths: Record<string, number[]> = {};
    for (const view of this.views) {
      const pos = view.pos();
      if (view.editorView === editorView && view.widths && pos !== undefined) {
        tableWidths[this.keyOf(editorView, view.node, pos)] = view.widths;
      }
    }
    viewState.set('tableWidths', tableWidths);
  }
}

export const columnWidths = new Registry();

/** The table node view: Tiptap's (wrapper, colgroup) plus view-only column widths and resizing. */
export class MdotionTableView extends TableView implements NodeView {
  widths: number[] | null = null;
  private readonly handle: HTMLDivElement;
  private resizing = false;

  constructor(
    node: PMNode,
    readonly editorView: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    super(node, CELL_MIN_WIDTH, editorView);
    this.handle = this.dom.appendChild(document.createElement('div'));
    this.handle.className = 'mdotion-column-resize';
    this.handle.contentEditable = 'false';
    this.table.addEventListener('mousemove', this.onHover);
    this.table.addEventListener('mouseleave', this.onLeave);
    this.handle.addEventListener('mousedown', this.onResizeStart);
    this.handle.addEventListener('mouseleave', this.onHandleLeave);
    this.handle.addEventListener('dblclick', this.onAutoFit);
    columnWidths.add(this);
    // Positions are only known once the view has placed the node.
    queueMicrotask(() => this.restore());
  }

  pos(): number | undefined {
    try {
      return this.getPos();
    } catch {
      return undefined;
    }
  }

  /** Applies the widths saved for this table, if any. */
  restore(): void {
    const pos = this.pos();
    if (pos === undefined || this.resizing) {
      return;
    }
    const saved = viewState.get('tableWidths')[columnWidths.keyOf(this.editorView, this.node, pos)];
    this.setWidths(saved && saved.length === this.columnCount() ? saved : this.widths);
  }

  setWidths(widths: number[] | null): void {
    this.widths = widths && widths.length === this.columnCount() ? widths : null;
    this.applyWidths();
  }

  override update(node: PMNode): boolean {
    if (!super.update(node)) {
      return false;
    }
    if (this.widths && this.widths.length !== this.columnCount()) {
      this.widths = null;
    }
    this.applyWidths();
    return true;
  }

  override ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.target === this.handle || this.handle.contains(mutation.target as Node) || super.ignoreMutation(mutation);
  }

  destroy(): void {
    columnWidths.delete(this);
  }

  private columnCount(): number {
    return this.node.firstChild?.childCount ?? 0;
  }

  private applyWidths(): void {
    const cols = Array.from(this.colgroup.children) as HTMLElement[];
    if (!this.widths) {
      this.table.classList.remove('has-column-widths');
      updateColumns(this.node, this.colgroup, this.table, CELL_MIN_WIDTH);
      return;
    }
    cols.forEach((col, index) => {
      col.style.width = `${this.widths![index]}px`;
      col.style.minWidth = '';
    });
    this.table.style.width = `${this.widths.reduce((sum, width) => sum + width, 0)}px`;
    this.table.style.minWidth = '';
    this.table.classList.add('has-column-widths');
  }

  private firstRowCells(): HTMLElement[] {
    return Array.from(this.table.rows[0]?.cells ?? []);
  }

  /** The column whose right edge is under the pointer. */
  private edgeAt(clientX: number): number | null {
    const cells = this.firstRowCells();
    for (let i = 0; i < cells.length; i += 1) {
      if (Math.abs(cells[i].getBoundingClientRect().right - clientX) <= EDGE) {
        return i;
      }
    }
    return null;
  }

  private showHandle(column: number | null): void {
    if (column === null || !this.editorView.editable) {
      this.handle.style.display = 'none';
      return;
    }
    const cell = this.firstRowCells()[column];
    const wrapper = this.dom.getBoundingClientRect();
    const table = this.table.getBoundingClientRect();
    this.handle.dataset.column = String(column);
    this.handle.style.display = 'block';
    this.handle.style.left = `${cell.getBoundingClientRect().right - wrapper.left + this.dom.scrollLeft - 4}px`;
    this.handle.style.top = `${table.top - wrapper.top}px`;
    this.handle.style.height = `${table.height}px`;
  }

  private readonly onHover = (event: MouseEvent) => {
    if (!this.resizing) {
      this.showHandle(this.edgeAt(event.clientX));
    }
  };

  private readonly onLeave = (event: MouseEvent) => {
    if (!this.resizing && event.relatedTarget !== this.handle) {
      this.showHandle(null);
    }
  };

  /** The line only shows while the pointer is on the border (or dragging it). */
  private readonly onHandleLeave = (event: MouseEvent) => {
    const to = event.relatedTarget as HTMLElement | null;
    if (!this.resizing && !(to && this.table.contains(to) && this.edgeAt(event.clientX) !== null)) {
      this.showHandle(null);
    }
  };

  private readonly onResizeStart = (event: MouseEvent) => {
    const column = Number(this.handle.dataset.column);
    if (event.button !== 0 || Number.isNaN(column)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const start = event.clientX;
    const widths = this.widths ?? this.firstRowCells().map((cell) => Math.round(cell.getBoundingClientRect().width));
    const initial = widths[column];
    this.resizing = true;
    this.handle.classList.add('is-active');
    const onMove = (move: MouseEvent) => {
      const next = [...widths];
      next[column] = Math.max(MIN_WIDTH, Math.round(initial + move.clientX - start));
      this.setWidths(next);
      this.showHandle(column);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      this.resizing = false;
      this.handle.classList.remove('is-active');
      this.showHandle(null);
      columnWidths.save(this.editorView);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /** Double click on an edge: fit the column to its longest line. */
  private readonly onAutoFit = (event: MouseEvent) => {
    const column = Number(this.handle.dataset.column);
    if (Number.isNaN(column)) {
      return;
    }
    event.preventDefault();
    const cells = Array.from(this.table.rows).map((row) => row.cells[column]).filter(Boolean);
    const probe = document.body.appendChild(document.createElement('span'));
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0';
    let widest = 0;
    for (const cell of cells) {
      const style = getComputedStyle(cell);
      probe.style.font = style.font;
      probe.innerHTML = cell.innerHTML;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2;
      widest = Math.max(widest, probe.getBoundingClientRect().width + padding);
    }
    probe.remove();
    const widths = this.widths ?? this.firstRowCells().map((cell) => Math.round(cell.getBoundingClientRect().width));
    const next = [...widths];
    next[column] = Math.min(MAX_FIT_WIDTH, Math.max(MIN_WIDTH, Math.ceil(widest)));
    this.setWidths(next);
    this.showHandle(column);
    columnWidths.save(this.editorView);
  };
}
