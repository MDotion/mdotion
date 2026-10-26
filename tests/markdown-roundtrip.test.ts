import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { joinFrontMatter, splitFrontMatter } from '../src/markdown/FrontMatter';
import { getDefaultAdapter } from '../src/markdown/MarkdownAdapter';

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtures = readdirSync(fixturesDir).filter((name) => name.endsWith('.md'));
const adapter = getDefaultAdapter();

function load(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf8').replace(/\r\n/g, '\n');
}

/** Parses `body`, applies `edit` to the document, and serializes with the source map. */
function editAndSerialize(body: string, edit: (state: EditorState) => Transaction): string {
  const parsed = adapter.parse(body);
  const state = EditorState.create({ doc: parsed.doc });
  const next = state.apply(edit(state));
  return adapter.serialize(next.doc, parsed.map);
}

/** Position right after the text `needle` in the document. */
function posAfter(doc: PMNode, needle: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) {
      return found < 0;
    }
    const index = node.text!.indexOf(needle);
    if (index >= 0) {
      found = pos + index + needle.length;
    }
    return false;
  });
  if (found < 0) {
    throw new Error(`"${needle}" not found`);
  }
  return found;
}

function changedLines(before: string, after: string): string[] {
  const a = before.split('\n');
  const b = after.split('\n');
  return b.filter((line, i) => line !== a[i]);
}

describe('round-trip without edits', () => {
  it.each(fixtures)('%s is written back byte for byte', (name) => {
    const original = load(name);
    const { frontMatter, body } = splitFrontMatter(original);
    const parsed = adapter.parse(body);
    expect(joinFrontMatter(frontMatter, adapter.serialize(parsed.doc, parsed.map))).toBe(original);
  });

  it.each(fixtures)('%s re-serialized from scratch parses back to the same document', (name) => {
    const { body } = splitFrontMatter(load(name));
    const parsed = adapter.parse(body);
    const fresh = adapter.serialize(parsed.doc, null);
    expect(adapter.parse(fresh).doc.eq(parsed.doc)).toBe(true);
  });

  it('keeps a missing final newline missing and an existing one present', () => {
    for (const body of ['# Title\n\nText', '# Title\n\nText\n']) {
      const parsed = adapter.parse(body);
      expect(adapter.serialize(parsed.doc, parsed.map)).toBe(body);
    }
  });
});

describe('editing preserves untouched blocks', () => {
  const body = splitFrontMatter(load('notion.md')).body;

  it('changes only the edited line', () => {
    const after = editAndSerialize(body, (state) => state.tr.insertText(' (updated)', posAfter(state.doc, 'Project roadmap')));
    expect(changedLines(body, after)).toEqual(['# Project roadmap (updated)']);
  });

  it('keeps tables, HTML, callouts, images and footnotes after an unrelated edit', () => {
    const after = editAndSerialize(body, (state) => state.tr.insertText('!', posAfter(state.doc, 'A plain quote.')));
    for (const snippet of [
      '| :------ | -----: |',
      '<details>\n<summary>Raw HTML stays untouched</summary>',
      '> [!TIP]\n> Callouts are GitHub alerts.',
      '![Diagram](./images/diagram.png "Architecture")',
      '[^1]: Footnotes are kept as written.',
      'Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save.',
      '***',
    ]) {
      expect(after).toContain(snippet);
    }
    expect(after).toContain('> A plain quote.!');
  });

  it('does not escape snake_case, ampersands, footnotes or bare URLs in an edited paragraph', () => {
    const after = editAndSerialize(body, (state) => state.tr.insertText('X', posAfter(state.doc, 'Intro with ')));
    const paragraph = after.split('\n\n').find((block) => block.startsWith('Intro with X'));
    expect(paragraph).toBe(
      'Intro with X**bold**, *italic*, ~~strike~~, `code`, a [link](https://example.com "Example") and https://example.org.\n' +
        'Same paragraph after a soft break, with snake_case_names, Tom & Jerry and a footnote[^1].',
    );
  });

  it('keeps inline HTML when its paragraph is edited', () => {
    const after = editAndSerialize(body, (state) => state.tr.insertText(' now', posAfter(state.doc, 'to save.')));
    expect(after).toContain('Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save. now');
  });

  it('serializes an edited table cell back to a GFM table', () => {
    const after = editAndSerialize(body, (state) => state.tr.insertText('!', posAfter(state.doc, 'Tables')));
    expect(after).toMatch(/\| Tables! +\| ✅ +\|/);
    expect(adapter.parse(after).doc.content.content.some((node) => node.type.name === 'table')).toBe(true);
  });

  it('toggling a task only rewrites its list', () => {
    const parsed = adapter.parse(body);
    let taskPos = -1;
    parsed.doc.descendants((node, pos) => {
      if (taskPos < 0 && node.type.name === 'taskItem' && !node.attrs.checked) {
        taskPos = pos;
      }
    });
    const after = editAndSerialize(body, (state) =>
      state.tr.setNodeMarkup(taskPos, undefined, { ...state.doc.nodeAt(taskPos)!.attrs, checked: true }),
    );
    expect(changedLines(body, after)).toEqual(['- [x] open task']);
  });

  it('deleting a block removes exactly its lines (no stray blank lines)', () => {
    const after = editAndSerialize(body, (state) => {
      let quote = -1;
      state.doc.forEach((node, offset) => {
        if (node.type.name === 'blockquote') {
          quote = offset;
        }
      });
      return state.tr.delete(quote, quote + state.doc.nodeAt(quote)!.nodeSize);
    });
    expect(after).toBe(body.replace('> A plain quote.\n\n', ''));
  });

  it('escapes typed text that would turn into another block', () => {
    const after = editAndSerialize('Hello\n', (state) => {
      const tr = state.tr.insertText('# not a heading', 1, 6);
      return tr.setSelection(TextSelection.create(tr.doc, 1));
    });
    expect(after).toBe('\\# not a heading\n');
    expect(adapter.parse(after).doc.firstChild?.type.name).toBe('paragraph');
  });

  it('round-trips empty paragraphs as blank lines', () => {
    const source = 'One\n\nTwo\n';
    const after = editAndSerialize(source, (state) =>
      state.tr.insert(state.doc.child(0).nodeSize, state.schema.nodes.paragraph.create()),
    );
    expect(after).toBe('One\n\n\n\nTwo\n');
    const reparsed = adapter.parse(after);
    expect(reparsed.doc.childCount).toBe(3);
    expect(adapter.serialize(reparsed.doc, reparsed.map)).toBe(after);
  });
});

