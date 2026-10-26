# ADR-005: Document update granularity

- **Status:** Accepted
- **Date:** 2026-10-23

## Decision

- The webview debounces local edits (300 ms) and flushes immediately on blur, page hide, Cmd+S, Cmd+W and before opening the source.
- The host applies the **smallest single-range edit** (`computeTextChange`: common prefix/suffix, never splitting CRLF or surrogate pairs), converted to the document's EOL. Other views keep their cursors and the source editor's undo history stays meaningful.
- `onWillSaveTextDocument` waits for queued webview edits.
- There is one debounce only (the first implementation debounced in both webview and host).

## Consequences

- Serialization cost is proportional to the edited blocks: untouched blocks reuse their source text.
