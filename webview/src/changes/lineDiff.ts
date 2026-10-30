import { diffLines, diffWordsWithSpace } from 'diff';
import { similarity } from '../../../src/markdown/blockDiff';

export type RowKind = 'context' | 'add' | 'del';

/** One line of a unified diff, as Git shows it. */
export interface DiffRow {
  kind: RowKind;
  text: string;
  /** 1-based line numbers in the old and new file (null on the side the line is not in). */
  oldLine: number | null;
  newLine: number | null;
  /** Changed characters of a line that replaces another one: [from, to) ranges in `text`. */
  words: [number, number][];
}

/** Lines replaced by others are compared word by word when they have this much in common. */
const WORD_DIFF_SIMILARITY = 0.3;

function splitLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Ranges of the parts of `text` that `parts` mark with `flag`. */
function rangesOf(parts: { value: string; added?: boolean; removed?: boolean }[], flag: 'added' | 'removed'): [number, number][] {
  const ranges: [number, number][] = [];
  let offset = 0;
  for (const part of parts) {
    if (part[flag === 'added' ? 'removed' : 'added']) {
      continue;
    }
    if (part[flag] && part.value.trim() !== '') {
      ranges.push([offset, offset + part.value.length]);
    }
    offset += part.value.length;
  }
  return ranges;
}

/** Marks the changed words of deleted lines followed by added ones, paired in order (like GitHub). */
function pairWords(rows: DiffRow[]): void {
  for (let i = 0; i < rows.length; ) {
    if (rows[i].kind !== 'del') {
      i += 1;
      continue;
    }
    let del = i;
    while (del < rows.length && rows[del].kind === 'del') {
      del += 1;
    }
    let add = del;
    while (add < rows.length && rows[add].kind === 'add') {
      add += 1;
    }
    const pairs = Math.min(del - i, add - del);
    for (let k = 0; k < pairs; k += 1) {
      const before = rows[i + k];
      const after = rows[del + k];
      if (similarity(before.text, after.text) < WORD_DIFF_SIMILARITY) {
        continue;
      }
      const parts = diffWordsWithSpace(before.text, after.text, { timeout: 20 });
      if (parts) {
        before.words = rangesOf(parts, 'removed');
        after.words = rangesOf(parts, 'added');
      }
    }
    i = add;
  }
}

/** The line-by-line diff of two texts (LF line endings). */
export function diffRows(before: string, after: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (const part of diffLines(before, after)) {
    for (const text of splitLines(part.value)) {
      if (part.added) {
        rows.push({ kind: 'add', text, oldLine: null, newLine: newLine++, words: [] });
      } else if (part.removed) {
        rows.push({ kind: 'del', text, oldLine: oldLine++, newLine: null, words: [] });
      } else {
        rows.push({ kind: 'context', text, oldLine: oldLine++, newLine: newLine++, words: [] });
      }
    }
  }
  pairWords(rows);
  return rows;
}

export function lineStats(rows: DiffRow[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const row of rows) {
    if (row.kind === 'add') {
      added += 1;
    } else if (row.kind === 'del') {
      removed += 1;
    }
  }
  return { added, removed };
}

export type DiffItem =
  | { type: 'hunk'; header: string; hunk: number }
  | { type: 'row'; row: DiffRow; index: number }
  /** Hidden unchanged lines, `key` being the index of the first one. */
  | { type: 'gap'; key: number; count: number };

/** Unchanged lines shown around each change, like `git diff`. */
export const CONTEXT_LINES = 3;

/**
 * Hunks of a unified diff: changed lines with `context` lines around them,
 * an `@@ -a,b +c,d @@` header before each hunk, and the rest collapsed into
 * gaps that can be expanded (`expanded` holds their keys).
 */
export function layoutHunks(rows: DiffRow[], expanded: ReadonlySet<number>, context = CONTEXT_LINES): DiffItem[] {
  const visible = rows.map(() => false);
  rows.forEach((row, index) => {
    if (row.kind !== 'context') {
      for (let i = Math.max(0, index - context); i <= Math.min(rows.length - 1, index + context); i += 1) {
        visible[i] = true;
      }
    }
  });
  if (!visible.includes(true)) {
    return [];
  }
  // Open gaps: every row of a gap the user expanded becomes visible.
  for (let start = 0; start < rows.length; ) {
    if (visible[start]) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < rows.length && !visible[end]) {
      end += 1;
    }
    if (expanded.has(start)) {
      for (let i = start; i < end; i += 1) {
        visible[i] = true;
      }
    }
    start = end;
  }

  const items: DiffItem[] = [];
  let hunk = 0;
  for (let start = 0; start < rows.length; ) {
    let end = start;
    while (end < rows.length && visible[end] === visible[start]) {
      end += 1;
    }
    if (!visible[start]) {
      items.push({ type: 'gap', key: start, count: end - start });
    } else {
      const run = rows.slice(start, end);
      items.push({ type: 'hunk', header: hunkHeader(rows, start, run), hunk: hunk++ });
      run.forEach((row, offset) => items.push({ type: 'row', row, index: start + offset }));
    }
    start = end;
  }
  return items;
}

function hunkHeader(rows: DiffRow[], start: number, run: DiffRow[]): string {
  const range = (side: 'oldLine' | 'newLine') => {
    const numbers = run.map((row) => row[side]).filter((line): line is number => line !== null);
    if (numbers.length > 0) {
      return `${numbers[0]},${numbers.length}`;
    }
    // No line on this side: Git gives the line before the hunk.
    let before = 0;
    for (let i = start - 1; i >= 0; i -= 1) {
      const line = rows[i][side];
      if (line !== null) {
        before = line;
        break;
      }
    }
    return `${before},0`;
  };
  return `@@ -${range('oldLine')} +${range('newLine')} @@`;
}
