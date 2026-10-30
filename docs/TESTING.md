# Manual testing

Automated tests cover the Markdown round-trip, the sync protocol and the main IDE flows (`npm test`, `npm run test:e2e`). This checklist covers what needs a human: the UI and keyboard behaviour inside a real editor. Run it in VS Code and Cursor, with a light and a dark theme.

## How to run the extension

- **Packaged:** `npm run package`, then **Extensions → ⋯ → Install from VSIX…**, reload the window and open a `.md` file.
- **Development:** `npm run watch`, then **Run Extension (MDotion)** (F5) and test in the `[Extension Development Host]` window.
- **UI only, in a browser:** `npm run build:webview && npm run harness`, then open <http://localhost:5178/tests/browser/harness.html>. The right panel shows the Markdown that would be saved; **External edit** simulates a change made outside the editor. The file as loaded plays the last commit for **Changes**; `?baseline=notion-before.md` compares with an older version of the fixture, `?baseline=untracked` and `?baseline=none` simulate a new file and a file outside Git. Commands that come from VS Code in the real editor (Find, Show Changes…) can be sent with `__host.send({ type: 'command', command: 'find' })`.

You are in MDotion when the page has a Notion-like layout with the file name at the top left and **Visual | Markdown**, **Changes** (in a Git repository), the magnifier, **Copy**, the theme button and **•••** at the top right. VS Code's built-in Markdown *preview* is read-only and shows **Preview | Markdown** instead.

## Checklist

Use `tests/fixtures/notion.md` (it contains every supported construct).

