import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { getAdapter, getSourceMap } from './adapter';
import { sliceToMarkdown } from './sliceToMarkdown';

const BLOCK_SYNTAX = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|~~~|\|.*\||- \[[ xX]\]\s|---\s*$)/m;
const INLINE_SYNTAX = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|`[^`]+`|~~[^~]+~~)/;
const RICH_HTML = /<(p|h[1-6]|li|ul|ol|table|blockquote|pre|img|strong|em|b|i|a)[\s>]/i;

/**
 * Markdown-aware clipboard: pasting Markdown text (e.g. copied from the
 * source editor, where the HTML flavour carries no structure) creates real
 * blocks, and copying (text or selected blocks) writes Markdown as the
 * plain-text flavour, so it pastes formatted anywhere.
 */
export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            const text = data?.getData('text/plain') ?? '';
            const html = data?.getData('text/html') ?? '';
            if (!text || (html && RICH_HTML.test(html))) {
              return false;
            }
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code) {
              return false;
            }
            if (!BLOCK_SYNTAX.test(text) && !INLINE_SYNTAX.test(text)) {
              return false;
            }
            const nodes = getAdapter().parseFragment(text.replace(/\r\n/g, '\n'));
            if (nodes.length === 0) {
              return false;
            }
            const single = nodes.length === 1 && nodes[0].type.name === 'paragraph';
            const slice = single
              ? new Slice(nodes[0].content, 0, 0)
              : new Slice(Fragment.from(nodes), 0, 0);
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          },
          clipboardTextSerializer: (slice) => {
            try {
              return sliceToMarkdown(slice, getAdapter(), getSourceMap());
            } catch {
              return slice.content.textBetween(0, slice.content.size, '\n\n');
            }
          },
        },
      }),
    ];
  },
});
