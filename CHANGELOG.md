# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
