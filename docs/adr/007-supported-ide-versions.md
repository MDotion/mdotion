# ADR-007: Supported IDE versions

- **Status:** Proposed
- **Date:** 2026-10-23

## Context

Mdotion targets VS Code and Cursor using standard Extension APIs.

## Decision

- **Minimum:** VS Code `1.85.0` (`engines.vscode` in `package.json`).
- **Cursor:** latest stable smoke-tested with the same `.vsix`; no Cursor-specific APIs in MVP.

## Consequences

- Compatibility matrix in README updated each release.

## Validation

- Manual smoke on VS Code + Cursor before marketplace publish.
