# ADR-009: View state outside the document

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

0.2.0 adds things that change how a file looks without changing what it says: resized table columns, folded sections, the outline panel. GFM has no syntax for any of them. Storing them in the document would either add proprietary markup to the `.md` file or, for column widths, change the `colwidth` attributes of the table cells: the table node would no longer match its source and would be re-serialized on save (ADR-002), rewriting its padding without any text change.

## Decision

1. **Nothing of the view reaches the Markdown.** Column widths, folded sections and the outline panel never change the editor document or the file.
2. **Column widths** live on the table node view (`MdotionTableView`) and are applied to the `<colgroup>`. Tiptap's `columnResizing` plugin is not used.
3. **Folded sections** are a ProseMirror plugin state (positions mapped through every transaction) rendered with decorations.
4. **Persistence:** per file, in the extension's `workspaceState` (`mdotion.viewState:<uri>`), through the `saveViewState` message and the `viewState` field of `init`. Folded sections are stored by heading anchor, column widths by the header row text plus its occurrence among tables with the same header. A table whose column count changed drops its widths.
5. **The outline panel** visibility is a page setting (`outline`), like full width and small text.

## Consequences

- Opening, folding or resizing never marks the file as modified, and Git never sees view changes.
- View state is local to one machine and one workspace; collaborators do not share it.
- Renaming a folded heading or editing a table header can lose the saved state for it on the next open.

## Validation

- `tests/outline.test.ts`: folding hides content in the view and leaves the serialized file identical.
- `tests/document-sync.test.ts`: `saveViewState` is stored without editing the document.
- Manual checklist (`docs/TESTING.md`): resizing a column and folding a section keep the file clean.
