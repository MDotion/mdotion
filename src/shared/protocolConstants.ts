/**
 * Protocol constants and default values, kept free of runtime dependencies so
 * the webview can import them without bundling the validation library.
 */
export const PROTOCOL_VERSION = 4;

/** Hard cap for payloads coming from the (untrusted) webview. */
export const MAX_DOCUMENT_CHARS = 10_000_000;

export const DEFAULT_PAGE_SETTINGS = { fullWidth: false, smallText: false, font: 'default', outline: false } as const;

/** View state of a file that is not part of its Markdown (folded sections, column widths). */
export const EMPTY_VIEW_STATE: { folded: string[]; tableWidths: Record<string, number[]> } = { folded: [], tableWidths: {} };

/** Message types the host may send to the webview. */
export const HOST_MESSAGE_TYPES = ['init', 'theme', 'update', 'conflict', 'error', 'command', 'clipboardText', 'baseline'] as const;

/**
 * IDE commands aimed at the editor UI. Each one is contributed as `mdotion.<name>`
 * in package.json, so it shows in the Command Palette and can be rebound.
 */
export const EDITOR_COMMANDS = [
  'toggleOutline',
  'goToHeading',
  'find',
  'replace',
  'findNext',
  'findPrevious',
  'showChanges',
  'nextChange',
  'previousChange',
  'foldSection',
  'unfoldSection',
  'toggleFoldAll',
  'foldAll',
  'unfoldAll',
  'showShortcuts',
] as const;

export type EditorCommand = (typeof EDITOR_COMMANDS)[number];
