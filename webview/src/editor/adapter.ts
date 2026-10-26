import type { Extensions } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { MarkdownAdapter, type SourceMap } from '../../../src/markdown/MarkdownAdapter';

let adapter: MarkdownAdapter | null = null;

/** Creates the adapter bound to the live editor schema (nodes must share it). */
export function initAdapter(extensions: Extensions, schema: Schema): MarkdownAdapter {
  adapter = new MarkdownAdapter(extensions, schema);
  return adapter;
}

export function getAdapter(): MarkdownAdapter {
  if (!adapter) {
    throw new Error('Mdotion: Markdown adapter used before the editor was created');
  }
  return adapter;
}

let sourceMap: SourceMap | null = null;

/** The source map of the document currently in the editor (kept by EditorSync). */
export function setSourceMap(map: SourceMap | null): void {
  sourceMap = map;
}

export function getSourceMap(): SourceMap | null {
  return sourceMap;
}
