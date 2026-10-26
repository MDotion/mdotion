import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES, filterBlockTypes } from '../webview/src/editor/blockTypes';

describe('slash menu filtering', () => {
  it('shows every block for an empty query', () => {
    expect(filterBlockTypes('')).toHaveLength(BLOCK_TYPES.length);
  });

  it('ranks title prefixes first', () => {
    expect(filterBlockTypes('head').map((type) => type.id)).toEqual(['h1', 'h2', 'h3']);
    expect(filterBlockTypes('to')[0].id).toBe('taskList');
  });

  it('matches keywords', () => {
    expect(filterBlockTypes('warning').map((type) => type.id)).toEqual(['callout']);
    expect(filterBlockTypes('hr').map((type) => type.id)).toContain('divider');
  });

  it('returns nothing for unknown queries instead of the whole menu', () => {
    expect(filterBlockTypes('file')).toEqual([]);
  });
});
