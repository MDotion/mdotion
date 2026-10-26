# Contributing to Mdotion

Thanks for your interest in Mdotion! Bug reports, feature ideas, documentation fixes and pull requests are all welcome.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and requesting features

- Search the [existing issues](https://github.com/SebastianI5/mdotion/issues) first.
- For bugs, include your editor (VS Code or Cursor) and version, the Mdotion version, and the smallest Markdown snippet that reproduces the problem. If content was changed or lost on save, include the original Markdown and what was written to disk.
- Security vulnerabilities must **not** be reported in public issues — see [SECURITY.md](SECURITY.md).

## Development setup

Requirements: **Node.js 20.11+** (see `.nvmrc`, run `nvm use`), VS Code 1.85+ or Cursor.

```bash
npm install
npm run build        # webview (Vite) + extension host (esbuild)
npm run watch        # rebuild on change
```

Run the extension: open this folder in VS Code, start `npm run watch`, then **Run and Debug → Run Extension (Mdotion)** (F5). Try your changes in the `[Extension Development Host]` window and use **Developer: Reload Window** there after each rebuild.

Work on the UI in a browser, without an Extension Development Host:

```bash
npm run build:webview && npm run harness
# open http://localhost:5178/tests/browser/harness.html  (?theme=dark for the dark theme)
```

The harness fakes the VS Code host and shows the Markdown that would be written to disk.

## Project structure

| Path | Contents |
|---|---|
| `src/extension.ts`, `src/commands` | Activation, commands, keybindings |
| `src/editor` | Custom text editor provider, `DocumentBridge` (versioned sync with the `TextDocument`) |
| `src/markdown` | `MarkdownAdapter` (parse / serialize with source map, raw blocks, escaping), schema extensions |
| `src/shared` | Typed webview ↔ host protocol (zod), text diff |
| `webview/src` | React + Tiptap editor, `EditorSync`, Notion UI components, node views, styles |
| `tests` | Unit tests (Vitest), fixtures, browser harness, e2e suite (`@vscode/test-electron`) |
| `docs/adr` | Architecture Decision Records |

## Checks

Run these before opening a pull request:

```bash
npm run lint
npm test             # unit tests
npm run test:e2e     # opens the editor in a real VS Code instance
```

Changes to the Markdown layer must keep the round-trip guarantees: an unedited file is written back byte for byte, editing one block changes only that block, and unsupported syntax is never dropped. Add a fixture or a test in `tests/markdown-roundtrip.test.ts` for any new construct.

For UI changes, also go through the [manual test checklist](docs/TESTING.md) in both light and dark themes.

## Dependencies and licenses

Mdotion is MIT-licensed and only bundles dependencies under permissive licenses compatible with MIT (currently MIT and BSD-3-Clause). When you add or update a runtime dependency:

1. Check its license is compatible with MIT.
2. Run `npm run notices` to regenerate [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and commit the result (`npm run package` also regenerates it).

## Pull requests

- Keep pull requests focused; describe the problem and how you tested the change.
- Update `CHANGELOG.md` (under **Unreleased**) and the README or ADRs when behaviour changes.
- Follow the existing code style (Prettier config in `.prettierrc`, `npm run format`).

## License of contributions

Mdotion is released under the [MIT License](LICENSE). By submitting a contribution you agree that it is licensed under the same terms, and that you have the right to submit it.
