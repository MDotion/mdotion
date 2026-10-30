import { Editor } from '@tiptap/core';
import { UndoRedo } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import { foldedPositions, SectionFolding, toggleFold } from '../webview/src/editor/outline/SectionFolding';
import {
  currentMatch,
  matchesOf,
  replaceEverything,
  replaceOne,
  Search,
  setQuery,
  step,
  unsearchedMatches,
  type FindOptions,
} from '../webview/src/editor/search/Search';

const SOURCE = [
  '# Release   notes',
  'The *release* is out. Releases come **mon**thly.',
  '| Name | Release |\n|---|---|\n| one | release-1 |',
  '<div>release in raw HTML</div>',
  '- keep   this *exact* spacing',
].join('\n\n') + '\n';

let editor: Editor | null = null;

function setup(source = SOURCE) {
  const extensions = [...getMdotionExtensions(), UndoRedo, SectionFolding, Search];
  editor = new Editor({ extensions, element: document.createElement('div') });
  const adapter = new MarkdownAdapter(extensions, editor.schema);
  const parsed = adapter.parse(source);
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content).setMeta('addToHistory', false));
  parsed.map.bind(editor.state.doc, parsed.doc);
  return { ed: editor, adapter, map: parsed.map };
}

function find(ed: Editor, search: string, extra: Partial<FindOptions> = {}): string[] {
  setQuery(ed.view, { search, replace: '', caseSensitive: false, wholeWord: false, regexp: false, ...extra });
  return matchesOf(ed.state).map(({ from, to }) => ed.state.doc.textBetween(from, to));
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('find', () => {
  it('finds text in headings, paragraphs and table cells, ignoring case by default', () => {
    const { ed } = setup();
    expect(find(ed, 'release')).toEqual(['Release', 'release', 'Release', 'Release', 'release']);
    expect(find(ed, 'release', { caseSensitive: true })).toEqual(['release', 'release']);
  });

  it('matches whole words and crosses formatting, not blocks', () => {
    const { ed } = setup();
    expect(find(ed, 'release', { wholeWord: true })).toHaveLength(4);
    expect(find(ed, 'monthly')).toEqual(['monthly']);
    expect(find(ed, 'notesThe')).toEqual([]);
  });

  it('supports regular expressions, and reports invalid ones as no match', () => {
    const { ed } = setup();
    expect(find(ed, 'release-\\d', { regexp: true })).toEqual(['release-1']);
    expect(find(ed, '(', { regexp: true })).toEqual([]);
  });

  it('steps through matches and wraps around', () => {
    const { ed } = setup();
    find(ed, 'release', { caseSensitive: true });
    expect(step(ed.view, 1)).toBe(0);
    expect(step(ed.view, 1)).toBe(1);
    expect(step(ed.view, 1)).toBe(0);
    expect(step(ed.view, -1)).toBe(1);
    expect(currentMatch(ed.state, matchesOf(ed.state))).toBe(1);
  });

  it('counts matches in folded sections and unfolds the section when going to one', () => {
    const { ed } = setup('# A\n\nneedle one\n\n# B\n\nneedle two\n');
    toggleFold(ed.view, 0);
    expect(find(ed, 'needle')).toHaveLength(2);
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1)));
    step(ed.view, 1);
    expect(foldedPositions(ed.state)).toEqual([]);
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('needle');
  });

  it('counts the matches it cannot show, in raw Markdown and in the properties', () => {
    const { ed } = setup();
    const options = { search: 'release', replace: '', caseSensitive: false, wholeWord: false, regexp: false };
    expect(unsearchedMatches(ed.state.doc, '---\ntitle: Release\n---\n', options)).toEqual({ raw: 1, properties: 1 });
  });
});

describe('replace', () => {
  it('replaces the selected match and moves to the next one', () => {
    const { ed, adapter, map } = setup('one cat, two cats\n\nthird cat\n');
    setQuery(ed.view, { search: 'cat', replace: 'dog', caseSensitive: false, wholeWord: true, regexp: false });
    replaceOne(ed.view);
    expect(adapter.serialize(ed.state.doc, map)).toBe('one cat, two cats\n\nthird cat\n');
    replaceOne(ed.view);
    expect(adapter.serialize(ed.state.doc, map)).toBe('one dog, two cats\n\nthird cat\n');
    expect(ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to)).toBe('cat');
  });

  it('replaces everything in one undo step, touching only the blocks with a match', () => {
    const { ed, adapter, map } = setup();
    const original = ed.state.doc;
    setQuery(ed.view, { search: 'release', replace: 'launch', caseSensitive: true, wholeWord: false, regexp: false });
    expect(replaceEverything(ed.view)).toBe(2);
    const out = adapter.serialize(ed.state.doc, map);
    expect(out).toContain('# Release   notes');
    expect(out).toContain('The *launch* is out.');
    expect(out).toContain('launch-1');
    expect(out).toContain('<div>release in raw HTML</div>');
    expect(out).toContain('- keep   this *exact* spacing');
    ed.commands.undo();
    expect(ed.state.doc.eq(original)).toBe(true);
    // The edited table is rebuilt by undo, so it is written again (padded); the other blocks keep their source.
    const undone = adapter.serialize(ed.state.doc, map);
    expect(undone).toContain('The *release* is out. Releases come **mon**thly.');
    expect(undone).toContain('- keep   this *exact* spacing');
  });

  it('uses regular expression groups in the replacement', () => {
    const { ed, adapter, map } = setup('Date: 2026-10-29\n');
    setQuery(ed.view, { search: '(\\d+)-(\\d+)-(\\d+)', replace: '$3/$2/$1', caseSensitive: false, wholeWord: false, regexp: true });
    replaceEverything(ed.view);
    expect(adapter.serialize(ed.state.doc, map)).toBe('Date: 29/10/2026\n');
  });

  it('replaces a thousand matches quickly', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i} has a word to replace.`);
    const { ed } = setup(lines.join('\n\n') + '\n');
    setQuery(ed.view, { search: 'word', replace: 'term', caseSensitive: false, wholeWord: false, regexp: false });
    const start = performance.now();
    expect(replaceEverything(ed.view)).toBe(1000);
    expect(performance.now() - start).toBeLessThan(1500);
    expect(matchesOf(ed.state)).toHaveLength(0);
  });
});
