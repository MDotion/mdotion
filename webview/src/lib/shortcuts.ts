import type { EditorCommand } from '../../../src/shared/protocolConstants';
import { isMac } from './env';

export type ShortcutCategory = 'text' | 'blocks' | 'actions' | 'tables' | 'navigation' | 'find' | 'changes' | 'editor';

export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  text: 'Text',
  blocks: 'Blocks',
  actions: 'Moving and selecting',
  tables: 'Tables',
  navigation: 'Outline and folding',
  find: 'Find and replace',
  changes: 'Changes',
  editor: 'Editor',
};

export interface Shortcut {
  id: string;
  label: string;
  category: ShortcutCategory;
  /** macOS keys in VS Code keybinding syntax (`cmd+alt+f`). */
  mac: string;
  /** Windows / Linux keys, when they are not `mac` with `cmd` → `ctrl`. */
  other?: string;
  /** Other macOS keys doing the same thing (mapped the same way). */
  also?: string[];
  /**
   * The IDE command behind this shortcut. Its default keys are contributed in
   * package.json and the webview lets them through, so the user can rebind them.
   */
  command?: EditorCommand | 'toggleEditor' | 'copyMarkdown';
}

/**
 * Every shortcut of the editor. package.json must agree on the ones with a `command` (see tests).
 * Keys are letters, digits, arrows and function keys only: punctuation moves between keyboard
 * layouts (`/` is ⇧7 on Italian and German keyboards, `[` needs ⌥), and VS Code cannot bind
 * some of those combinations at all.
 */
