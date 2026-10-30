# ADR-010: Block-level changes against the last commit

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

0.3.0 shows what changed in a `.md` file since the last commit. Git's own diff is line-based: a paragraph rewritten on one long line, a table whose padding changed or a section moved from the outline all become walls of red and green lines. MDotion already knows the blocks of a document and their exact source (ADR-002), so it can compare blocks instead of lines.

Reading Git needs the file system and a `git` binary, which the webview does not have. The comparison must not change the document either, or opening the view would mark the file as modified.

## Decision

1. **The host reads HEAD through the built-in Git extension** (`vscode.git`, API version 1: `getRepository`, `show`, `getCommit`, `toGitUri`), in `src/git/baseline.ts`. No `child_process`, so it also works in remote workspaces and in Cursor. MDotion does not declare an `extensionDependencies` on it: without Git, the feature is hidden.
2. **Messages:** the webview sends `requestBaseline` once it is loaded. The host answers with `baseline` (`ok` with the text and the abbreviated commit, `untracked`, or `none`) and sends it again whenever HEAD moves (commit, checkout, pull). The webview never says which file to read: the host reads the file of its own panel.
3. **The comparison runs in the webview, against the live editor document**, so it includes edits that are not saved yet.
4. **It looks like a pull request on GitHub**, because that is the diff developers read every day, with GitHub's colours:
   - **Source** (the default tab): the unified diff of the whole file (`jsdiff` `diffLines`), with old and new line numbers, `+` / `-` rows, word-level highlights on lines replaced by similar ones, `@@` hunk headers with three lines of context, and expandable gaps.
   - **Rendered**: the formatted page. `blockDiff.ts` (shared, pure) aligns the top-level blocks of both versions with Myers' algorithm on their source. In the remaining runs, a block whose content is equal (`node.eq`) and only its Markdown changed counts as unchanged; a block of the same type with half of its words in common, or a list / table that kept some of its items or rows, is modified; everything else is removed or added. Removed blocks are red rows where they were, added ones green rows. A modified block shows as its old version then its new one, with the changed words marked, like a replaced line. Lists and tables are diffed item by item and row by row.
5. **The Rendered view is a second, read-only Tiptap editor** with the same schema and node views. Its document is the merged sequence of blocks, coloured with decorations. The real editor stays mounted, hidden, and untouched. Closing the view returns to the same scroll position.
6. In Rendered, the front matter is shown as a small source diff above the page.

## Consequences

- Opening, navigating or closing the Changes view never modifies the file.
- Developers read the diff as they read any Git diff. In Rendered, table re-padding does not count as a change; in Source it does, exactly like Git.
- Moved sections show as removed and added, like in Git (the block diff detects moves, but the view does not single them out).
- Files outside a repository the Git extension knows show no Changes button. VS Code does not open repositories outside the workspace by itself.
- A renamed file counts as new until Git records the rename in HEAD.
- Raw blocks and images are compared as a whole: a changed one shows as removed and added.
- The similarity threshold is a heuristic: a heavily rewritten paragraph can show as removed and added instead of modified.

## Validation

- `tests/block-diff.test.ts`: unchanged, added, removed, modified, moved, formatting-only, lists that gained items, tables with rows added and with columns changed, type changes, code blocks, raw blocks, a thousand blocks in well under a second.
- `tests/review.test.ts`: the Rendered rows (old then new, item by item, row by row) and the Source diff (line numbers, word highlights, hunk headers, expandable gaps).
- `tests/protocol.test.ts` and `tests/document-sync.test.ts`: the new messages are validated and forwarded.
- `tests/e2e/suite/index.ts`: HEAD is read from a real repository (LF line endings, untracked files, new commits), and every editor command leaves the file clean.
- Manual checklist (`docs/TESTING.md`): the Changes view.
