import type { HostToWebviewMessage, WebviewToHostMessage } from '../../../src/shared/messages';
import { HOST_MESSAGE_TYPES } from '../../../src/shared/protocolConstants';
import { getVsCodeApi } from '../vscodeApi';

let documentDirUri = '';

export function setDocumentDirUri(uri: string): void {
  documentDirUri = uri;
}

/** Resolves a Markdown URL (relative to the document) to something the webview can load. */
export function resolveResourceUrl(src: string): string {
  if (!src || /^(https?:|data:|blob:)/i.test(src)) {
    return src;
  }
  if (!documentDirUri) {
    return src;
  }
  try {
    const cleaned = src.startsWith('<') && src.endsWith('>') ? src.slice(1, -1) : src;
    return new URL(cleaned, documentDirUri).toString();
  } catch {
    return src;
  }
}

/**
 * Messages come from our own extension host (validated there with zod), so a
 * shape check is enough here and keeps the validation library out of the webview.
 */
export function toHostMessage(raw: unknown): HostToWebviewMessage | null {
  const type = (raw as { type?: unknown } | null)?.type;
  return typeof type === 'string' && (HOST_MESSAGE_TYPES as readonly string[]).includes(type)
    ? (raw as HostToWebviewMessage)
    : null;
}

export function postToHost(message: WebviewToHostMessage): void {
  getVsCodeApi()?.postMessage(message);
}

/** Opens a link: in-page anchors scroll, everything else goes through the host. */
export function openLink(href: string): void {
  if (href.startsWith('#')) {
    scrollToAnchor(href.slice(1));
    return;
  }
  postToHost({ type: 'openLink', href });
}

/** GitHub-style heading slug. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function scrollToAnchor(anchor: string): void {
  const target = decodeURIComponent(anchor).toLowerCase();
  const headings = document.querySelectorAll<HTMLElement>('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6');
  for (const heading of headings) {
    if (slugify(heading.textContent ?? '') === target) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';
