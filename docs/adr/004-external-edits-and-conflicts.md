# ADR-004: External edits and conflicts

- **Status:** Accepted
- **Date:** 2026-10-23

## Decision

- The host sends `init` / `update` with the TextDocument `version`. The webview sends whole-text `edit`s with `baseVersion` = the last version it received through `init`/`update`.
- The host applies an edit only if no external change happened since (`baseVersion === lastSentVersion`). Its own edits do not move `lastSentVersion`, so consecutive edits from a fast typist never conflict. Own change events are recognised by text, not by a timing flag.
- External updates are applied in the webview as a minimal ProseMirror replace (caret and selection preserved).
- If an external change arrives while local changes are unsent, or the host rejects an edit, the webview keeps the user's text and shows a banner: **Restore my version** / **Keep file version**. Nothing is overwritten silently.

## Validation

- `tests/document-sync.test.ts`, `tests/editor-sync.test.ts`, `tests/e2e`.
