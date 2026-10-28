# Manual testing

Automated tests cover the Markdown round-trip, the sync protocol and the main IDE flows (`npm test`, `npm run test:e2e`). This checklist covers what needs a human: the UI and keyboard behaviour inside a real editor. Run it in VS Code and Cursor, with a light and a dark theme.

## How to run the extension

- **Packaged:** `npm run package`, then **Extensions → ⋯ → Install from VSIX…**, reload the window and open a `.md` file.
- **Development:** `npm run watch`, then **Run Extension (MDotion)** (F5) and test in the `[Extension Development Host]` window.
- **UI only, in a browser:** `npm run build:webview && npm run harness`, then open <http://localhost:5178/tests/browser/harness.html>. The right panel shows the Markdown that would be saved; **External edit** simulates a change made outside the editor.

You are in MDotion when the page has a Notion-like layout with the file name at the top left and **Visual | Markdown**, **Copy**, the theme button and **•••** at the top right. VS Code's built-in Markdown *preview* is read-only and shows **Preview | Markdown** instead.

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
- [ ] Theme: sun / moon button and **•••** → Theme (Auto / Light / Dark). Close and reopen the file: the theme is kept and `mdotion.theme` shows it in Settings. **Auto** follows the IDE theme.

## Troubleshooting

1. **Output → Extension Host** shows extension errors.
2. **Developer: Open Webview Developer Tools** shows webview errors.
3. Check that `dist/extension.js`, `dist/webview/assets/index.js` and `dist/webview/assets/index.css` exist after a build.
4. Builds need Node.js 20.11+: if `crypto.getRandomValues is not a function` appears, the terminal is using an older Node (`nvm use`).
