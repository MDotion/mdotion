export interface TextChange {
  /** Offset in the old text where the change starts. */
  start: number;
  /** End offset (exclusive) of the replaced range in the old text. */
  oldEnd: number;
  /** Replacement text. */
  insert: string;
}

/**
 * Smallest single-range change turning `oldText` into `newText`
 * (common prefix / suffix trimming). Returns null when the texts are equal.
 * Never splits a CRLF pair or a UTF-16 surrogate pair.
 */
export function computeTextChange(oldText: string, newText: string): TextChange | null {
  if (oldText === newText) {
    return null;
  }

  const maxPrefix = Math.min(oldText.length, newText.length);
  let start = 0;
  while (start < maxPrefix && oldText.charCodeAt(start) === newText.charCodeAt(start)) {
    start += 1;
  }

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  while (start > 0 && isUnsafeBoundary(oldText, start)) {
    start -= 1;
  }
  while (oldEnd < oldText.length && newEnd < newText.length && isUnsafeBoundary(oldText, oldEnd)) {
    oldEnd += 1;
    newEnd += 1;
  }

  return { start, oldEnd, insert: newText.slice(start, newEnd) };
}

function isUnsafeBoundary(text: string, index: number): boolean {
  const prev = text.charCodeAt(index - 1);
  const next = text.charCodeAt(index);
  const splitsCrlf = prev === 13 && next === 10;
  const splitsSurrogate = prev >= 0xd800 && prev <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  return splitsCrlf || splitsSurrogate;
}
