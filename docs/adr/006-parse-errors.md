# ADR-006: Parse error handling

- **Status:** Proposed
- **Date:** 2026-10-23

## Context

Malformed or unsupported Markdown must not corrupt the file on disk.

## Decision

On parse failure: show read-only or source-only CTA (**Open Source**), `parseWarnings` on snapshot, **no** `WorkspaceEdit` until user edits in a safe mode.

## Consequences

- Adapter returns `Result` type (future) instead of throwing into bridge.

## Validation

- Integration test: invalid state does not call `applyEdit`.
