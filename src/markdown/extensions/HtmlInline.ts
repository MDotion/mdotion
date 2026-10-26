import { Node } from '@tiptap/core';

/** Inline HTML (`<kbd>`, `<br>`, `<sup>`…) kept verbatim as an atom inside text. */
export const HtmlInline = Node.create({
  name: 'htmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      raw: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-html-inline]',
        getAttrs: (element) => ({ raw: (element as HTMLElement).getAttribute('data-raw') ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['span', { 'data-html-inline': '', 'data-raw': node.attrs.raw as string }];
  },

  renderText({ node }) {
    return node.attrs.raw as string;
  },

  renderMarkdown: (node) => (node.attrs?.raw as string | undefined) ?? '',
});
