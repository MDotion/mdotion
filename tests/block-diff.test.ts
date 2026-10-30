import { describe, expect, it } from 'vitest';
import { blocksOf, diffBlocks, inlineChanges, similarity, summarize, type BlockChange } from '../src/markdown/blockDiff';
import { getDefaultAdapter } from '../src/markdown/MarkdownAdapter';

const adapter = getDefaultAdapter();

function compare(before: string, after: string): BlockChange[] {
  const base = adapter.parse(before);
  const current = adapter.parse(after);
  return diffBlocks(blocksOf(base.doc, base.map, adapter), blocksOf(current.doc, current.map, adapter));
}

/** `kind:text` for every entry, to read the merged sequence at a glance. */
function shape(changes: BlockChange[]): string[] {
  return changes.map((change) => {
    const node = change.kind === 'removed' ? change.base.node : change.current.node;
    const moved =
      (change.kind === 'added' && change.movedFrom !== null) || (change.kind === 'removed' && change.movedTo !== null) ? '(moved)' : '';
    const formatting = change.kind === 'unchanged' && change.formatting ? '(formatting)' : '';
    return `${change.kind}${moved}${formatting}:${node.textContent.slice(0, 20)}`;
  });
}

describe('diffBlocks', () => {
  it('finds nothing in identical documents', () => {
    const text = '# Title\n\nSome text.\n\n- a\n- b\n';
    expect(summarize(compare(text, text))).toEqual({ added: 0, removed: 0, modified: 0, moved: 0 });
  });

  it('ignores the blank lines between blocks', () => {
    expect(summarize(compare('One.\n\nTwo.\n', 'One.\n\n\n\nTwo.\n'))).toEqual({ added: 0, removed: 0, modified: 0, moved: 0 });
  });

  it('marks added and removed blocks in reading order', () => {
    const changes = compare('One.\n\nTwo.\n\nThree.\n', 'One.\n\nNew block here.\n\nThree.\n\nFour.\n');
    expect(shape(changes)).toEqual(['unchanged:One.', 'removed:Two.', 'added:New block here.', 'unchanged:Three.', 'added:Four.']);
  });

  it('shows a rewritten paragraph as modified, with the changed words', () => {
    const changes = compare('The quick brown fox jumps.\n', 'The quick red fox jumps high.\n');
    expect(shape(changes)).toEqual(['modified:The quick red fox ju']);
    const change = changes[0] as Extract<BlockChange, { kind: 'modified' }>;
    const inline = inlineChanges(change.base.node, change.current.node)!;
    const text = change.current.node.textContent;
    expect(inline.inserted.map(({ from, to }) => text.slice(from, to))).toEqual(['red', 'high']);
    expect(inline.deleted.map(({ text: deleted }) => deleted.trim())).toEqual(['brown']);
  });

  it('locates inline changes inside lists and tables', () => {
    const changes = compare('- alpha\n- beta\n', '- alpha\n- gamma\n');
    const change = changes[0] as Extract<BlockChange, { kind: 'modified' }>;
    const inline = inlineChanges(change.base.node, change.current.node)!;
    const node = change.current.node;
    expect(inline.inserted.map(({ from, to }) => node.textBetween(from, to))).toEqual(['gamma']);
    expect(inline.deleted.map(({ text }) => text)).toEqual(['beta']);
  });

  it('does not count a change of Markdown formatting only', () => {
    const changes = compare('| a | b |\n|---|---|\n| 1 | 2 |\n\n* one\n* two\n', '| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n- one\n- two\n');
    expect(shape(changes)).toEqual(['unchanged(formatting):ab12', 'unchanged(formatting):onetwo']);
    expect(summarize(changes).modified).toBe(0);
  });

  it('keeps a table with rows added as the same table, and replaces one whose columns changed', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    expect(shape(compare(table, '| a | b |\n|---|---|\n| 1 | 3 |\n'))).toEqual(['modified:ab13']);
    expect(shape(compare(table, `${table}| 5 | 6 |\n`))).toEqual(['modified:ab1256']);
    expect(shape(compare(table, '| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n'))).toEqual(['removed:ab12', 'added:abc123']);
  });

  it('keeps a list that gained items as the same list', () => {
    const before = '- one\n- two\n';
    expect(shape(compare(before, '- one\n- two\n- three\n- four\n- five\n- six\n'))).toEqual(['modified:onetwothreefourfives']);
  });

  it('links a moved section instead of counting it as removed and added', () => {
    const before = '# A\n\nText of A.\n\n# B\n\nText of B.\n\n# C\n\nText of C.\n';
    const after = '# A\n\nText of A.\n\n# C\n\nText of C.\n\n# B\n\nText of B.\n';
    const changes = compare(before, after);
    expect(summarize(changes)).toEqual({ added: 0, removed: 0, modified: 0, moved: 2 });
    const removed = changes.findIndex((change) => change.kind === 'removed');
    const target = (changes[removed] as Extract<BlockChange, { kind: 'removed' }>).movedTo!;
    expect((changes[target] as Extract<BlockChange, { kind: 'added' }>).movedFrom).toBe(removed);
  });

  it('keeps a block turned into another type as modified', () => {
    expect(shape(compare('Release notes\n', '## Release notes\n'))).toEqual(['modified:Release notes']);
  });

  it('shows a code block edit as modified', () => {
    const changes = compare('```js\nconst a = 1;\nconsole.log(a);\n```\n', '```js\nconst a = 2;\nconsole.log(a);\n```\n');
    expect(shape(changes)).toEqual(['modified:const a = 2;\nconsole']);
  });

  it('replaces raw blocks instead of editing them', () => {
    expect(shape(compare('<div>one</div>\n', '<div>two</div>\n')).map((entry) => entry.split(':')[0])).toEqual(['removed', 'added']);
  });

  it('handles empty documents', () => {
    expect(summarize(compare('', 'Hello.\n'))).toEqual({ added: 1, removed: 0, modified: 0, moved: 0 });
    expect(summarize(compare('Hello.\n', ''))).toEqual({ added: 0, removed: 1, modified: 0, moved: 0 });
  });

  it('diffs a thousand blocks quickly', () => {
    const blocks = Array.from({ length: 1000 }, (_, i) => `Paragraph number ${i} with some words in it.`);
    const before = blocks.join('\n\n');
    const edited = [...blocks];
    edited[100] = 'Paragraph number 100 with other words in it.';
    edited.splice(500, 1);
    edited.splice(800, 0, 'A brand new paragraph.');
    const base = adapter.parse(before);
    const current = adapter.parse(edited.join('\n\n'));
    const start = performance.now();
    const summary = summarize(diffBlocks(blocksOf(base.doc, base.map, adapter), blocksOf(current.doc, current.map, adapter)));
    expect(performance.now() - start).toBeLessThan(500);
    expect(summary).toEqual({ added: 1, removed: 1, modified: 1, moved: 0 });
  });
});

describe('similarity', () => {
  it('compares words, not characters', () => {
    expect(similarity('a b c d', 'a b c d')).toBe(1);
    expect(similarity('one two three four', 'one two five six')).toBe(0.5);
    expect(similarity('alpha', 'omega')).toBe(0);
  });
});
