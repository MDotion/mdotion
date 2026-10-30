import { Editor } from '@tiptap/core';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { getDefaultAdapter, MarkdownAdapter } from '../src/markdown/MarkdownAdapter';
import { getMdotionExtensions } from '../src/markdown/mdotionExtensions';
import {
  foldedPositions,
  foldSectionAtCaret,
  isFolded,
  SectionFolding,
  toggleFold,
  toggleFoldAll,
  unfoldSectionAtCaret,
} from '../webview/src/editor/outline/SectionFolding';
import {
  computeOutline,
  moveSection,
  moveSectionDown,
  moveSectionUp,
  nextSibling,
  previousSibling,
} from '../webview/src/editor/outline/sections';

const adapter = getDefaultAdapter();

const DOC = [
  'Preamble text.',
  '# Architecture',
  'Intro paragraph.',
  '## Overview',
  'Overview text.',
  '## System Components',
  '### API Gateway',
  'Gateway text.',
  '### Database',
  '| a | b |\n|---|---|\n| 1 | 2 |',
  '## Security',
  '- keep   this *exact* spacing',
  '- second',
  '## Overview',
  '#### Deep',
  '> # Quoted heading',
].join('\n\n') + '\n';

function load(source = DOC) {
  const parsed = adapter.parse(source);
  const state = EditorState.create({ doc: parsed.doc });
  return { state, map: parsed.map, items: computeOutline(parsed.doc) };
}

describe('computeOutline', () => {
  it('lists top-level headings with their section ranges and parents', () => {
    const { items, state } = load();
    expect(items.map((item) => [item.level, item.text, item.parent])).toEqual([
      [1, 'Architecture', null],
      [2, 'Overview', 0],
      [2, 'System Components', 0],
      [3, 'API Gateway', 2],
      [3, 'Database', 2],
      [2, 'Security', 0],
      [2, 'Overview', 0],
      [4, 'Deep', 6],
    ]);
    const components = items[2];
    expect(state.doc.textBetween(components.pos, components.end, '|')).toBe('System Components|API Gateway|Gateway text.|Database|a|b|1|2');
    expect(items[0].end).toBe(state.doc.content.size);
  });

  it('deduplicates anchors like GitHub and flags problems', () => {
    const { items } = load();
    expect(items.map((item) => item.anchor)).toEqual([
      'architecture',
      'overview',
      'system-components',
      'api-gateway',
      'database',
      'security',
      'overview-1',
      'deep',
    ]);
    expect(items[1].issues).toEqual(['duplicate']);
    expect(items[6].issues).toEqual(['duplicate']);
    expect(items[7].issues).toEqual(['skippedLevel']);
    expect(items[0].issues).toEqual([]);
  });

  it('flags empty headings', () => {
    const { schema } = adapter;
    const doc = schema.nodes.doc.create(null, [schema.nodes.heading.create({ level: 2 }), schema.nodes.paragraph.create()]);
    expect(computeOutline(doc)[0].issues).toEqual(['empty']);
  });

  it('finds siblings within the same parent', () => {
    const { items } = load();
    expect(previousSibling(items, 2)).toBe(1);
    expect(nextSibling(items, 2)).toBe(5);
    expect(previousSibling(items, 3)).toBeNull();
    expect(nextSibling(items, 4)).toBeNull();
    expect(previousSibling(items, 1)).toBeNull();
  });
});

describe('moving sections', () => {
  it('moves a whole section with its subsections, keeping the source of every block', () => {
    const { state, map, items } = load();
    // Security above System Components.
    const tr = moveSection(state, items, 5, items[2].pos)!;
    const out = adapter.serialize(state.apply(tr).doc, map);
    expect(out).toBe(
      [
        'Preamble text.',
        '# Architecture',
        'Intro paragraph.',
        '## Overview',
        'Overview text.',
        '## Security',
        '- keep   this *exact* spacing',
        '- second',
        '## System Components',
        '### API Gateway',
        'Gateway text.',
        '### Database',
        '| a | b |\n|---|---|\n| 1 | 2 |',
        '## Overview',
        '#### Deep',
        '> # Quoted heading',
      ].join('\n\n') + '\n',
    );
  });

  it('moves down past the next sibling section and to the end of the document', () => {
    const { state, map, items } = load('# A\n\na\n\n# B\n\nb\n\n## B1\n\n# C\n');
    const down = state.apply(moveSectionDown(state, items, 0)!);
    expect(adapter.serialize(down.doc, map)).toBe('# B\n\nb\n\n## B1\n\n# A\n\na\n\n# C\n');
    const toEnd = state.apply(moveSection(state, items, 1, state.doc.content.size)!);
    expect(adapter.serialize(toEnd.doc, map)).toBe('# A\n\na\n\n# C\n\n# B\n\nb\n\n## B1\n');
  });

  it('refuses to drop a section inside itself and has no sibling at the edges', () => {
    const { state, items } = load('# A\n\n## A1\n\n# B\n');
    expect(moveSection(state, items, 0, items[1].pos)).toBeNull();
    expect(moveSectionUp(state, items, 0)).toBeNull();
    expect(moveSectionDown(state, items, 2)).toBeNull();
  });

  it('places the caret at the start of the moved heading', () => {
    const { state, items } = load('# A\n\n# B\n');
    const next = state.apply(moveSectionUp(state, items, 1)!);
    expect(next.selection.$from.parent.textContent).toBe('B');
    expect(next.selection.$from.parentOffset).toBe(0);
  });
});