export const SHORTCUTS: Shortcut[] = [
  { id: 'bold', label: 'Bold', category: 'text', mac: 'cmd+b' },
  { id: 'italic', label: 'Italic', category: 'text', mac: 'cmd+i' },
  { id: 'strike', label: 'Strikethrough', category: 'text', mac: 'cmd+shift+s' },
  { id: 'code', label: 'Inline code', category: 'text', mac: 'cmd+e' },
  { id: 'link', label: 'Add or edit a link', category: 'text', mac: 'cmd+k' },
  { id: 'hardBreak', label: 'Line break inside a block', category: 'text', mac: 'shift+enter' },

  { id: 'paragraph', label: 'Text', category: 'blocks', mac: 'cmd+alt+0' },
  { id: 'h1', label: 'Heading 1', category: 'blocks', mac: 'cmd+alt+1' },
  { id: 'h2', label: 'Heading 2', category: 'blocks', mac: 'cmd+alt+2' },
  { id: 'h3', label: 'Heading 3', category: 'blocks', mac: 'cmd+alt+3' },
  { id: 'taskList', label: 'To-do list', category: 'blocks', mac: 'cmd+alt+4', also: ['cmd+shift+9'] },
  { id: 'bulletList', label: 'Bulleted list', category: 'blocks', mac: 'cmd+alt+5', also: ['cmd+shift+8'] },
  { id: 'orderedList', label: 'Numbered list', category: 'blocks', mac: 'cmd+alt+6', also: ['cmd+shift+7'] },
  { id: 'codeBlock', label: 'Code block', category: 'blocks', mac: 'cmd+alt+8', also: ['cmd+alt+c'] },
  { id: 'blockquote', label: 'Quote', category: 'blocks', mac: 'cmd+shift+b' },
  { id: 'callout', label: 'Callout', category: 'blocks', mac: 'cmd+alt+9' },
  { id: 'toggleTask', label: 'Check or uncheck a to-do', category: 'blocks', mac: 'cmd+enter' },

  { id: 'duplicate', label: 'Duplicate block', category: 'actions', mac: 'cmd+d' },
  { id: 'moveBlockUp', label: 'Move block up', category: 'actions', mac: 'cmd+shift+up' },
  { id: 'moveBlockDown', label: 'Move block down', category: 'actions', mac: 'cmd+shift+down' },
  { id: 'selectBlock', label: 'Select the current block', category: 'actions', mac: 'escape' },
  { id: 'extendBlocks', label: 'Select the block above / below too', category: 'actions', mac: 'shift+up', also: ['shift+down'] },
  { id: 'selectAll', label: 'Select all blocks (press twice)', category: 'actions', mac: 'cmd+a' },
  { id: 'pastePlain', label: 'Paste as plain text', category: 'actions', mac: 'cmd+shift+v' },
  { id: 'undo', label: 'Undo', category: 'actions', mac: 'cmd+z' },
  { id: 'redo', label: 'Redo', category: 'actions', mac: 'cmd+shift+z', other: 'ctrl+y' },

  { id: 'nextCell', label: 'Next cell (adds a row at the end)', category: 'tables', mac: 'tab' },
  { id: 'previousCell', label: 'Previous cell', category: 'tables', mac: 'shift+tab' },
  { id: 'cellBelow', label: 'Cell below (adds a row at the bottom)', category: 'tables', mac: 'enter' },
  { id: 'cellBreak', label: 'Line break inside a cell', category: 'tables', mac: 'shift+enter' },
  { id: 'moveRow', label: 'Move the row up / down', category: 'tables', mac: 'cmd+shift+up', also: ['cmd+shift+down'] },
  { id: 'selectTable', label: 'Select the whole table', category: 'tables', mac: 'escape' },

  { id: 'toggleOutline', label: 'Show or hide the outline', category: 'navigation', mac: 'cmd+alt+o', command: 'toggleOutline' },
  { id: 'goToHeading', label: 'Go to heading', category: 'navigation', mac: 'cmd+shift+o', command: 'goToHeading' },
  { id: 'moveSection', label: 'Move the section up / down (on a heading)', category: 'navigation', mac: 'alt+up', also: ['alt+down'] },
  { id: 'foldSection', label: 'Fold the current section', category: 'navigation', mac: 'cmd+alt+up', command: 'foldSection' },
  { id: 'unfoldSection', label: 'Unfold the current section', category: 'navigation', mac: 'cmd+alt+down', command: 'unfoldSection' },
  { id: 'toggleFoldAll', label: 'Fold or unfold all sections', category: 'navigation', mac: 'cmd+alt+t', command: 'toggleFoldAll' },

  { id: 'find', label: 'Find', category: 'find', mac: 'cmd+f', command: 'find' },
  { id: 'replace', label: 'Replace', category: 'find', mac: 'cmd+alt+f', other: 'ctrl+h', command: 'replace' },
  { id: 'findNext', label: 'Next match', category: 'find', mac: 'cmd+g', other: 'f3', command: 'findNext' },
  { id: 'findPrevious', label: 'Previous match', category: 'find', mac: 'cmd+shift+g', other: 'shift+f3', command: 'findPrevious' },
  { id: 'findNextInBar', label: 'Next / previous match (in the find bar)', category: 'find', mac: 'enter', also: ['shift+enter'] },
  { id: 'matchCase', label: 'Match case', category: 'find', mac: 'cmd+alt+c', other: 'alt+c' },
  { id: 'wholeWord', label: 'Match whole word', category: 'find', mac: 'cmd+alt+w', other: 'alt+w' },
  { id: 'regexp', label: 'Use regular expression', category: 'find', mac: 'cmd+alt+r', other: 'alt+r' },
  { id: 'replaceAll', label: 'Replace all (in the replace field)', category: 'find', mac: 'cmd+enter' },

  { id: 'showChanges', label: 'Show changes since the last commit', category: 'changes', mac: 'cmd+alt+g', command: 'showChanges' },
  { id: 'nextChange', label: 'Next change', category: 'changes', mac: 'alt+f5', command: 'nextChange' },
  { id: 'previousChange', label: 'Previous change', category: 'changes', mac: 'shift+alt+f5', command: 'previousChange' },

  { id: 'toggleEditor', label: 'Switch Visual / Markdown', category: 'editor', mac: 'cmd+alt+m', command: 'toggleEditor' },
  { id: 'copyMarkdown', label: 'Copy all Markdown', category: 'editor', mac: 'cmd+shift+alt+c', command: 'copyMarkdown' },
  { id: 'showShortcuts', label: 'Keyboard shortcuts', category: 'editor', mac: 'cmd+alt+k', command: 'showShortcuts' },
];

