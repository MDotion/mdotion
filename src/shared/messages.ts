import { z } from 'zod';

import { EDITOR_COMMANDS, MAX_DOCUMENT_CHARS } from './protocolConstants';

export { DEFAULT_PAGE_SETTINGS, EDITOR_COMMANDS, EMPTY_VIEW_STATE, MAX_DOCUMENT_CHARS, PROTOCOL_VERSION } from './protocolConstants';
export type { EditorCommand } from './protocolConstants';

export const pageSettingsSchema = z.object({
  fullWidth: z.boolean(),
  smallText: z.boolean(),
  font: z.enum(['default', 'serif', 'mono']),
  /** Outline panel open. Settings saved before 0.2.0 have no value. */
  outline: z.boolean().default(false),
});

export type PageSettings = z.infer<typeof pageSettingsSchema>;

/**
 * Per-file view state kept by the IDE, never written to the Markdown (ADR-009):
 * folded sections (heading anchors) and column widths (table key → pixels).
 */
export const viewStateSchema = z.object({
  folded: z.array(z.string().max(512)).max(2000),
  tableWidths: z
    .record(z.string().max(4096), z.array(z.number().int().min(0).max(10_000)).max(200))
    .refine((widths) => Object.keys(widths).length <= 1000, 'Too many tables'),
});

export type ViewState = z.infer<typeof viewStateSchema>;

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
  z.object({
    /** Paste as plain text (⌘⇧V): the host reads the clipboard and answers with `clipboardText`. */
    type: z.literal('readClipboard'),
  }),
  z.object({
    /** Persist the view state of this file (workspace state, not the file). */
    type: z.literal('saveViewState'),
    viewState: viewStateSchema,
  }),
  z.object({
    /** Ask for the file as it is in the last commit; the host answers with `baseline`. */
    type: z.literal('requestBaseline'),
  }),
  z.object({
    /** Open VS Code's line-based diff of this file against the last commit. */
    type: z.literal('openTextDiff'),
  }),
  z.object({
    /** Open Keyboard Shortcuts filtered on MDotion's commands. */
    type: z.literal('openKeybindings'),
  }),
]);

/**
 * The file at the last commit, for the Changes view. `untracked`: in a repository
 * but never committed; `none`: no repository, or Git is not available.
 */
export const baselineSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    text: z.string(),
    /** Abbreviated commit hash. */
    commit: z.string(),
    /** Commit date, in ms since the epoch, when Git reports it. */
    committedAt: z.number().nullable(),
  }),
  z.object({ status: z.literal('untracked') }),
  z.object({ status: z.literal('none') }),
]);

export type Baseline = z.infer<typeof baselineSchema>;

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
    viewState: viewStateSchema,
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
  z.object({
    /** Clipboard text requested with `readClipboard`, to insert literally. */
    type: z.literal('clipboardText'),
    text: z.string(),
  }),
  z.object({
    /** An IDE command aimed at the editor UI (Command Palette, keybindings). */
    type: z.literal('command'),
    command: z.enum(EDITOR_COMMANDS),
  }),
  z.object({
    /** Answer to `requestBaseline`, sent again whenever the repository moves (commit, checkout, pull). */
    type: z.literal('baseline'),
    baseline: baselineSchema,
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