describe('folding sections', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function setup(source: string) {
    const extensions = [...getMdotionExtensions(), SectionFolding];
    editor = new Editor({ extensions, element: document.createElement('div') });
    const local = new MarkdownAdapter(extensions, editor.schema);
    const parsed = local.parse(source);
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, parsed.doc.content));
    parsed.map.bind(editor.state.doc, parsed.doc);
    return { ed: editor, adapter: local, map: parsed.map };
  }

  const SOURCE = '# A\n\na1\n\na2\n\n## A1\n\nsub\n\n# B\n\nb\n';

  it('hides the section content in the view only', () => {
    const { ed, adapter: local, map } = setup(SOURCE);
    toggleFold(ed.view, 0);
    expect(isFolded(ed.state, 0)).toBe(true);
    const hidden = ed.view.dom.querySelectorAll('.mdotion-folded-hidden');
    expect([...hidden].map((node) => node.textContent)).toEqual(['a1', 'a2', 'A1', 'sub']);
    expect(ed.view.dom.querySelector('.mdotion-fold-pill')?.textContent).toBe('4 blocks');
    expect(local.serialize(ed.state.doc, map)).toBe(SOURCE);
    toggleFold(ed.view, 0);
    expect(ed.view.dom.querySelectorAll('.mdotion-folded-hidden')).toHaveLength(0);
  });

  it('keeps folded headings folded while the document changes around them', () => {
    const { ed } = setup(SOURCE);
    const b = computeOutline(ed.state.doc)[2].pos;
    toggleFold(ed.view, b);
    ed.view.dispatch(ed.state.tr.insertText('Title ', 1));
    expect(foldedPositions(ed.state)).toEqual([b + 'Title '.length]);
  });

  it('moves the caret over hidden content instead of into it', () => {
    const { ed } = setup(SOURCE);
    toggleFold(ed.view, 0);
    const inside = computeOutline(ed.state.doc)[1].pos + 2;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 2)));
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, inside)));
    expect(ed.state.selection.$from.parent.textContent).toBe('B');
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, inside)));
    expect(ed.state.selection.$from.parent.textContent).toBe('A');
  });

  it('folds the section around the caret, then its parent, like VS Code', () => {
    const { ed } = setup(SOURCE);
    const [a, a1] = computeOutline(ed.state.doc);
    const sub = a1.pos + ed.state.doc.nodeAt(a1.pos)!.nodeSize + 2;
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, sub)));
    expect(foldSectionAtCaret(ed.view)).toBe(true);
    expect(foldedPositions(ed.state)).toEqual([a1.pos]);
    expect(ed.state.selection.$from.parent.textContent).toBe('A1');
    expect(foldSectionAtCaret(ed.view)).toBe(true);
    expect(foldedPositions(ed.state)).toEqual([a.pos, a1.pos]);
    expect(unfoldSectionAtCaret(ed.view)).toBe(true);
    expect(foldedPositions(ed.state)).toEqual([a1.pos]);
  });

  it('folds everything, or unfolds everything when something is folded', () => {
    const { ed } = setup(SOURCE);
    toggleFoldAll(ed.view);
    expect(foldedPositions(ed.state)).toEqual(computeOutline(ed.state.doc).map((item) => item.pos));
    toggleFoldAll(ed.view);
    expect(foldedPositions(ed.state)).toEqual([]);
    toggleFold(ed.view, 0);
    toggleFoldAll(ed.view);
    expect(foldedPositions(ed.state)).toEqual([]);
  });
});
