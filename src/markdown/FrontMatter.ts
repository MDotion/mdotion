/**
 * YAML front matter: `---` on the first line, content that starts right away
 * (a blank line after the opening fence is treated as a horizontal rule, not
 * as metadata), closing `---` on its own line. Empty front matter is allowed.
 */
const FRONT_MATTER_RE = /^---[ \t]*\n(?:(?![ \t]*\n)[\s\S]*?\n)?---[ \t]*(?:\n|$)/;

export interface SplitDocument {
  /** Front matter block including both fences and the trailing newline, or null. */
  frontMatter: string | null;
  body: string;
}

/** Splits YAML front matter from the Markdown body without parsing YAML. Expects LF text. */
export function splitFrontMatter(markdown: string): SplitDocument {
  const match = FRONT_MATTER_RE.exec(markdown);
  if (!match) {
    return { frontMatter: null, body: markdown };
  }
  return { frontMatter: match[0], body: markdown.slice(match[0].length) };
}

export function joinFrontMatter(frontMatter: string | null, body: string): string {
  if (!frontMatter) {
    return body;
  }
  const fence = frontMatter.endsWith('\n') || body === '' ? frontMatter : `${frontMatter}\n`;
  return fence + body;
}

/** YAML text between the fences (without them). */
export function frontMatterContent(frontMatter: string): string {
  const lines = frontMatter.replace(/\n$/, '').split('\n');
  return lines.slice(1, -1).join('\n');
}

export function buildFrontMatter(yaml: string): string {
  const trimmed = yaml.replace(/\s+$/, '');
  return trimmed ? `---\n${trimmed}\n---\n` : '---\n---\n';
}

export interface FrontMatterProperty {
  key: string;
  value: string;
}

/**
 * Best-effort read-only view of top-level YAML keys, used to display Notion-like
 * page properties. Nested structures are summarized, never rewritten.
 */
export function readFrontMatterProperties(yaml: string): FrontMatterProperty[] {
  const properties: FrontMatterProperty[] = [];
  const lines = yaml.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!match) {
      continue;
    }
    const [, key, rest] = match;
    if (rest.trim() !== '') {
      properties.push({ key, value: unquote(rest.trim()) });
      continue;
    }
    const items: string[] = [];
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
      i += 1;
      items.push(lines[i].trim().replace(/^-\s*/, ''));
    }
    properties.push({ key, value: items.map(unquote).join(', ') });
  }
  return properties;
}

function unquote(value: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}
