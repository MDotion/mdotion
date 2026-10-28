# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-28

Tables you can paste from a spreadsheet and edit like one, and an outline to find your way around long documents and reorganize them. As before, the file on disk stays standard Markdown: nothing in this release adds new syntax to your files.

### Added

#### Paste a spreadsheet

- Copy a range in **Excel**, **Numbers**, **LibreOffice** or **Google Sheets**, paste it in MDotion: you get a GFM table.
- Tables copied from a **web page** (GitHub, Wikipedia, documentation sites) are converted the same way.
- The first row becomes the header, as GFM requires.
- Columns of numbers keep their alignment, written as `---:`. Centered columns become `:---:`.
- Links, bold, italic and inline code are kept. Lines inside a cell become `<br>`.
- Lists and paragraphs in a cell are flattened to one line, and images become their alt text.
- Merged cells (`colspan` / `rowspan`) are split into regular cells, with the content in the first one.
- A `|` inside a cell is escaped, so the table structure never breaks.
- Pasting with the caret **inside a table** fills the cells from the caret and adds rows and columns as needed.
- `⌘⇧V` / `Ctrl+Shift+V` pastes plain text, when you don't want a table.
- One paste is one undo step.

#### Edit tables visually

- **Row and column grips** appear when the pointer is over a cell: `⋯` above the column, `⋮` left of the row.
  - Click a grip to select the row or column and open its menu.
  - Drag a grip to move the row or column.
- **Column menu:** align left, center or right; insert left / right; move left / right; duplicate; clear contents; reset column widths; delete.
- **Row menu:** insert above / below; move up / down; duplicate; clear contents; delete.
- **`+` bars** on the right and bottom edges of a table add a column or a row. Drag them to add several at once.
- **Choose the size** of a new table: `/table` opens a grid. Pick a size with the mouse or the arrow keys, then press `Enter`.
- The first row always stays the header, whatever you move, insert or delete.

#### Spreadsheet keyboard

- `Tab` / `⇧Tab`: next / previous cell. `Tab` in the last cell adds a row.
- `Enter`: the cell below; at the bottom of the table it adds a row.
- `⇧Enter`: a line break inside the cell, saved as `<br>`.
- `⌘⇧↑` / `⌘⇧↓` (`Ctrl+Shift+↑/↓`): move the row with the caret.
- `Esc`: select the whole table as a block.

#### Resizable columns

- Drag the border between two columns to resize them. Double-click the border to fit the column to its content.
- Widths are kept per file by the editor and come back when you reopen it.
- Widths are **never written to the Markdown**, which has no syntax for them: resizing does not mark the file as modified.

#### Outline

- **MDotion: Toggle Outline** (`⌘⌥O` / `Ctrl+Alt+O`, or the button next to **Copy**) opens a side panel with the headings of the page. Headings inside quotes and callouts are left out, because they don't start a section.
- The section you are reading is highlighted as you scroll. Click a heading to jump to it.
- **Move whole sections:** drag a heading in the outline, or press `Alt+↑/↓` on a focused heading. The heading moves with its content and subsections.
- Moved blocks keep their exact source text; in Git the change shows up as lines moved.
- **Warnings:** a `!` marks headings with the same title as another (their links would collide), headings that skip a level (H1 followed by H3) and empty headings.
- On narrow windows the outline floats over the page instead of squeezing it.
- Whether the outline is open is remembered, like full width and small text.

#### Folding

- Fold a section from the chevron next to its heading, or from the outline. A folded heading shows how many blocks it hides; click that to unfold.
- **Fold all / Unfold all** from the outline header.
- The caret skips hidden content, and jumping to a heading inside a folded section unfolds it.
- Folded sections stay folded when you reopen the file. Like column widths, this is never written to the Markdown.

#### Go to heading

- **MDotion: Go to Heading** (`⌘⇧O` / `Ctrl+Shift+O` in the visual editor) searches the headings of the page and jumps to the one you pick. In MDotion it takes the place of VS Code's Go to Symbol, which is not available in visual editors.

#### Other

- **Move section up / Move section down** in the block menu (`⋮⋮`) of a heading.
- New commands in the Command Palette: **MDotion: Toggle Outline** and **MDotion: Go to Heading**. Both can be rebound in **Keyboard Shortcuts**.

### Changed

- The table toolbar that appeared above tables is replaced by the row and column grips and their menus.
- The Marketplace description and keywords mention the outline and pasting from spreadsheets.

### Fixed

- `Tab` and `⇧Tab` inside a table did nothing, because the list indentation shortcut took them first. They now move between cells.
- Editing a table with aligned columns wrote a separator row one or two characters wider than the columns (`| -------: |`). It now lines up with the cells.
- Links to a repeated heading (`#overview-1`) jumped to the first heading with that title. They now follow GitHub's anchors and go to the right one.

## [0.1.0] - 2026-10-27

First public release (preview).

### Added

- Notion-style visual editor for `.md` files in VS Code and Cursor: page layout and typography, page title, front matter as page properties, page options (full width, small text, fonts).
- Slash menu, block handles with drag & drop and block menu (Turn into, Duplicate, Move, Copy as Markdown, Delete), selection toolbar with link editing (`⌘K`), Notion keyboard shortcuts.
- Headings, lists, to-dos, quotes, callouts (GitHub alerts), GFM tables, images with relative paths, code blocks with language and syntax highlighting.
- Unsupported Markdown and HTML are kept verbatim as raw blocks and inline atoms, previewed and editable as source.
- Faithful round trip: untouched blocks are written back byte for byte and an edit changes only the edited block.
- Notion block selection (drag across blocks, rectangle from the margins, `Esc`, `Shift+↑/↓`, `⌘A` twice); selected blocks can be copied, cut, deleted, duplicated, moved and turned into another type together.
- Copy always writes Markdown as plain text.
- **Visual | Markdown** switch in the top bar and `⌘⌥M` / `Ctrl+Alt+M`, replacing the tab in place without losing unsaved changes.
- **Copy all Markdown**: top-bar button, editor title button and `⌘⇧⌥C` / `Ctrl+Shift+Alt+C`.
- Light / dark theme switch stored in the `mdotion.theme` setting; **Auto** follows the editor theme.
- Optional default editor: MDotion offers once to become the default Markdown editor, and **Use as Default Markdown Editor** / **Stop Using as Default Markdown Editor** change it at any time.
- Conflict banner with "Restore my version" when the file changes outside the editor.
