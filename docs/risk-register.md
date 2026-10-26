# Risk register

| ID | Risk | Impact | Mitigation | Status |
|----|------|--------|------------|--------|
| R1 | `@tiptap/markdown` incomplete for real-world Markdown | High | `MarkdownAdapter` port, stability check per block, raw blocks (ADR-002), round-trip tests | Mitigated |
| R2 | Silent loss of unsupported syntax | Critical | Source map + raw blocks: untouched blocks written back byte for byte (ADR-002) | Mitigated |
| R3 | Webview ↔ document sync loop or lost keystrokes | High | Versioned protocol, own-change detection by text, minimal replace steps (ADR-004) | Mitigated |
| R4 | Undo/redo split between ProseMirror and the IDE | High | Webview owns undo while focused, keyboard guard (ADR-003) | Mitigated |
| R5 | Cursor vs VS Code drift (keybindings, internal commands) | Medium | Same VSIX, fallbacks for internal commands, manual checklist in `docs/TESTING.md` | Open |
| R6 | Performance on large documents | Medium | Minimal text edits, serialization proportional to edited blocks (ADR-005); benchmarks still to do | Open |
| R7 | Webview XSS from Markdown content | High | Strict CSP with nonce, no remote scripts, allow-list HTML sanitizer for previews | Mitigated |

Update this table when a risk changes status.
