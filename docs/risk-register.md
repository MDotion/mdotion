# Risk register — mdotion

| ID | Risk | Impact | Mitigation | Status |
|----|------|--------|------------|--------|
| R1 | `@tiptap/markdown` beta / incomplete GFM | High | ADR-001 spike; adapter port; round-trip CI | Open |
| R2 | Silent loss of unsupported syntax | Critical | Opaque blocks; no auto-rewrite; `unsupported.md` fixture | Open |
| R3 | Webview ↔ document sync loop | High | Revisions; `applyingEdit` guard; integration tests | Mitigated (partial) |
| R4 | Undo/redo split (PM vs IDE) | High | ADR-003; forward shortcuts to host | Open |
| R5 | Cursor vs VS Code drift | Medium | Same VSIX; smoke matrix in README | Open |
| R6 | Full-document replace performance | Medium | Benchmark 100KB–1MB; incremental edits later | Open |
| R7 | Webview XSS from Markdown | High | CSP; no remote scripts; sanitize HTML display | Mitigated (partial) |

Update this table at the end of each milestone (see [PIANO-ESECUZIONE.md](./PIANO-ESECUZIONE.md)).
