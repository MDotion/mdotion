/**
 * Protocol constants and default values, kept free of runtime dependencies so
 * the webview can import them without bundling the validation library.
 */
export const PROTOCOL_VERSION = 2;

/** Hard cap for payloads coming from the (untrusted) webview. */
export const MAX_DOCUMENT_CHARS = 10_000_000;

export const DEFAULT_PAGE_SETTINGS = { fullWidth: false, smallText: false, font: 'default' } as const;

/** Message types the host may send to the webview. */
export const HOST_MESSAGE_TYPES = ['init', 'theme', 'update', 'conflict', 'error'] as const;
