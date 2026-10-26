import { Node } from '@tiptap/core';

/**
 * Opaque block holding Markdown source the editor cannot represent faithfully
 * (HTML blocks, link reference definitions, constructs that would not survive
 * a round-trip). The source is written back to disk byte for byte.
 */
export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      raw: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-raw-block]',
        getAttrs: (element) => ({ raw: (element as HTMLElement).getAttribute('data-raw') ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { 'data-raw-block': '', 'data-raw': node.attrs.raw as string }];
  },

  renderText({ node }) {
    return node.attrs.raw as string;
  },

  markdownTokenName: 'html',

  parseMarkdown: (token, helpers) => {
    if (!token.block) {
      return [];
    }
    return helpers.createNode('rawBlock', { raw: (token.raw ?? '').replace(/\n+$/, '') });
  },

  renderMarkdown: (node) => (node.attrs?.raw as string | undefined) ?? '',
});
