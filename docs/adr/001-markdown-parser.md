# ADR-001: Markdown parser and serializer

- **Status:** Accepted
- **Date:** 2026-10-23

## Context

Mdotion must round-trip common GFM constructs without silent data loss. Tiptap needs a ProseMirror document; disk format is Markdown.

## Decision

Isolate all parsing/serialization behind `MarkdownAdapter`. **Chosen stack:** Tiptap **3.32** with `@tiptap/markdown` (`MarkdownManager`) and shared extensions in `src/markdown/mdotionExtensions.ts` (StarterKit H1–H3, link, task list, `Markdown` extension).

## Consequences

- Webview and unit tests share the same extension list.
- Extension host does not bundle Tiptap (adapter used in Vitest only for now); warnings on snapshot can be added later via a lightweight host check.

## Validation

- `tests/markdown-roundtrip.test.ts` — `basic.md`, `frontmatter.md`, `unicode.md`.
- GFM tables remain P2; `gfm.md` not yet a hard gate.
