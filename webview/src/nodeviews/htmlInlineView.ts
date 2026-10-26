import type { NodeViewRenderer } from '@tiptap/core';
import { sanitizeHtml } from '../lib/sanitizeHtml';

/** Renders inline HTML (`<kbd>`, `<sup>`, `<br>`…) as an inert preview; the source is the tooltip. */
export const htmlInlineView: NodeViewRenderer = ({ node }) => {
  const raw = String(node.attrs.raw ?? '');
  const dom = document.createElement('span');
  dom.className = 'mdotion-html-inline';
  dom.title = raw;
  const preview = sanitizeHtml(raw);
  const hasVisible = (preview.textContent ?? '').trim() !== '' || preview.querySelector?.('img, br');
  if (hasVisible) {
    dom.appendChild(preview);
  } else {
    dom.classList.add('is-source');
    dom.textContent = raw;
  }
  return { dom };
};
