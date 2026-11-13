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

export type FrontMatterValueKind = 'scalar' | 'list';

export interface FrontMatterProperty {
  key: string;
  /** Display / edit value: scalars as-is, lists joined with `, `. */
  value: string;
  kind: FrontMatterValueKind;
}

/**
 * Best-effort view of top-level YAML keys for Notion-like page properties.
 * Nested maps and multiline scalars are summarized, never rewritten in place.
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
      properties.push({ key, value: unquote(rest.trim()), kind: 'scalar' });
      continue;
    }
    const items: string[] = [];
    while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
      i += 1;
      items.push(unquote(lines[i].trim().replace(/^-\s*/, '')));
    }
    // Skip non-list indented blocks (nested maps): still show an empty value.
    while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]) && !/^\s+-\s+/.test(lines[i + 1])) {
      i += 1;
    }
    properties.push({
      key,
      value: items.join(', '),
      kind: items.length > 0 ? 'list' : 'scalar',
    });
  }
  return properties;
}

/**
 * Writes a simple property list back to YAML. Used when the user edits
 * properties in the panel (not when editing raw YAML).
 */
export function serializeFrontMatterProperties(properties: FrontMatterProperty[]): string {
  const lines: string[] = [];
  for (const property of properties) {
    const key = property.key.trim();
    if (!key) {
      continue;
    }
    if (property.kind === 'list') {
      const items = property.value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '');
      if (items.length === 0) {
        lines.push(`${key}:`);
        continue;
      }
      lines.push(`${key}:`);
      for (const item of items) {
        lines.push(`  - ${formatYamlScalar(item)}`);
      }
      continue;
    }
    const value = property.value.trim();
    lines.push(value === '' ? `${key}:` : `${key}: ${formatYamlScalar(value)}`);
  }
  return lines.join('\n');
}

/** Front matter fences from a property list, or `null` when there are none. */
export function frontMatterFromProperties(properties: FrontMatterProperty[]): string | null {
  const yaml = serializeFrontMatterProperties(properties);
  return yaml === '' ? null : buildFrontMatter(yaml);
}

function unquote(value: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/** Quotes a scalar when YAML would otherwise misread it. */
export function formatYamlScalar(value: string): string {
  if (value === '') {
    return "''";
  }
  if (
    /[:#{}[\],&*!|>%@`]/.test(value) ||
    /^\s|\s$/.test(value) ||
    /[\n\r]/.test(value) ||
    /^[-?:@`'"]/.test(value)
  ) {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return value;
}

/**
 * True when the YAML is only top-level scalars and plain lists — safe to rewrite
 * from the properties panel without dropping nested or multiline values.
 */
export function isSimpleFrontMatter(yaml: string): boolean {
  const trimmed = yaml.replace(/\s+$/, '');
  if (trimmed === '') {
    return true;
  }
  const properties = readFrontMatterProperties(trimmed);
  if (properties.length === 0) {
    return false;
  }
  // Nested maps, multiline scalars, or flow collections need the YAML editor.
  for (const line of trimmed.split('\n')) {
    if (/:\s*[|>]/.test(line) || /:\s*[{\[]/.test(line)) {
      return false;
    }
    if (/^\s+[A-Za-z0-9_.-]+\s*:/.test(line)) {
      return false;
    }
  }
  const again = readFrontMatterProperties(serializeFrontMatterProperties(properties));
  return (
    properties.length === again.length &&
    properties.every((property, index) => {
      const other = again[index];
      return property.key === other.key && property.value === other.value && property.kind === other.kind;
    })
  );
}
