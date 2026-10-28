# ADR-008: Capability guarantee

- **Status:** Accepted
- **Date:** 2026-10-23

## Decision

**Editable visually (round-trip tested):** paragraphs, headings H1–H6 (slash menu offers H1–H3), bold, italic, strikethrough, inline code, links and autolinks, bulleted / numbered / to-do lists (nested), quotes, GitHub alerts as callouts, fenced and indented code with language, horizontal rules, GFM tables (with column alignment), block images, hard breaks.

**Preserved verbatim, editable as source:** YAML front matter (properties panel), HTML blocks, inline HTML, link reference definitions, badges and any block that would not round-trip (ADR-002).

**Not part of the file (ADR-009):** column widths, folded sections, the outline panel.

**Not guaranteed:** rendering arbitrary HTML faithfully (previews are sanitized), Markdown dialects beyond CommonMark + GFM.

The list is mirrored in `src/markdown/MarkdownCapabilities.ts` and the README.
