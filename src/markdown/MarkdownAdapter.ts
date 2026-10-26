import { getSchema, type Extensions, type JSONContent, type MarkdownToken } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { escapeInlineText } from './escape';
import { getMdotionExtensions } from './mdotionExtensions';

/**
 * Where a top-level node of the editor document came from in the source text.
 * - `seg`: the node (or part `part` of `of` nodes) produced by top-level source segment `index`.
 * - `gap`: an empty paragraph produced by extra blank lines after segment `index`.
 */
export type NodeOrigin =
  | { kind: 'seg'; index: number; part: number; of: number }
  | { kind: 'gap'; index: number; ordinal: number };

export interface SourceSegment {
  /** Exact source of the block, without trailing newlines. */
  raw: string;
  /** Exact whitespace between this block and the next one. */
  sepAfter: string;
  /** Number of empty paragraphs `sepAfter` maps to in the editor. */
  gaps: number;
}

/**
 * Links an editor document back to the Markdown it was parsed from, so blocks
 * the user did not touch are written back byte for byte.
 */
export class SourceMap {
  private origins = new WeakMap<PMNode, NodeOrigin>();

  constructor(
    readonly leading: string,
    readonly trailing: string,
    readonly segments: SourceSegment[],
    /** Origins aligned with the top-level children of the parsed document. */
    readonly childOrigins: (NodeOrigin | null)[],
  ) {}

  /**
   * Associates the top-level children of `doc` with their origins. Call after
   * the parsed document has been inserted in the editor; children that differ
   * from the parsed ones are left unmapped (and therefore re-serialized).
   */
  bind(doc: PMNode, parsed: PMNode): void {
    this.origins = new WeakMap();
    const count = Math.min(doc.childCount, parsed.childCount, this.childOrigins.length);
    for (let i = 0; i < count; i += 1) {
      const origin = this.childOrigins[i];
      const child = doc.child(i);
      if (origin && child.eq(parsed.child(i))) {
        this.origins.set(child, origin);
      }
    }
  }

  originOf(node: PMNode): NodeOrigin | undefined {
    return this.origins.get(node);
  }
}

export interface ParsedMarkdown {
  doc: PMNode;
  map: SourceMap;
  /** Number of blocks kept as raw source because they cannot be edited visually. */
  rawBlocks: number;
}

/** Every token type the schema can represent (block and inline). Anything else stays raw. */
const SUPPORTED_TOKENS = new Set([
  'paragraph',
  'heading',
  'list',
  'list_item',
  'taskList',
  'taskItem',
  'orderedList',
  'blockquote',
  'callout',
  'code',
  'hr',
  'table',
  'html',
  'space',
  'text',
  'escape',
  'strong',
  'em',
  'del',
  'codespan',
  'link',
  'image',
  'br',
]);

/**
 * Port between Markdown text and the editor document model.
 * Wraps `@tiptap/markdown` and adds what it lacks for editing real files:
 * source-preserving serialization, opaque raw blocks for anything that
 * would not survive a round-trip, and conservative escaping.
 */
export class MarkdownAdapter {
  readonly schema: Schema;
  private readonly manager: MarkdownManager;

  /**
   * @param extensions Extensions defining the Markdown mapping.
   * @param schema The editor's schema when nodes must be inserted into a live editor.
   */
  constructor(extensions: Extensions = getMdotionExtensions(), schema?: Schema) {
    this.schema = schema ?? getSchema(extensions);
    this.manager = new MarkdownManager({ extensions });
    patchManager(this.manager);
  }

