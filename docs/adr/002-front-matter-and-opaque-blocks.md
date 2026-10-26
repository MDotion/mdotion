# ADR-002: Front matter and unsupported content

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Many repos use YAML front matter. Docs contain HTML, reference definitions, badges and syntax outside the editor schema. The first implementation re-serialized the whole document on every edit, which silently deleted tables, images and HTML and rewrote unrelated lines.

## Decision

1. **Front matter** is split off (`FrontMatter.splitFrontMatter`) and never parsed by the editor. The webview shows it as Notion-style page properties and edits it as raw YAML.
2. **Source map.** `MarkdownAdapter.parse` splits the body into top-level source segments (marked tokens; their `raw` values concatenate back to the exact source). Top-level editor nodes the user did not touch are written back with their original source and separators — byte for byte.
3. **Raw blocks.** A segment becomes an opaque `rawBlock` (preview + editable source) when it uses an unsupported token, produces invalid schema content, or is not *stable* (serializing and re-parsing it does not give the same nodes). HTML blocks, link reference definitions and badges fall in this category; `<details>` sections spanning blank lines are merged into one block.
4. **Inline HTML** (`<kbd>`, `<sup>`…) becomes an `htmlInline` atom kept verbatim.
5. **Escaping** is minimal (`escape.ts`): `snake_case`, `&`, `[^1]`, `[!NOTE]` are not escaped; line starts that would re-parse as another block are.

## Consequences

- Opening a file never writes to it; editing one block changes only that block's lines.
- Edited blocks are re-serialized in a canonical form (e.g. `*` for italic, `-` for bullets).

## Validation

- `tests/markdown-roundtrip.test.ts`: every fixture is byte-identical without edits, stable when re-serialized from scratch, and single-block edits change a single line.
- `tests/e2e`: opening a file in VS Code leaves it clean.
