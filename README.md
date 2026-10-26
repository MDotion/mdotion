# Mdotion

Notion-style visual editing for **plain Markdown** (`.md`) inside **VS Code** and **Cursor**. Files stay portable Markdown on disk — no cloud, no proprietary format, and blocks you don't touch are written back byte for byte.

## Features

- **Notion UI**: centered page, the first `# H1` as page title, Notion typography and colours, light / dark theme switch (sun / moon button; **Auto** follows the IDE, the choice is saved in the `mdotion.theme` setting), full-width / small-text / serif / mono page options (`•••`).
- **Slash menu** (`/`): text, headings, bulleted / numbered / to-do lists, quote, callout, code, divider, table, image — with search and keyboard navigation.
- **Block handles**: hover a block for `+` (add below, ⌥-click above) and `⋮⋮` (drag to move, click for Turn into / Duplicate / Move / Copy as Markdown / Delete).
- **Block selection** like Notion: drag across blocks or from the margin, `Esc`, `Shift+↑/↓`, `⌘A` twice. Selected blocks are copied as Markdown, and can be deleted, duplicated, moved or turned into another type together.
- **Selection toolbar**: Turn into, bold, italic, strikethrough, code, link (`⌘K`).
- **Markdown shortcuts**: `# `, `- `, `1. `, `[] `, `> `, ` ``` `, `---`, plus `⌘B/I/E`, `⌘⇧S`, `⌘⌥1–3`, `⌘⇧7/8/9`, `⌘↵` (toggle to-do), `⌘D` (duplicate), `⌘⇧↑/↓` (move block), Tab / ⇧Tab (indent).
- **Callouts** stored as GitHub alerts (`> [!NOTE]`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`); click the icon to change type.
- **Code blocks** with language picker, syntax highlighting and copy button. **Tables** with row/column controls. **Images** with relative paths and captions (alt text).
- **Front matter** shown as page properties, edited as YAML.
- **Nothing is lost**: HTML, reference definitions, badges and anything the editor cannot represent are kept verbatim as source blocks (with a sanitized preview, editable as source).
- **Real files**: edits go through the IDE `TextDocument` (minimal edits, IDE save / dirty state / Git work as usual); external changes appear live without moving the caret; conflicts never overwrite silently.
- **Copy as Markdown**: anything you copy pastes as formatted Markdown elsewhere; paste Markdown to get blocks.
- **Switch & copy**: **Visual | Markdown** toggle and **Copy** (whole file) in the top bar — `⌘⌥M` / `Ctrl+Alt+M` switches view in place, `⌘⇧⌥C` / `Ctrl+Shift+Alt+C` copies all the Markdown (both also work from the source editor).

## Commands

| Command | ID |
|---|---|
| Mdotion: Open Visual Editor | `mdotion.openVisualEditor` |
| Mdotion: Open Markdown Source | `mdotion.openSource` |
| Mdotion: Switch Visual / Markdown Editor (`⌘⌥M`) | `mdotion.toggleEditor` |
| Mdotion: Copy All Markdown (`⌘⇧⌥C`) | `mdotion.copyMarkdown` |

Also available from the editor title bar (book / code icons), the status bar, the explorer context menu, and **Reopen Editor With…**.

## Settings

| Setting | Values | Default |
|---|---|---|
| `mdotion.theme` | `auto` (follow the IDE), `light`, `dark` | `auto` |

## Supported Markdown

See [ADR-008](docs/adr/008-mvp-capability-guarantee.md). In short: CommonMark + GFM (tables, task lists, strikethrough, autolinks) and GitHub alerts are editable; everything else is preserved verbatim.

## Development

Requirements: **Node.js 20.11+** (`nvm use`), VS Code **1.85+** or Cursor.

```bash
npm install
npm run build        # webview (Vite) + extension host (esbuild)
npm test             # unit tests (Vitest)
npm run test:e2e     # opens the editor in a real VS Code instance
npm run lint
npm run package      # produces mdotion-<version>.vsix
```

- **Run in the IDE:** open this folder, `npm run watch`, then **Run Extension (Mdotion)** (F5).
- **Work on the UI in a browser:** `npm run build:webview && npm run harness`, then open <http://localhost:5178/tests/browser/harness.html> (`?theme=dark`). A fake host shows the Markdown that would be written to disk.

## Architecture

- `src/editor` — `CustomTextEditorProvider`, `DocumentBridge` (versioned sync, conflict detection), minimal text edits.
- `src/markdown` — `MarkdownAdapter` (parse/serialize on top of `@tiptap/markdown`, source map, raw blocks, escaping), shared schema extensions.
- `webview/src` — React + Tiptap editor, `EditorSync`, Notion UI components, node views.
- Decisions: [docs/adr](docs/adr/README.md).

## License

MIT — see [LICENSE](LICENSE).
