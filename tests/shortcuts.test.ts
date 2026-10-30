import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDITOR_COMMANDS } from '../src/shared/protocolConstants';
import { formatKeys, isIdeShortcut, otherKeys, SHORTCUTS, shortcutKeys } from '../webview/src/lib/shortcuts';

interface Keybinding {
  command: string;
  key: string;
  mac?: string;
  when?: string;
}

const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
  contributes: { commands: { command: string }[]; keybindings: Keybinding[]; menus: { commandPalette: { command: string; when: string }[] } };
};
const { contributes } = manifest;

describe('shortcut registry', () => {
  it('agrees with the keybindings contributed in package.json', () => {
    for (const shortcut of SHORTCUTS.filter((candidate) => candidate.command)) {
      const binding = contributes.keybindings.find((candidate) => candidate.command === `mdotion.${shortcut.command}`);
      expect(binding, shortcut.id).toBeDefined();
      expect(binding!.mac ?? binding!.key, shortcut.id).toBe(shortcut.mac);
      expect(binding!.key, shortcut.id).toBe(otherKeys(shortcut));
    }
  });

  it('contributes every editor command, hidden from the palette outside the visual editor', () => {
    const commands = contributes.commands.map((command) => command.command);
    for (const command of EDITOR_COMMANDS) {
      expect(commands).toContain(`mdotion.${command}`);
      expect(contributes.menus.commandPalette.find((entry) => entry.command === `mdotion.${command}`)?.when).toBe(
        'activeCustomEditorId == mdotion.markdownEditor',
      );
    }
  });

  it('does not take the keys of the sidebar, the panel or input boxes', () => {
    for (const binding of contributes.keybindings.filter((candidate) => EDITOR_COMMANDS.includes(candidate.command.slice('mdotion.'.length) as never))) {
      expect(binding.when, binding.command).toContain('!sideBarFocus');
      expect(binding.when, binding.command).toContain('!inputFocus');
    }
  });

  it('has unique ids and no key used twice in the same context', () => {
    expect(new Set(SHORTCUTS.map((shortcut) => shortcut.id)).size).toBe(SHORTCUTS.length);
    const editorKeys = SHORTCUTS.filter((shortcut) => !['tables', 'find'].includes(shortcut.category)).flatMap((shortcut) => [
      shortcut.mac,
      ...(shortcut.also ?? []),
    ]);
    const duplicates = editorKeys.filter((keys, index) => editorKeys.indexOf(keys) !== index);
    // Shift+Enter (line break) and Escape (select block) are the same action in text and in tables.
    expect(duplicates).toEqual([]);
  });

  it('formats keys for each platform', () => {
    expect(formatKeys('cmd+alt+f', true)).toBe('⌘⌥F');
    expect(formatKeys('ctrl+h', false)).toBe('Ctrl+H');
    expect(formatKeys('cmd+shift+up', false)).toBe('Ctrl+Shift+↑');
    expect(formatKeys('shift+alt+f5', true)).toBe('⇧⌥F5');
    expect(shortcutKeys(SHORTCUTS.find((shortcut) => shortcut.id === 'taskList')!, false)).toEqual(['Ctrl+Alt+4', 'Ctrl+Shift+9']);
  });

  it('uses only keys that exist on every keyboard layout', () => {
    for (const shortcut of SHORTCUTS) {
      for (const keys of [shortcut.mac, otherKeys(shortcut), ...(shortcut.also ?? [])]) {
        const key = keys.split('+').pop()!;
        expect(key, shortcut.id).toMatch(/^([a-z0-9]|up|down|left|right|enter|escape|tab|f\d+)$/);
      }
    }
  });

  it('recognises the IDE shortcuts the webview must pass on to VS Code, by physical key', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    // ⌥K types "˚" on a Mac: the physical key decides.
    expect(isIdeShortcut(key({ key: '˚', code: 'KeyK', metaKey: true, altKey: true }), true)).toBe(true);
    expect(isIdeShortcut(key({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true, altKey: true }), true)).toBe(true);
    expect(isIdeShortcut(key({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true, altKey: true }), false)).toBe(true);
    expect(isIdeShortcut(key({ key: 'f', code: 'KeyF', metaKey: true }), true)).toBe(true);
    expect(isIdeShortcut(key({ key: 'F5', code: 'F5', altKey: true }), true)).toBe(true);
    // Editor shortcuts stay in the editor.
    expect(isIdeShortcut(key({ key: 'b', code: 'KeyB', metaKey: true }), true)).toBe(false);
    expect(isIdeShortcut(key({ key: '¢', code: 'Digit4', metaKey: true, altKey: true }), true)).toBe(false);
    expect(isIdeShortcut(key({ key: 'ArrowUp', code: 'ArrowUp', metaKey: true, shiftKey: true }), true)).toBe(false);
  });
});
