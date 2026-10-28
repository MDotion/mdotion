import type { AnyExtension, Extensions, NodeViewRenderer } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Paragraph from '@tiptap/extension-paragraph';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';
import { createLowlight } from 'lowlight';
import { highlightLanguages } from './highlightLanguages';
import { escapeParagraphLines } from './escape';
import { Callout } from './extensions/Callout';
import { HtmlInline } from './extensions/HtmlInline';
import { RawBlock } from './extensions/RawBlock';

export const lowlight = createLowlight(highlightLanguages);

/** Paragraph that escapes line starts which would otherwise re-parse as other blocks. */
const MdotionParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    const rendered = this.parent?.(node, helpers, context) ?? '';
    return escapeParagraphLines(rendered);
  },
});

/** Link that keeps bare autolinks (`https://x.y`) bare instead of `[https://x.y](https://x.y)`. */
const MdotionLink = Link.extend({
  renderMarkdown(node, helpers, context) {
    const href = String(node.attrs?.href ?? '');
    const text = context?.meta?.markText as string | undefined;
    if (text && text === href && /^(https?:\/\/|mailto:)/i.test(href) && !node.attrs?.title) {
      return helpers.renderChildren(node);
    }
    return this.parent?.(node, helpers, context) ?? '';
  },
});

/**
 * Table whose delimiter row lines up with the padded cells: the stock
 * serializer adds the alignment colons on top of the column width.
 */
const MdotionTable = Table.extend({
  renderMarkdown(node, helpers, context) {
    const rendered = this.parent?.(node, helpers, context) ?? '';
    return alignDelimiterRow(rendered);
  },
});

/**
 * Pads each delimiter cell (`---`, `:---`, `---:`, `:---:`) to the width of
 * its column, read from the header row. Idempotent: extensions that wrap the
 * table (node views) may run the renderer chain twice.
 */
export function alignDelimiterRow(table: string): string {
  const lines = table.split('\n');
  const index = lines.findIndex((line) => /^\|( :?-+:? \|)+$/.test(line));
  const header = lines[index - 1];
  if (index < 1 || !header?.startsWith('| ') || !header.endsWith(' |')) {
    return table;
  }
  // Pipes inside cells are always escaped (`\|`) by the serializer.
  const widths = header
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.length - 2);
  const segments = lines[index].slice(1, -1).split('|');
  if (segments.length !== widths.length) {
    return table;
  }
  lines[index] = `|${segments
    .map((segment, column) => {
      const [, left, right] = /^ (:?)-+(:?) $/.exec(segment) ?? ['', '', ''];
      const dashes = Math.max(widths[column] - left.length - right.length, 1);
      return ` ${left}${'-'.repeat(dashes)}${right} `;
    })
    .join('|')}|`;
  return lines.join('\n');
}

/** GFM tables only hold inline content per cell. */
const MarkdownTableCell = TableCell.extend({ content: 'paragraph' });
const MarkdownTableHeader = TableHeader.extend({ content: 'paragraph' });

export type MdotionNodeViews = Partial<
  Record<'codeBlock' | 'image' | 'callout' | 'rawBlock' | 'htmlInline' | 'table', NodeViewRenderer>
>;

function withView<T extends AnyExtension>(extension: T, view: NodeViewRenderer | undefined): T {
  return view ? (extension.extend({ addNodeView: () => view }) as T) : extension;
}

/**
 * Extensions that define the document schema and its Markdown mapping.
 * Shared by the webview editor and the tests; UI-only behaviour (menus,
 * history, placeholders) is layered on top in the webview, node views are
 * injected through `nodeViews`.
 */
export function getMdotionExtensions(nodeViews: MdotionNodeViews = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      paragraph: false,
      codeBlock: false,
      link: false,
      underline: false,
      undoRedo: false,
      trailingNode: false,
      dropcursor: { color: false, width: 4, class: 'mdotion-dropcursor' },
    }),
    MdotionParagraph,
    MdotionLink.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    withView(CodeBlockLowlight, nodeViews.codeBlock).configure({ lowlight, defaultLanguage: null }),
    withView(MdotionTable, nodeViews.table).configure({ resizable: false }),
    TableRow,
    MarkdownTableHeader,
    MarkdownTableCell,
    withView(Image, nodeViews.image).configure({ inline: false, allowBase64: true }),
    withView(Callout, nodeViews.callout),
    withView(RawBlock, nodeViews.rawBlock),
    withView(HtmlInline, nodeViews.htmlInline),
  ];
}