  /** Parses a Markdown body (no front matter, LF line endings). */
  parse(body: string): ParsedMarkdown {
    const tokens = this.lex(body);
    let leading = '';
    const segments: (SourceSegment & { token: MarkdownToken })[] = [];

    const addWhitespace = (whitespace: string) => {
      if (segments.length === 0) {
        leading += whitespace;
      } else {
        segments[segments.length - 1].sepAfter += whitespace;
      }
    };

    for (const token of tokens) {
      const raw = token.raw ?? '';
      if (token.type === 'space' || raw.trim() === '') {
        addWhitespace(raw);
        continue;
      }
      // Some custom tokenizers (task lists) include the blank lines before the block.
      const before = /^\n*/.exec(raw)![0];
      const core = raw.slice(before.length).replace(/\n+$/, '');
      addWhitespace(before);
      segments.push({ raw: core, sepAfter: raw.slice(before.length + core.length), gaps: 0, token });
    }
    mergeOpenHtmlBlocks(segments);

    let trailing = '';
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      trailing = last.sepAfter;
      last.sepAfter = '';
    }

    const children: PMNode[] = [];
    const childOrigins: (NodeOrigin | null)[] = [];
    let rawBlocks = 0;

    segments.forEach((segment, index) => {
      let nodes = this.parseSegment(segment.token);
      if (!nodes) {
        nodes = [this.schema.nodes.rawBlock.create({ raw: segment.raw })];
        rawBlocks += 1;
      }
      nodes.forEach((node, part) => {
        children.push(node);
        childOrigins.push({ kind: 'seg', index, part, of: nodes!.length });
      });

      if (index < segments.length - 1) {
        segment.gaps = Math.max(countBlankSeparators(segment.sepAfter) - 1, 0);
        for (let ordinal = 0; ordinal < segment.gaps; ordinal += 1) {
          children.push(this.schema.nodes.paragraph.create());
          childOrigins.push({ kind: 'gap', index, ordinal });
        }
      }
    });

    if (children.length === 0) {
      children.push(this.schema.nodes.paragraph.create());
      childOrigins.push(null);
    }

