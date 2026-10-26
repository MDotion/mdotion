---
status: In progress
owner: Docs team
---

# Release checklist

Everything you need to ship **v1.0** — written in plain Markdown, edited like a page.

> [!TIP]
> Type `/` anywhere to add a block, or drag a block by its handle to move it.

## Before the release

- [x] Freeze the feature list
- [x] Update the changelog
- [ ] Record the demo video
  - [ ] Light theme
  - [ ] Dark theme

| Area | Owner | Status |
| :--- | :---- | -----: |
| Editor | Ada | ✅ |
| Docs | Linus | 🚧 |
| Website | Grace | ⏳ |

## Build

```bash
npm ci
npm run package
```

> Ship small, ship often.
