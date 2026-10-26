import { resolveResourceUrl } from './env';

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'picture', 'pre', 's', 'samp', 'small', 'source', 'span',
  'strike', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  'u', 'ul', 'var',
]);

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'align', 'colspan', 'rowspan', 'open',
  'media', 'type',
]);

/**
 * Builds an inert DOM preview of untrusted HTML from the Markdown file:
 * allow-listed tags and attributes only, no scripts, styles or event handlers.
 * Unknown elements are unwrapped (their text is kept).
 */
export function sanitizeHtml(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const fragment = document.createDocumentFragment();
  parsed.body.childNodes.forEach((child) => {
    const clean = cleanNode(child);
    if (clean) {
      fragment.appendChild(clean);
    }
  });
  return fragment;
}

function cleanNode(node: ChildNode): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') {
    return null;
  }
  const children = Array.from(element.childNodes)
    .map(cleanNode)
    .filter((child): child is Node => child !== null);
  if (!ALLOWED_TAGS.has(tag)) {
    const unwrapped = document.createDocumentFragment();
    children.forEach((child) => unwrapped.appendChild(child));
    return unwrapped;
  }
  const out = document.createElement(tag);
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) {
      continue;
    }
    let value = attr.value;
    if (name === 'href' && /^\s*(javascript|vbscript|data):/i.test(value)) {
      continue;
    }
    if (name === 'src') {
      if (/^\s*(javascript|vbscript):/i.test(value)) {
        continue;
      }
      value = resolveResourceUrl(value);
    }
    if (name === 'srcset') {
      value = value
        .split(',')
        .map((entry) => {
          const [url, ...rest] = entry.trim().split(/\s+/);
          return [resolveResourceUrl(url), ...rest].join(' ');
        })
        .join(', ');
    }
    out.setAttribute(name, value);
  }
  children.forEach((child) => out.appendChild(child));
  return out;
}