/** Windows / Linux keys of a shortcut. */
export function otherKeys(shortcut: Pick<Shortcut, 'mac' | 'other'>): string {
  return shortcut.other ?? shortcut.mac.replace(/\bcmd\b/g, 'ctrl');
}

const MAC_SYMBOLS: Record<string, string> = { cmd: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' };
const OTHER_NAMES: Record<string, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', cmd: 'Ctrl' };
const KEY_NAMES: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
};

/** `cmd+alt+f` → `⌘⌥F` on macOS, `ctrl+h` → `Ctrl+H` elsewhere. */
export function formatKeys(keys: string, mac = isMac): string {
  const parts = keys.split('+');
  const key = parts.pop() ?? '';
  const name = KEY_NAMES[key] ?? key.toUpperCase();
  if (mac) {
    return parts.map((part) => MAC_SYMBOLS[part] ?? part).join('') + name;
  }
  return [...parts.map((part) => OTHER_NAMES[part] ?? part), name].join('+');
}

export function shortcutById(id: string): Shortcut {
  const shortcut = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!shortcut) {
    throw new Error(`MDotion: unknown shortcut ${id}`);
  }
  return shortcut;
}

/** The keys of a shortcut for this platform, ready for a tooltip: `⌘⌥F` / `Ctrl+H`. */
export function shortcutLabel(id: string, mac = isMac): string {
  const shortcut = shortcutById(id);
  return formatKeys(mac ? shortcut.mac : otherKeys(shortcut), mac);
}

/** Every key combination of a shortcut for this platform (main one first). */
export function shortcutKeys(shortcut: Shortcut, mac = isMac): string[] {
  const main = mac ? shortcut.mac : otherKeys(shortcut);
  const also = (shortcut.also ?? []).map((keys) => (mac ? keys : otherKeys({ mac: keys })));
  return [main, ...also].map((keys) => formatKeys(keys, mac));
}

interface KeyChord {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

function parseKeys(keys: string, mac: boolean): KeyChord {
  const parts = keys.split('+');
  const key = parts.pop() ?? '';
  return {
    ctrl: parts.includes('ctrl') || (!mac && parts.includes('cmd')),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    meta: mac && parts.includes('cmd'),
    key,
  };
}

/** Whether a key event is this chord, read from the physical key (`code`) so the layout does not matter. */
function matches(event: KeyboardEvent, chord: KeyChord): boolean {
  if (event.ctrlKey !== chord.ctrl || event.altKey !== chord.alt || event.shiftKey !== chord.shift || event.metaKey !== chord.meta) {
    return false;
  }
  const { key } = chord;
  if (/^[a-z]$/.test(key)) {
    return event.code === `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return event.code === `Digit${key}`;
  }
  if (['up', 'down', 'left', 'right'].includes(key)) {
    return event.key === `Arrow${key[0].toUpperCase()}${key.slice(1)}`;
  }
  return event.key.toLowerCase() === key;
}

/**
 * Whether a key event is the default shortcut of an IDE command. The webview must let
 * those keys reach VS Code (which runs the command, or the one the user rebound), but
 * not let the browser act on them first: ⌘⌥↑ would move the caret before Fold Section.
 */
export function isIdeShortcut(event: KeyboardEvent, mac = isMac): boolean {
  return SHORTCUTS.some((shortcut) => shortcut.command && matches(event, parseKeys(mac ? shortcut.mac : otherKeys(shortcut), mac)));
}
