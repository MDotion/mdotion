import { Node, mergeAttributes, type MarkdownToken } from '@tiptap/core';

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

const MARKER_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;
const START_RE = /^ {0,3}> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im;
/** The marker line plus every following line that keeps the `>` prefix. */
const BLOCK_RE = /^ {0,3}> ?\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n|$)(?: {0,3}>[^\n]*(?:\n|$))*/i;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type?: CalloutType) => ReturnType;
      toggleCallout: (type?: CalloutType) => ReturnType;
    };
  }
}

/**
 * Notion-like callout stored as a GitHub alert:
 *
 *     > [!NOTE]
 *     > Text
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  // Must run before Blockquote so `> [!NOTE]` is claimed here first.
  priority: 200,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-callout') ?? 'note',
        renderHTML: (attributes) => ({ 'data-callout': attributes.type as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'mdotion-callout' }), 0];
  },

  // A dedicated token: registering on `blockquote` would also make the
  // serializer pick this renderer for plain quotes (it resolves renderers by
  // token name first).
  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => {
      const match = START_RE.exec(src);
      return match ? match.index : -1;
    },
    tokenize: (src, _tokens, lexer) => {
      const match = BLOCK_RE.exec(src);
      if (!match) {
        return undefined;
      }
      const raw = match[0];
      const inner = raw
        .replace(/\n$/, '')
        .split('\n')
        .map((line) => line.replace(/^ {0,3}> ?/, ''))
        .join('\n');
      const marker = MARKER_RE.exec(inner);
      if (!marker) {
        return undefined;
      }
      return {
        type: 'callout',
        raw,
        calloutType: marker[1].toLowerCase(),
        tokens: lexer.blockTokens(inner.slice(marker[0].length)),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const parseBlocks = helpers.parseBlockChildren ?? helpers.parseChildren;
    const content = parseBlocks((token.tokens ?? []) as MarkdownToken[]);
    return helpers.createNode(
      'callout',
      { type: token.calloutType ?? 'note' },
      content.length > 0 ? content : [{ type: 'paragraph' }],
    );
  },

  renderMarkdown: (node, h) => {
    const type = String(node.attrs?.type ?? 'note').toUpperCase();
    const body = (node.content ?? []).map((child, index) => {
      const rendered = h.renderChild?.(child, index) ?? h.renderChildren([child]);
      return rendered
        .split('\n')
        .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
        .join('\n');
    });
    const content = body.filter((part) => part !== '>' && part !== '');
    return content.length > 0 ? `> [!${type}]\n${content.join('\n>\n')}` : `> [!${type}]`;
  },

  addCommands() {
    return {
      setCallout:
        (type = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type }),
      toggleCallout:
        (type = 'note') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { type }),
    };
  },
});
