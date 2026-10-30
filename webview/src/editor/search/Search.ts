import { Extension } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { getMatchHighlights, replaceAll, replaceCurrent, search, SearchQuery, setSearchState } from 'prosemirror-search';
import { pageScroller } from '../../lib/scroll';
import { revealPosition } from '../outline/SectionFolding';

/**
 * Find and Replace in the page (Cmd+F). Matches are decorations (view only);
 * a replacement touches only the blocks that contain a match (ADR-002).
 */
export const Search = Extension.create({
  name: 'mdotionSearch',
  addProseMirrorPlugins() {
    return [search()];
  },
});

export interface FindOptions {
  search: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export function toQuery(options: FindOptions): SearchQuery {
  return new SearchQuery({ ...options, literal: !options.regexp });
}

export function setQuery(view: EditorView, options: FindOptions | null): void {
  view.dispatch(setSearchState(view.state.tr, toQuery(options ?? { search: '', replace: '', caseSensitive: false, wholeWord: false, regexp: false })));
}

export interface Match {
  from: number;
  to: number;
}

/** Every match of the current query, in document order (folded sections included). */
export function matchesOf(state: EditorState): Match[] {
  return getMatchHighlights(state)
    .find()
    .map(({ from, to }) => ({ from, to }));
}

/** Index of the match the selection is on, or -1. */
export function currentMatch(state: EditorState, matches: Match[]): number {
  const { from, to } = state.selection;
  return matches.findIndex((match) => match.from === from && match.to === to);
}

/** Selects a match and brings it into view: unfolds the sections hiding it, centers it if it is off screen. */
export function selectMatch(view: EditorView, match: Match): void {
  revealPosition(view, match.from);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)));
  revealInViewport(view, match.from);
}

function revealInViewport(view: EditorView, pos: number): void {
  requestAnimationFrame(() => {
    let coords: { top: number; bottom: number };
    try {
      coords = view.coordsAtPos(pos);
    } catch {
      return;
    }
    const scroller = pageScroller();
    const isDocument = scroller === document.scrollingElement || scroller === document.documentElement;
    const box = isDocument ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    const top = box.top + (document.querySelector<HTMLElement>('.mdotion-topbar')?.offsetHeight ?? 0);
    const margin = 80;
    if (coords.top < top + margin || coords.bottom > box.bottom - margin) {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + coords.top - (top + box.bottom) / 2),
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
  });
}

/**
 * Moves to the next (1) or previous (-1) match from the selection, wrapping
 * around. Returns the index of the selected match, or -1 when there is none.
 */
export function step(view: EditorView, direction: 1 | -1): number {
  const matches = matchesOf(view.state);
  if (matches.length === 0) {
    return -1;
  }
  const { from, to } = view.state.selection;
  let index: number;
  if (direction === 1) {
    index = matches.findIndex((match) => match.from >= to && !(match.from === from && match.to === to));
    if (index === -1) {
      index = 0;
    }
  } else {
    index = -1;
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      if (matches[i].to <= from && !(matches[i].from === from && matches[i].to === to)) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      index = matches.length - 1;
    }
  }
  selectMatch(view, matches[index]);
  return index;
}

/** The first match at or after `pos` (where the search started), wrapping around. */
export function nearestMatch(state: EditorState, pos: number): Match | null {
  const matches = matchesOf(state);
  return matches.find((match) => match.from >= pos) ?? matches[0] ?? null;
}

/** Replaces the selected match (or selects the next one first, like VS Code), then moves on. */
export function replaceOne(view: EditorView): void {
  const matches = matchesOf(view.state);
  if (currentMatch(view.state, matches) === -1) {
    step(view, 1);
    return;
  }
  replaceCurrent(view.state, (tr) => view.dispatch(closeHistory(tr)));
  // After the replaced text, which stays selected: it may contain the query itself.
  const next = nearestMatch(view.state, view.state.selection.to);
  if (next) {
    selectMatch(view, next);
  }
}

/** Replaces every match in one transaction: a single undo step. Returns how many were replaced. */
export function replaceEverything(view: EditorView): number {
  const count = matchesOf(view.state).length;
  if (count > 0) {
    replaceAll(view.state, (tr) => view.dispatch(closeHistory(tr)));
  }
  return count;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The query as a JavaScript regular expression, for text the editor does not search itself. */
function toRegExp(options: FindOptions): RegExp | null {
  if (!options.search) {
    return null;
  }
  let source = options.regexp ? options.search : escapeRegExp(options.search);
  if (options.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  }
  try {
    return new RegExp(source, `gu${options.caseSensitive ? '' : 'i'}`);
  } catch {
    return null;
  }
}

function countIn(text: string, pattern: RegExp): number {
  let count = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    count += 1;
    if (match[0] === '') {
      pattern.lastIndex += 1;
    }
  }
  return count;
}

/**
 * Matches in text the editor keeps as source (raw blocks, inline HTML) and in
 * the page properties: they are not highlighted nor replaced, only counted.
 */
export function unsearchedMatches(doc: PMNode, frontMatter: string | null, options: FindOptions): { raw: number; properties: number } {
  const pattern = toRegExp(options);
  if (!pattern) {
    return { raw: 0, properties: 0 };
  }
  let raw = 0;
  doc.descendants((node) => {
    if (node.type.name === 'rawBlock' || node.type.name === 'htmlInline') {
      raw += countIn(String(node.attrs.raw ?? ''), pattern);
      return false;
    }
    return true;
  });
  return { raw, properties: frontMatter ? countIn(frontMatter, pattern) : 0 };
}

export function isValidQuery(options: FindOptions): boolean {
  return toQuery(options).valid;
}
