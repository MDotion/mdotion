import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { blocksOf, diffBlocks, summarize, totalChanges, type BlockChange, type DiffBlock, type DiffSummary } from '../../../src/markdown/blockDiff';
import { frontMatterContent, splitFrontMatter } from '../../../src/markdown/FrontMatter';
import type { Baseline } from '../../../src/shared/messages';
import { getAdapter, getSourceMap } from '../editor/adapter';
import type { EditorSync } from '../sync/EditorSync';

export interface ChangesResult {
  changes: BlockChange[];
  summary: DiffSummary;
  /** Changed blocks, plus one when the page properties changed. */
  total: number;
  /** YAML of the front matter before and after, when it changed. */
  frontMatter: { before: string; after: string } | null;
  /** The whole file at the last commit and as it is now, for the line-by-line Source diff. */
  source: { before: string; after: string };
}

/** Delay after the last edit before the change count is updated. */
const RECOMPUTE_DELAY_MS = 500;

interface BaseSide {
  blocks: DiffBlock[];
  frontMatter: string;
}

/**
 * The HEAD version of the file (sent by the host, ADR-010) and its parsed blocks,
 * kept for the whole session: the comparison runs against the live editor document.
 */
class ChangesModel {
  private baseline: Baseline | null = null;
  private base: BaseSide | null = null;
  private readonly listeners = new Set<() => void>();

  setBaseline(baseline: Baseline): void {
    this.baseline = baseline;
    this.base = null;
    this.listeners.forEach((listener) => listener());
  }

  getBaseline(): Baseline | null {
    return this.baseline;
  }

  /** Whether the file can be compared with a commit (it is in a Git repository). */
  available(): boolean {
    return this.baseline !== null && this.baseline.status !== 'none';
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  compute(editor: Editor, frontMatter: string | null, text: string): ChangesResult | null {
    const base = this.baseSide();
    if (!base) {
      return null;
    }
    const adapter = getAdapter();
    const changes = diffBlocks(base.blocks, blocksOf(editor.state.doc, getSourceMap(), adapter));
    const summary = summarize(changes);
    const after = frontMatter ? frontMatterContent(frontMatter).trim() : '';
    const frontMatterChanged = after !== base.frontMatter;
    return {
      changes,
      summary,
      total: totalChanges(summary) + (frontMatterChanged ? 1 : 0),
      frontMatter: frontMatterChanged ? { before: base.frontMatter, after } : null,
      source: { before: this.baseline?.status === 'ok' ? this.baseline.text : '', after: text },
    };
  }

  private baseSide(): BaseSide | null {
    const baseline = this.baseline;
    if (!baseline || baseline.status === 'none') {
      return null;
    }
    if (!this.base) {
      if (baseline.status === 'untracked') {
        this.base = { blocks: [], frontMatter: '' };
      } else {
        const adapter = getAdapter();
        const { frontMatter, body } = splitFrontMatter(baseline.text);
        const parsed = adapter.parse(body);
        this.base = {
          blocks: blocksOf(parsed.doc, parsed.map, adapter),
          frontMatter: frontMatter ? frontMatterContent(frontMatter).trim() : '',
        };
      }
    }
    return this.base;
  }
}

export const changesModel = new ChangesModel();

/** The changes of the page against the last commit, recomputed shortly after every edit. */
export function useChanges(editor: Editor | null, sync: EditorSync | null, delay = RECOMPUTE_DELAY_MS): ChangesResult | null {
  const [result, setResult] = useState<ChangesResult | null>(null);
  useEffect(() => {
    if (!editor || !sync) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recompute = () => setResult(changesModel.compute(editor, sync.getState().frontMatter, sync.currentText()));
    const schedule = () => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(recompute, delay);
    };
    recompute();
    const offBaseline = changesModel.onChange(recompute);
    const offSync = sync.subscribe(schedule);
    editor.on('update', schedule);
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      offBaseline();
      offSync();
      editor.off('update', schedule);
    };
  }, [editor, sync, delay]);
  return result;
}
