# ADR-003: Undo / redo ownership

- **Status:** Accepted (supersedes the first version of this ADR)
- **Date:** 2026-10-23

## Context

VS Code forwards every key pressed in a webview to the workbench; for a custom text editor, Cmd+Z runs the workbench `undo` on the TextDocument. The first implementation *also* posted `requestUndo` from the webview, so every Cmd+Z undid twice. IDE-side undo also works at the granularity of debounced flushes and moves the caret on every step.

## Decision

- **The webview owns undo/redo while it has focus.** Tiptap's `UndoRedo` history is enabled; the webview stops propagation of Cmd/Ctrl+Z, Shift+Z and Y so the workbench never receives them, and never lets the browser's native contenteditable undo run.
- Undo steps reach the TextDocument as ordinary edits (so the source editor's own history keeps working).
- External changes (source editor, Git, other views, IDE undo from the menu) are applied with `addToHistory: false` and mapped through the local history.
- The same keyboard guard stops other shortcuts the editor handled (Cmd+B would otherwise toggle the sidebar, Cmd+K/I trigger Cursor commands). Cmd+S and Cmd+W flush pending edits first and are left to the IDE.

## Validation

- `tests/editor-sync.test.ts` (external updates are not undoable).
- Manual: type, Cmd+Z in the visual editor reverts one Notion-sized step and the caret stays in place.
