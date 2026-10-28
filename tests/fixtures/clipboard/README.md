# Clipboard fixtures

Each fixture is a pair: `NAME.html` (the `text/html` flavour) and `NAME.txt` (`text/plain`), as an application puts them on the clipboard. `tests/table-paste.test.ts` turns them into tables.

| Fixture | Source | How |
|---|---|---|
| `excel-mac` | Microsoft Excel for Mac, Italian locale (bold header, currency, percentages, a line break in a cell, merged cells) | Real capture |
| `github-chrome` | A GitHub wiki table with aligned columns, copied in Chrome | Real capture |
| `wikipedia-spans-chrome` | A Wikipedia table with `rowspan` and `colspan`, copied in Chrome | Real capture |
| `wikipedia-regions-chrome` | A Wikipedia article table (links, flags, footnotes, two header rows), copied in Chrome | Real capture |
| `excel`, `google-sheets`, `numbers`, `libreoffice`, `github`, `wikipedia`, `not-a-table` | Modelled on what these sources produce, to cover specific cases | Hand-written |

To add a real capture, run `npm run harness`, open <http://localhost:5178/tests/browser/clipboard-capture.html>, paste, and download the two files. On macOS the clipboard can also be read with:

```bash
osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSPasteboard.generalPasteboard.stringForType("public.html").js' > NAME.html
osascript -l JavaScript -e 'ObjC.import("AppKit"); $.NSPasteboard.generalPasteboard.stringForType("public.utf8-plain-text").js' > NAME.txt
```