    const doc = this.schema.nodes.doc.create(null, children);
    const map = new SourceMap(
      leading,
      trailing,
      segments.map(({ raw, sepAfter, gaps }) => ({ raw, sepAfter, gaps })),
      childOrigins,
    );
    map.bind(doc, doc);
    return { doc, map, rawBlocks };
  }

  /** Parses Markdown into block nodes without source tracking (paste, insert). */
  parseFragment(markdown: string): PMNode[] {
    return this.parse(markdown).doc.content.content.filter(
      (node) => !(node.type.name === 'paragraph' && node.childCount === 0),
    );
  }

  /**
   * Serializes a document to Markdown. Top-level blocks that still carry an
   * origin in `map` are emitted exactly as they were in the source.
   */
  serialize(doc: PMNode, map: SourceMap | null): string {
    const { text, emitted, lastSegment, trailingEmpty } = this.renderBlocks(doc.content.content, map);
    if (!emitted) {
      return map && map.segments.length === 0 ? map.leading + map.trailing : '';
    }
    const out = (map ? map.leading : '') + text;
    const lastIndex = map ? map.segments.length - 1 : -1;
    if (map && lastSegment === lastIndex && trailingEmpty === 0) {
      return out + map.trailing;
    }
    const endsWithNewline = !map || map.segments.length === 0 || map.trailing.includes('\n');
    return endsWithNewline ? `${out}\n` : out;
  }

  /**
   * Joins blocks the way a document would, reusing the original source of
   * blocks that carry an origin in `map` (used for copy as well as save).
   */
  private renderBlocks(
    children: readonly PMNode[],
    map: SourceMap | null,
  ): { text: string; emitted: boolean; lastSegment: number | null; trailingEmpty: number } {
    let out = '';
    let emitted = false;
    let prevSegment: number | null = null;
    let pendingEmpty: PMNode[] = [];

    for (let i = 0; i < children.length; ) {
      const node = children[i];
      if (isEmptyParagraph(node)) {
        pendingEmpty.push(node);
        i += 1;
        continue;
      }

      let piece: string | null = null;
      let segment: number | null = null;
      let consumed = 1;
      const origin = map?.originOf(node);
      if (map && origin?.kind === 'seg' && origin.part === 0 && hasAllParts(map, children, i, origin)) {
        piece = map.segments[origin.index].raw;
        segment = origin.index;
        consumed = origin.of;
      }
      if (piece === null) {
        piece = this.serializeNode(node);
      }

      if (!emitted) {
        // Leading whitespace belongs to the caller (the file's own, or none for a copy).
      } else if (
        map &&
        prevSegment !== null &&
        segment === prevSegment + 1 &&
        gapsMatch(map, prevSegment, pendingEmpty)
      ) {
        out += map.segments[prevSegment].sepAfter;
      } else {
        out += '\n\n' + '\n\n'.repeat(pendingEmpty.length);
      }

      out += piece;
      emitted = true;
      prevSegment = segment;
      pendingEmpty = [];
      i += consumed;
    }
    return { text: out, emitted, lastSegment: prevSegment, trailingEmpty: pendingEmpty.length };
  }

  /** Markdown for a single block node, without surrounding newlines. */
  serializeNode(node: PMNode): string {
    return this.manager
      .serialize({ type: 'doc', content: [node.toJSON()] })
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
  }

  /**
   * Markdown for a list of blocks, as a document would join them. With a
   * source map, untouched blocks keep their exact original text.
   */
  serializeNodes(nodes: readonly PMNode[], map: SourceMap | null = null): string {
    return this.renderBlocks(nodes, map).text;
  }

  private lex(body: string): MarkdownToken[] {
    const instance = this.manager.instance;
    const lexer = new instance.Lexer(instance.defaults);
    return lexer.lex(body) as MarkdownToken[];
  }

  /**
   * Parses one top-level token. Returns null when the block must stay raw:
   * unknown syntax, invalid schema content, or output that would not parse
   * back to the same document.
   */
  private parseSegment(token: MarkdownToken): PMNode[] | null {
    if (!isSupportedToken(token)) {
      return null;
    }
    try {
      const json = (this.manager as unknown as ManagerInternals).parseTokens([token], false);
      if (json.length === 0) {
        return null;
      }
      const nodes = json.map((item) => this.schema.nodeFromJSON(item));
      for (const node of nodes) {
        node.check();
        if (!node.isBlock) {
          return null;
        }
      }
      if (nodes.every((node) => node.type.name === 'rawBlock')) {
        return nodes;
      }
      return this.isStable(nodes) ? nodes : null;
    } catch {
      return null;
    }
  }

  /** True when serializing `nodes` and parsing the result yields the same nodes. */
  private isStable(nodes: PMNode[]): boolean {
    const markdown = nodes.map((node) => this.serializeNode(node)).join('\n\n');
    const reparsedJson = this.manager.parse(markdown).content ?? [];
    const reparsed = reparsedJson
      .map((item) => this.schema.nodeFromJSON(item))
      .filter((node) => !isEmptyParagraph(node));
    return reparsed.length === nodes.length && reparsed.every((node, i) => node.eq(nodes[i]));
  }
}

interface ManagerInternals {
  parseTokens(tokens: MarkdownToken[], parseImplicitEmptyParagraphs: boolean): JSONContent[];
  parseHTMLToken(token: MarkdownToken): JSONContent | JSONContent[] | null;
  encodeTextForMarkdown(text: string, node: JSONContent, parentNode?: JSONContent): string;
  codeTypes: Set<string>;
}

/**
 * Adjusts two internals of `@tiptap/markdown` (pinned version):
 * inline HTML is kept verbatim instead of being converted (and stripped)
 * through the schema, and text escaping is minimal.
 */