- [ ] On a fresh install, opening a `.md` file shows the text editor and the prompt *Open Markdown files in the MDotion visual editor by default?*; **Use by default** switches the file to MDotion, **Not now** asks again a week later, **Don't ask again** never asks.
- [ ] Opening the file in MDotion does not mark it as modified.
- [ ] Edit one paragraph, save, switch to **Markdown**: only that line changed.
- [ ] `/` opens the block menu, typing filters it, `Enter` inserts; `/xyz` shows "No results".
- [ ] `+` and `⋮⋮` next to blocks: add a block, drag a block, block menu (Turn into, Duplicate, Move, Delete).
- [ ] Select text → formatting toolbar; `⌘K` edits a link; `⌘B` does **not** toggle the IDE sidebar.
- [ ] `⌘Z` / `⌘⇧Z` undo and redo one step at a time and the caret stays in place.
- [ ] Edit the file in the source editor side by side: the visual editor updates without moving the caret.
- [ ] Clicking a link places the caret (no browser); `⌘`-click opens it; a link to another `.md` opens it in the IDE.
- [ ] Tables, callouts (click the icon to change type), code blocks (language picker, Copy), relative images, front matter (**Edit properties**).
- [ ] Block selection: drag from one paragraph to another, or from the left margin; `Esc`, `Shift+↓`, `⌘A` twice. `⌘C` and paste into another file: formatted Markdown is pasted.
- [ ] `⋮⋮` with several blocks selected: the menu shows "N blocks" and Duplicate / Move / Delete apply to all of them.
- [ ] **Visual | Markdown** and `⌘⌥M`: the tab is replaced (not duplicated), also with unsaved changes.
- [ ] **Copy** and `⌘⇧⌥C`: the clipboard contains the whole file.
- [ ] **Paste a spreadsheet**: copy a range from Excel, Numbers and Google Sheets, paste in an empty line: a table appears, the first row is the header, number columns stay right-aligned; `⌘Z` removes it in one step. `⌘⇧V` pastes plain text instead. Paste a range with the caret inside an existing table: cells are filled from the caret and the table grows.
- [ ] Paste a table copied from a GitHub README and from Wikipedia: links, bold and code are kept, merged cells are split.
- [ ] Table grips: hover a cell → `⋯` above the column and `⋮` left of the row. Click opens the menu (insert, move, duplicate, clear, delete, column alignment); drag reorders. The `+` bars on the right and bottom edges add a column / row, dragging them adds several.
- [ ] Table keyboard: `Tab` / `⇧Tab` move between cells, `Enter` goes to the cell below (adds a row at the bottom), `⇧Enter` adds a line break, `⌘⇧↑/↓` moves the row, `Esc` selects the table.
- [ ] Column resize: drag the border between two header cells, double-click it to fit the content. The file is **not** marked as modified; close and reopen: the widths are kept.
- [ ] Outline (button next to **Copy**): headings with indentation, the current section highlighted while scrolling, `!` on duplicate titles and skipped levels. Click jumps; drag a section above another (heading, content and subsections move; only those lines change in **Markdown**); `Alt+↑/↓` on a focused item does the same.
- [ ] Folding: chevron next to a heading (or in the outline) hides its section and shows "N blocks"; the file is not modified; the arrow keys skip the hidden content; reopen the file: the section is still folded.
- [ ] `⌘⇧O` opens the heading search; typing filters, `Enter` jumps (unfolding the section if needed).
- [ ] **MDotion: Toggle Outline** (`⌘⌥O`) and **MDotion: Go to Heading** from the Command Palette work in the visual editor and are hidden elsewhere.
- [ ] `/table` opens the size grid: arrow keys and the mouse change the size, `Enter` inserts it.
- [ ] `⌘⇧V` pastes the clipboard as plain text (lines become paragraphs, no table, no Markdown).
- [ ] **Find** (`⌘F` and the magnifier): the selected text becomes the query, matches are highlighted as you type, `Enter` / `⇧Enter` and `⌘G` / `⌘⇧G` cycle with wrap-around, **Aa** / **ab** / **.\*** (and `⌘⌥C/W/R`, `Alt+C/W/R` on Windows / Linux) change the results, an invalid regex turns the field red. A match in a folded section unfolds it. `Esc` closes the bar, removes the highlights and leaves the caret on the match. `⌘F` in the **Explorer** or the terminal still does what VS Code does there.
- [ ] **Replace** (`⌘⌥F` / `Ctrl+H`): **Replace** changes the selected match and moves on, **All** (`⌘Enter` in the field) replaces everything, then `⌘Z` in the editor restores everything in one step. In **Markdown**, only the lines with a match changed. With `(\d+)-(\d+)` → `$2-$1` the groups are swapped. A match in a raw HTML block is counted ("1 in raw Markdown") but not replaced.
- [ ] **Shortcuts panel** (`⌘⌥K`, **•••** → Keyboard shortcuts): every section is listed, the search filters, **Customize…** opens Keyboard Shortcuts on `mdotion.`. Rebind **MDotion: Find** to another key: the new key opens the bar, `⌘F` no longer does.
- [ ] **Non-US keyboard** (for example Italian or German): every shortcut above works with the keys the shortcuts panel shows; `⌘⌥K` opens the panel and does not turn the block into a list.
- [ ] **Notion block shortcuts**: `⌘⌥4` to-do, `⌘⌥5` bulleted, `⌘⌥6` numbered, `⌘⌥8` code, `⌘⌥9` callout; `⌘⌥0–3` still give text and headings 1–3.
- [ ] **Folding from the keyboard**: `⌘⌥↑` folds the section around the caret (pressing it again folds the parent) without moving the caret elsewhere, `⌘⌥↓` unfolds it, `⌘⌥T` folds or unfolds everything.
- [ ] **Changes** (file in a Git repository, edited since the last commit): the top bar shows the number of changed blocks, updated a moment after each edit. Open it on **Source**: a GitHub-style unified diff with old and new line numbers, `+` / `-` rows in green and red, the changed words darker, `@@` headers, three lines of context and an expand button on the hidden lines. Switch to **Rendered**: removed blocks as red rows and new ones as green rows across the whole width, a changed paragraph as old then new with the changed words marked, a new list item green on its own (not the whole list), a changed table row as old then new row, changed properties at the top. A re-padded table does not show in **Rendered**. `↑` / `↓` and `Alt+F5` go through the changes in both views. In **Rendered**, clicking a block returns to editing on it; `Esc` returns to the same scroll position. Reopening the view keeps the last tab. The file is never marked as modified by opening or closing the view.
- [ ] **Changes** after a commit (from the Source Control view or the terminal): the count drops to zero without reopening the file. A new file shows **New file** and everything as added; a file outside any repository has no Changes button. **Open in diff editor** opens VS Code's diff against HEAD.
- [ ] Theme: sun / moon button and **•••** → Theme (Auto / Light / Dark). Close and reopen the file: the theme is kept and `mdotion.theme` shows it in Settings. **Auto** follows the IDE theme.

## Troubleshooting

1. **Output → Extension Host** shows extension errors.
2. **Developer: Open Webview Developer Tools** shows webview errors.
3. Check that `dist/extension.js`, `dist/webview/assets/index.js` and `dist/webview/assets/index.css` exist after a build.
4. Builds need Node.js 20.11+: if `crypto.getRandomValues is not a function` appears, the terminal is using an older Node (`nvm use`).
