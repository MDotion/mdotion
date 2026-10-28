import { describe, expect, it } from 'vitest';
import { hostToWebviewMessageSchema, MAX_DOCUMENT_CHARS, parseWebviewMessage } from '../src/shared/messages';
import { HOST_MESSAGE_TYPES } from '../src/shared/protocolConstants';

describe('webview message validation', () => {
  it('accepts well-formed edits', () => {
    expect(parseWebviewMessage({ type: 'edit', text: '# Hi', baseVersion: 3 })).toEqual({
      type: 'edit',
      text: '# Hi',
      baseVersion: 3,
    });
  });

  it.each([
    null,
    'edit',
    { type: 'unknown' },
    { type: 'edit', text: 1, baseVersion: 0 },
    { type: 'edit', text: 'x', baseVersion: -1 },
    { type: 'edit', text: 'x'.repeat(MAX_DOCUMENT_CHARS + 1), baseVersion: 0 },
    { type: 'openLink', href: '' },
    { type: 'saveSettings', settings: { fullWidth: 'yes' } },
    { type: 'setTheme', theme: 'sepia' },
    { type: 'saveViewState', viewState: { folded: 'a', tableWidths: {} } },
    { type: 'saveViewState', viewState: { folded: [], tableWidths: { t: [-5] } } },
  ])('rejects %j', (raw) => {
    expect(parseWebviewMessage(raw)).toBeNull();
  });
});

describe('page settings', () => {
  it('reads settings saved before the outline existed', () => {
    expect(parseWebviewMessage({ type: 'saveSettings', settings: { fullWidth: true, smallText: false, font: 'serif' } })).toEqual({
      type: 'saveSettings',
      settings: { fullWidth: true, smallText: false, font: 'serif', outline: false },
    });
  });
});

describe('host message types', () => {
  it('lists every message type of the schema (the webview filters on this list)', () => {
    const types = hostToWebviewMessageSchema.options.map((option) => option.shape.type.value);
    expect([...types].sort()).toEqual([...HOST_MESSAGE_TYPES].sort());
  });
});
