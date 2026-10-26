/**
 * Minimal escaping for text written by the editor. Tiptap's default escapes
 * every `_ * [ ] ~` and encodes `& < > "`, which turns `snake_case` into
 * `snake\_case`, `Tom & Jerry` into `Tom &amp; Jerry` and breaks GitHub
 * alerts / footnotes. Here a character is escaped only when it could
 * actually be read back as Markdown syntax.
 */
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD_CHAR = /[\p{L}\p{N}]/u;

export function escapeInlineText(text: string): string {
  const linkLike = /\]\s*[([:]/.test(text) || /!\[/.test(text);
  const tildeCount = (text.match(/~/g) ?? []).length;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    switch (ch) {
      case '\\':
        out += next === '' || ASCII_PUNCTUATION.test(next) ? '\\\\' : ch;
        break;
      case '`':
        out += '\\`';
        break;
      case '*':
        out += isBlank(prev) && isBlank(next) ? ch : '\\*';
        break;
      case '_':
        out += WORD_CHAR.test(prev) && WORD_CHAR.test(next) ? ch : '\\_';
        break;
      case '[':
      case ']':
        out += linkLike ? `\\${ch}` : ch;
        break;
      case '~':
        out += tildeCount > 1 ? '\\~' : ch;
        break;
      case '<':
        out += /[A-Za-z/!?]/.test(next) ? '&lt;' : ch;
        break;
      case '&':
        out += /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(text.slice(i)) ? '&amp;' : ch;
        break;
      default:
        out += ch;
    }
  }
  return out;
}

function isBlank(ch: string): boolean {
  return ch === '' || /\s/.test(ch);
}

/**
 * Escapes characters at the start of a paragraph line that would otherwise
 * turn the line into a heading, list, quote, rule or fence on the next parse.
 */
export function escapeBlockStart(line: string): string {
  if (/^#{1,6}(\s|$)/.test(line) || /^>/.test(line) || /^[-+*](\s|$)/.test(line)) {
    return `\\${line}`;
  }
  if (/^(`{3,}|~{3,})/.test(line) || /^=+\s*$/.test(line) || /^(-\s*){3,}$/.test(line)) {
    return `\\${line}`;
  }
  if (/^\[[ xX]\](\s|$)/.test(line)) {
    return `\\${line}`;
  }
  const ordered = /^(\d{1,9})([.)])(\s|$)/.exec(line);
  if (ordered) {
    return `${ordered[1]}\\${line.slice(ordered[1].length)}`;
  }
  return line;
}

/** Applies {@link escapeBlockStart} to the first line and to every line following a hard break. */
export function escapeParagraphLines(rendered: string): string {
  const lines = rendered.split('\n');
  return lines
    .map((line, index) => (index === 0 || /( {2}|\\)$/.test(lines[index - 1]) ? escapeBlockStart(line) : line))
    .join('\n');
}