function patchManager(manager: MarkdownManager): void {
  const internals = manager as unknown as ManagerInternals;
  const originalParseHtml = internals.parseHTMLToken.bind(manager);
  internals.parseHTMLToken = (token) => {
    const raw = String(token.raw ?? token.text ?? '');
    if (!raw.trim()) {
      return null;
    }
    if (token.block) {
      return originalParseHtml(token);
    }
    return { type: 'htmlInline', attrs: { raw } };
  };
  internals.encodeTextForMarkdown = (text, node, parentNode) => {
    const inCode =
      (parentNode?.type != null && internals.codeTypes.has(parentNode.type)) ||
      (node.marks ?? []).some((mark) => internals.codeTypes.has(mark.type));
    return inCode ? text : escapeInlineText(text);
  };
}

function isSupportedToken(token: MarkdownToken): boolean {
  if (!token.type || !SUPPORTED_TOKENS.has(token.type)) {
    return false;
  }
  if (token.type === 'html') {
    return true;
  }
  const children: MarkdownToken[] = [
    ...asArray(token.tokens),
    ...asArray(token.items),
    ...asArray(token.nestedTokens),
    ...asArray(token.header),
    ...asArray(token.rows).flatMap((row) => asArray(row)),
  ];
  return children.every((child) => isSupportedToken({ type: 'text', ...child }));
}

function asArray(value: unknown): MarkdownToken[] {
  return Array.isArray(value) ? (value as MarkdownToken[]) : [];
}

/**
 * `<details>` (or any block tag) whose closing tag comes after blank lines is
 * split by the lexer into several blocks. Rejoin them into one raw HTML block
 * so it is previewed and edited as a whole. Unbalanced tags are left alone.
 */
function mergeOpenHtmlBlocks(segments: (SourceSegment & { token: MarkdownToken })[]): void {
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.token.type !== 'html') {
      continue;
    }
    const tag = /^\s*<([a-zA-Z][\w-]*)/.exec(segment.raw)?.[1];
    if (!tag || tagBalance(segment.raw, tag) <= 0) {
      continue;
    }
    let raw = segment.raw;
    for (let j = i + 1; j < segments.length; j += 1) {
      raw += segments[j - 1].sepAfter + segments[j].raw;
      if (tagBalance(raw, tag) <= 0) {
        segments.splice(i, j - i + 1, {
          raw,
          sepAfter: segments[j].sepAfter,
          gaps: 0,
          token: { type: 'html', block: true, raw, text: raw } as MarkdownToken,
        });
        break;
      }
    }
  }
}

function tagBalance(html: string, tag: string): number {
  const opens = html.match(new RegExp(`<${tag}(?=[\\s>/])`, 'gi'))?.length ?? 0;
  const closes = html.match(new RegExp(`</${tag}\\s*>`, 'gi'))?.length ?? 0;
  return opens - closes;
}

function isEmptyParagraph(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.childCount === 0;
}

function countBlankSeparators(whitespace: string): number {
  return (whitespace.match(/\n[ \t]*\n/g) ?? []).length;
}

function hasAllParts(
  map: SourceMap,
  children: readonly PMNode[],
  start: number,
  origin: Extract<NodeOrigin, { kind: 'seg' }>,
): boolean {
  for (let part = 1; part < origin.of; part += 1) {
    const next = children[start + part];
    const nextOrigin = next ? map.originOf(next) : undefined;
    if (
      !nextOrigin ||
      nextOrigin.kind !== 'seg' ||
      nextOrigin.index !== origin.index ||
      nextOrigin.part !== part
    ) {
      return false;
    }
  }
  return true;
}

function gapsMatch(map: SourceMap, segment: number, empties: PMNode[]): boolean {
  if (empties.length !== map.segments[segment].gaps) {
    return false;
  }
  return empties.every((node, ordinal) => {
    const origin = map.originOf(node);
    return origin?.kind === 'gap' && origin.index === segment && origin.ordinal === ordinal;
  });
}

let defaultAdapter: MarkdownAdapter | null = null;

/** Adapter built on the base schema (tests, tooling). */
export function getDefaultAdapter(): MarkdownAdapter {
  defaultAdapter ??= new MarkdownAdapter();
  return defaultAdapter;
}
