import { z } from 'zod';

import { MAX_DOCUMENT_CHARS } from './protocolConstants';

export { DEFAULT_PAGE_SETTINGS, MAX_DOCUMENT_CHARS, PROTOCOL_VERSION } from './protocolConstants';

export const pageSettingsSchema = z.object({
  fullWidth: z.boolean(),
  smallText: z.boolean(),
  font: z.enum(['default', 'serif', 'mono']),
});

export type PageSettings = z.infer<typeof pageSettingsSchema>;


/** `auto` follows the VS Code / Cursor theme; stored in the `mdotion.theme` setting. */
export const themeSchema = z.enum(['auto', 'light', 'dark']);

export type Theme = z.infer<typeof themeSchema>;

export const webviewToHostMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    protocolVersion: z.number().int(),
  }),
  z.object({
    /** Full Markdown text (LF line endings) the webview wants the document to contain. */
    type: z.literal('edit'),
    text: z.string().max(MAX_DOCUMENT_CHARS),
    /** Last document version the webview received through `init` / `update`. */
    baseVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('openLink'),
    href: z.string().min(1).max(4096),
  }),
  z.object({
    /** Replace this visual editor with the Markdown source editor (same tab position). */
    type: z.literal('switchToSource'),
  }),
  z.object({
    /** Copy the whole Markdown file to the clipboard. */
    type: z.literal('copyMarkdown'),
  }),
  z.object({
    type: z.literal('saveSettings'),
    settings: pageSettingsSchema,
  }),
  z.object({
    /** Persist the theme in the `mdotion.theme` user setting. */
    type: z.literal('setTheme'),
    theme: themeSchema,
  }),
]);

export const hostToWebviewMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    text: z.string(),
    version: z.number().int().nonnegative(),
    fileName: z.string(),
    /** Webview URI of the folder containing the document (for relative images). */
    documentDirUri: z.string(),
    settings: pageSettingsSchema,
    theme: themeSchema,
  }),
  z.object({
    /** The `mdotion.theme` setting changed (from any MDotion tab or from the Settings UI). */
    type: z.literal('theme'),
    theme: themeSchema,
  }),
  z.object({
    /** The document changed outside this webview (source editor, git, other view, IDE undo). */
    type: z.literal('update'),
    text: z.string(),
    version: z.number().int().nonnegative(),
  }),
  z.object({
    /** An edit was rejected because it was based on an outdated version. */
    type: z.literal('conflict'),
    rejectedText: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }),
]);

export type WebviewToHostMessage = z.infer<typeof webviewToHostMessageSchema>;
export type HostToWebviewMessage = z.infer<typeof hostToWebviewMessageSchema>;

export function parseWebviewMessage(raw: unknown): WebviewToHostMessage | null {
  const result = webviewToHostMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseHostMessage(raw: unknown): HostToWebviewMessage | null {
  const result = hostToWebviewMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
