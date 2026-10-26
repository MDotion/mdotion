import type { Node as PMNode, Slice } from '@tiptap/pm/model';
import type { MarkdownAdapter, SourceMap } from '../../../src/markdown/MarkdownAdapter';

/**
 * Plain-text clipboard flavour of a copied slice, as Markdown:
 * - text inside a single block (even nested in a list or quote) → inline Markdown, no `- ` / `#` prefix;
 * - whole blocks → Markdown blocks; untouched ones keep their exact source text via `map`.
 */
export function sliceToMarkdown(slice: Slice, adapter: MarkdownAdapter, map: SourceMap | null): string {
  let content = slice.content;
  let depth = slice.openStart;
  while (content.childCount === 1 && depth > 0 && !content.firstChild!.isTextblock) {
    content = content.firstChild!.content;
    depth -= 1;
  }
  const single = content.childCount === 1 ? content.firstChild! : null;
  if (single?.isTextblock && depth > 0) {
    return inlineMarkdown(single, adapter);
  }

  const nodes: PMNode[] = [];
  slice.content.forEach((node) => nodes.push(node));
  if (nodes.every((node) => node.isInline)) {
    return inlineMarkdown(adapter.schema.nodes.paragraph.create(null, slice.content), adapter);
  }
  return adapter.serializeNodes(nodes, map);
}

function inlineMarkdown(textblock: PMNode, adapter: MarkdownAdapter): string {
  if (textblock.type.spec.code) {
    return textblock.textContent;
  }
  return adapter.serializeNode(adapter.schema.nodes.paragraph.create(null, textblock.content));
}