describe('unsupported content', () => {
  it('keeps HTML blocks and unknown syntax verbatim after editing a neighbour', () => {
    const body = load('unsupported.md');
    const after = editAndSerialize(body, (state) => state.tr.insertText('!', posAfter(state.doc, 'exotic syntax.')));
    expect(after).toBe(body.replace('exotic syntax.', 'exotic syntax.!'));
  });

  it('turns constructs the editor cannot round-trip into raw blocks instead of dropping them', () => {
    const body = 'Badge [![build](https://img.shields.io/x.svg)](https://ci.example) text\n\n[ref]: https://example.com\n';
    const parsed = adapter.parse(body);
    expect(parsed.rawBlocks).toBe(2);
    expect(adapter.serialize(parsed.doc, null)).toBe(body);
  });
});

describe('callouts', () => {
  it('parses GitHub alerts as callouts and keeps plain quotes as quotes', () => {
    const parsed = adapter.parse('> [!WARNING]\n> Careful\n\n> Just a quote\n');
    expect(parsed.doc.content.content.map((node) => node.type.name)).toEqual(['callout', 'blockquote']);
    expect(parsed.doc.firstChild?.attrs.type).toBe('warning');
    expect(adapter.serialize(parsed.doc, null)).toBe('> [!WARNING]\n> Careful\n\n> Just a quote\n');
  });
});

describe('front matter', () => {
  it('splits and joins front matter exactly', () => {
    const original = load('frontmatter.md');
    const { frontMatter, body } = splitFrontMatter(original);
    expect(frontMatter).toContain('title: Sample doc');
    expect(body.startsWith('\n# Body')).toBe(true);
    expect(joinFrontMatter(frontMatter, body)).toBe(original);
  });

  it('accepts empty front matter', () => {
    expect(splitFrontMatter('---\n---\nText\n')).toEqual({ frontMatter: '---\n---\n', body: 'Text\n' });
  });

  it('does not mistake a leading horizontal rule for front matter', () => {
    expect(splitFrontMatter('---\n\nText\n\n---\n').frontMatter).toBeNull();
  });
});

describe('HTML blocks', () => {
  it('keeps a <details> section spanning blank lines as one raw block', () => {
    const body = '<details>\n<summary>More</summary>\n\nHidden **body**.\n\n</details>\n\nAfter\n';
    const parsed = adapter.parse(body);
    expect(parsed.doc.content.content.map((node) => node.type.name)).toEqual(['rawBlock', 'paragraph']);
    expect(parsed.doc.firstChild?.attrs.raw).toBe('<details>\n<summary>More</summary>\n\nHidden **body**.\n\n</details>');
    expect(adapter.serialize(parsed.doc, parsed.map)).toBe(body);
    expect(adapter.serialize(parsed.doc, null)).toBe(body);
  });

  it('does not swallow the rest of the document for an unclosed tag', () => {
    const parsed = adapter.parse('<div>\n\nText\n');
    expect(parsed.doc.content.content.map((node) => node.type.name)).toEqual(['rawBlock', 'paragraph']);
  });
});
