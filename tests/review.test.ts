import { describe, expect, it } from 'vitest';
import { blocksOf, diffBlocks } from '../src/markdown/blockDiff';
import { getDefaultAdapter } from '../src/markdown/MarkdownAdapter';
import { diffRows, layoutHunks, lineStats } from '../webview/src/changes/lineDiff';
import { hunksOf, reviewContent, reviewDecorations, reviewEntries } from '../webview/src/changes/review';

const adapter = getDefaultAdapter();

function rendered(before: string, after: string) {
  const base = adapter.parse(before);
  const current = adapter.parse(after);
  const entries = reviewEntries(diffBlocks(blocksOf(base.doc, base.map, adapter), blocksOf(current.doc, current.map, adapter)));
  const doc = adapter.schema.nodeFromJSON(reviewContent(entries));
  const decorations = reviewDecorations(doc, entries, null).find();
  /** `side:text` of every block, and of every item / row of the lists and tables diffed item by item. */
  const lines: string[] = [];
  entries.forEach((entry) => {
    if (entry.children) {
      entry.children.forEach((child) => lines.push(`${child.side}:${child.node.textContent}`));
    } else {
      lines.push(`${entry.side}:${entry.node.textContent}`);
    }
  });
  const words = decorations
    .filter((decoration) => (decoration as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class === 'mdotion-rdiff-word')
    .map((decoration) => doc.textBetween(decoration.from, decoration.to));
  return { entries, lines, words };
}

const blocks = (...texts: string[]) => texts.join('\n\n') + '\n';

describe('Rendered diff', () => {
  it('shows removed blocks in red where they were, and added ones in green', () => {
    expect(rendered(blocks('One.', 'Two.', 'Three.'), blocks('One.', 'Three.', 'Four.')).lines).toEqual([
      'context:One.',
      'del:Two.',
      'context:Three.',
      'add:Four.',
    ]);
  });

  it('shows a changed paragraph like a changed line: the old one, then the new one, with the words marked', () => {
    const { lines, words } = rendered('The quick brown fox.\n', 'The quick red fox.\n');
    expect(lines).toEqual(['del:The quick brown fox.', 'add:The quick red fox.']);
    expect(words).toEqual(['brown', 'red']);
  });

  it('diffs a list item by item: only the new items are green', () => {
    const { lines } = rendered('- one\n- two\n', '- one\n- two\n- three\n');
    expect(lines).toEqual(['context:one', 'context:two', 'add:three']);
  });

  it('diffs a table row by row', () => {
    const { lines } = rendered('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n', '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 5 |\n');
    expect(lines).toEqual(['context:ab', 'context:12', 'del:34', 'add:35']);
  });

  it('groups consecutive changed blocks into one change to navigate', () => {
    const { entries } = rendered(blocks('A.', 'B.', 'C.', 'D.'), blocks('A.', 'B2 new.', 'C.', 'D2 new.'));
    expect(hunksOf(entries)).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });
});

describe('Source diff', () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

  it('numbers old and new lines and marks the words that changed', () => {
    const rows = diffRows('a b c\nsame\n', 'a x c\nsame\nnew\n');
    expect(rows.map((row) => [row.kind, row.oldLine, row.newLine, row.text])).toEqual([
      ['del', 1, null, 'a b c'],
      ['add', null, 1, 'a x c'],
      ['context', 2, 2, 'same'],
      ['add', null, 3, 'new'],
    ]);
    expect(rows[0].words.map(([from, to]) => rows[0].text.slice(from, to))).toEqual(['b']);
    expect(rows[1].words.map(([from, to]) => rows[1].text.slice(from, to))).toEqual(['x']);
    expect(lineStats(rows)).toEqual({ added: 2, removed: 1 });
  });

  it('shows three lines of context around each change, with Git hunk headers', () => {
    const after = before.replace('line 10\n', 'line ten\n');
    const items = layoutHunks(diffRows(before, after), new Set());
    expect(items[0]).toEqual({ type: 'gap', key: 0, count: 6 });
    expect(items[1]).toEqual({ type: 'hunk', header: '@@ -7,7 +7,7 @@', hunk: 0 });
    expect(items.filter((item) => item.type === 'row')).toHaveLength(8);
    expect(items.at(-1)).toEqual({ type: 'gap', key: 14, count: 7 });
  });

  it('expands a gap, merging the hunks around it', () => {
    const after = before.replace('line 2\n', 'line two\n').replace('line 19\n', 'line nineteen\n');
    const rows = diffRows(before, after);
    const collapsed = layoutHunks(rows, new Set());
    expect(collapsed.filter((item) => item.type === 'hunk')).toHaveLength(2);
    const gap = collapsed.find((item) => item.type === 'gap')!;
    const open = layoutHunks(rows, new Set([(gap as { key: number }).key]));
    expect(open.filter((item) => item.type === 'hunk')).toHaveLength(1);
    expect(open.filter((item) => item.type === 'gap')).toHaveLength(0);
  });

  it('has nothing to show for identical files', () => {
    expect(layoutHunks(diffRows(before, before), new Set())).toEqual([]);
  });
});
