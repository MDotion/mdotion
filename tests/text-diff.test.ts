import { describe, expect, it } from 'vitest';
import { computeTextChange } from '../src/shared/textDiff';

function apply(text: string, change: ReturnType<typeof computeTextChange>): string {
  return change ? text.slice(0, change.start) + change.insert + text.slice(change.oldEnd) : text;
}

describe('computeTextChange', () => {
  it('returns null for equal texts', () => {
    expect(computeTextChange('same', 'same')).toBeNull();
  });

  it('produces the smallest single replacement', () => {
    const change = computeTextChange('# Title\n\nBody\n', '# Title!\n\nBody\n');
    expect(change).toEqual({ start: 7, oldEnd: 7, insert: '!' });
  });

  it.each([
    ['a\r\nb', 'a\r\nxb'],
    ['line\r\n', 'line\n'],
    ['😀a', '😃a'],
    ['abc', ''],
    ['', 'abc'],
  ])('reconstructs %j → %j without splitting CRLF or surrogate pairs', (before, after) => {
    const change = computeTextChange(before, after);
    expect(apply(before, change)).toBe(after);
    if (change) {
      expect(before.charCodeAt(change.start - 1) === 13 && before.charCodeAt(change.start) === 10).toBe(false);
      const high = before.charCodeAt(change.start - 1);
      expect(high >= 0xd800 && high <= 0xdbff).toBe(false);
    }
  });
});
