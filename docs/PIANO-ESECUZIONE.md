# Piano di esecuzione — mdotion

**Prodotto:** estensione VS Code / Cursor per editing visuale di file `.md`  
**Nome:** mdotion  
**Riferimento:** [piano-sviluppo-notion-like-markdown-editor.md](../piano-sviluppo-notion-like-markdown-editor.md) v1.0  
**Versione piano esecuzione:** 1.0  
**Stato repo:** `0.3.0` — editor Notion-like completo, round-trip con source map, sync versionata, test unit + e2e verdi (vedi CHANGELOG e ADR 002–005, 008)

---

## 1. North star

| Principio | Significato operativo |
|-----------|------------------------|
| Markdown su disco | Nessun DB, nessun formato proprietario |
| Nessuna perdita silenziosa | Unsupported → preservare o avvisare; mai rewrite automatico nascosto |
| IDE = fonte di verità | `TextDocument` + `WorkspaceEdit`; webview non scrive il filesystem |
| Integrità prima della UI | Nessun merge in `main` che rompe round-trip o sync senza test |
| Cursor = VS Code | Stesso `.vsix`, API standard, smoke manuale |

**Definizione di successo MVP:** tutti i 10 criteri del §2 del piano originale + ADR-008 verdi in CI.

---

## 2. Architettura (target)

```
TextDocument ←→ MarkdownEditorProvider
                      ↓
                DocumentBridge (revisioni, debounce, conflitti)
                      ↓ postMessage + Zod
                Webview (React + Tiptap)
                      ↓
                MarkdownAdapter (port verso parser/serializer)
```

**Percorsi codice:**

| Area | Path |
|------|------|
| Extension host | `src/` |
| Webview | `webview/src/` |
| Protocollo condiviso | `src/shared/messages.ts` |
| Fixture | `tests/fixtures/` |
| ADR | `docs/adr/` |

---

## 3. Milestone e ordine vincolante

| ID | Nome | Dipende da | Priorità |
|----|------|------------|----------|
| M0 | Spike adapter | — | P0 |
| M1 | Scaffold build | M0 (parziale) | P0 |
| M2 | Tiptap locale | M1 | P0 |
| M3 | File bridge | M2 | P0 |
| M4 | Toggle sorgente | M3 | P0 |
| M5 | Integrità round-trip | M3 | P0 |
| M7 | Hardening / RC | M4, M5 | P0 release |
| M6 | UX Notion-like | **M5** | P1 |
| M8 | Tabelle / immagini | M5 | P2 |
| M9 | Callout / Mermaid | M8 | P2 |
| M10 | Drag blocchi | M6 | P3 |

**Regola:** non iniziare M6 finché M5 non è verde in CI.

---

## 4. Fasi — task, deliverable, exit criteria

### Fase 0 — Spike (5–7 giorni)

| # | Task |
|---|------|
| 0.1 | Validare `@tiptap/markdown` (o alternativa) su `basic.md`, `gfm.md` |
| 0.2 | Implementare `MarkdownAdapter.parseBody` / `serializeBody` con Tiptap JSON o PM |
| 0.3 | Documentare gap in ADR-001 → Accepted o piano B |
| 0.4 | Aggiungere fixture: `unicode.md`, `crlf.md`, `long-100kb.md` (generato) |
| 0.5 | Aggiornare `docs/risk-register.md` |

**Exit:** round-trip semantico su `basic.md` ≥ 95% nodi attesi; decisione parser registrata.

### Fase 1 — Scaffold (stato attuale)

| # | Task | Stato |
|---|------|--------|
| 1.1 | `package.json`, esbuild, Vite, ESLint, Prettier | Fatto |
| 1.2 | `CustomTextEditorProvider` + CSP webview | Fatto |
| 1.3 | `.vsix` locale | Da verificare (`npm run package`) |
| 1.4 | F5 Extension Development Host | Da verificare |

**Exit:** custom editor apre React senza errori console.

### Fase 2 — Editor WYSIWYG in memoria

| # | Task |
|---|------|
| 2.1 | Schema Tiptap completo MVP (liste, task, link, code, quote, hr) |
| 2.2 | Toolbar + shortcut |
| 2.3 | Tema `var(--vscode-*)` |
| 2.4 | Collegare parse/serialize adapter in webview (non placeholder testo) | Fatto |

**Exit:** editing tipi base senza bridge, da JSON Tiptap coerente.

### Fase 3 — Bridge file

| # | Task | Stato |
|---|------|--------|
| 3.1 | `ready` → `documentSnapshot` | Fatto |
| 3.2 | `updateMarkdown` + debounce 200 ms + `WorkspaceEdit` | Fatto (full doc) |
| 3.3 | `onDidChangeTextDocument` → `documentChanged` external | Fatto |
| 3.4 | Anti-loop `applyingEdit` | Fatto |
| 3.5 | Flush debounce on dispose | Parziale (`dispose` su bridge) |
| 3.6 | Serializzazione Markdown reale (non `getText()` placeholder) | Fatto |

**Exit:** modifica visuale → file su disco → riapertura identica per costrutti MVP.

### Fase 4 — Toggle sorgente / visuale

| # | Task | Stato |
|---|------|--------|
| 4.1 | Comandi `openVisualEditor`, `openSource`, `toggleEditor` | Fatto |
| 4.2 | Due viste stesso URI, sync bidirezionale | Da testare |
| 4.3 | Focus e selezione documentati | Da fare |

**Exit:** edit in sorgente visibile in visuale dopo evento IDE.

### Fase 5 — Integrità

| # | Task |
|---|------|
| 5.1 | Round-trip test per ogni fixture |
| 5.2 | Banner warning per sintassi non supportata |
| 5.3 | ADR-002, ADR-003, ADR-006 implementati |
| 5.4 | Checklist undo/redo (sotto) |

**Exit:** `unsupported.md` stabile se utente non tocca zone exotic; MVP §8.1 verde.

### Fase 6 — UX Notion-like (P1)

Slash menu, link popover, checklist click, stati conflitto, a11y tastiera.

**Exit:** operazioni comuni senza sintassi Markdown.

### Fase 7 — Hardening

`@vscode/test-electron`, benchmark file lunghi, sicurezza CSP, README + capability matrix, Cursor smoke.

**Exit:** nessun blocker P0; `1.0.0` candidata.

---

## 5. Protocollo v1 (`src/shared/messages.ts`)

- `protocolVersion: 1` obbligatorio su `ready`.
- Payload max 5 MB su `updateMarkdown`.
- MVP: markdown **intero** per messaggio (ADR-005).
- Messaggi futuri: `parseWarnings[]` su snapshot (ADR-006).

---

## 6. Strategia test

| Livello | Scope | Gate |
|---------|--------|------|
| Unit | `FrontMatter`, `MarkdownAdapter`, Zod messages, `DocumentBridge` | Ogni PR |
| Round-trip | `tests/fixtures/*.md` | Ogni PR (dopo Fase 5) |
| Integration | Mock vscode + bridge | Ogni PR |
| E2E | `@vscode/test-electron` | Pre-release |
| Manuale | Cursor, temi, keyboard-only | RC |

---

## 7. Checklist undo/redo (prima di `1.0.0`)

1. Bold → Undo → ripristino in visuale e su disco  
2. Bold → Undo in visuale con focus webview  
3. Modifica sorgente → Undo in sorgente → visuale aggiornato  
4. Due undo rapidi non duplicano caratteri  
5. Redo dopo undo visuale  
6. External Git checkout → nessun crash; warning o reload  
7. Conflitto revision → nessun overwrite silenzioso  
8. Chiudi editor con debounce pending → ultimo carattere salvato  
9. Cmd+Z con selezione multi-paragrafo  
10. Task list toggle → undo  
11. Incolla blocco → undo  
12. Heading da slash → undo  
13. Link inserito → undo  
14. Code fence → undo  
15. Switch visuale/sorgente → undo ancora sensato in sorgente  

---

## 8. Performance (benchmark da registrare)

Documenti: ~100 KB, ~500 KB, ~1 MB. Misurare: apertura, prima keystroke, serialize+apply, memoria webview. Soglie definitive solo dopo M3 stabile.

---

## 9. Epiche (backlog)

| Epic | Contenuto |
|------|-----------|
| E1 Markdown truth | Adapter, fixture, round-trip CI |
| E2 Extension shell | Build, provider, CSP, vsix |
| E3 Sync engine | Bridge, revisioni, conflitti, undo policy |
| E4 Visual editing | Tiptap, toolbar, theme |
| E5 IDE integration | Toggle, doppia vista |
| E6 Writer UX | Slash, link, a11y |
| E7 Release | Docs, marketplace |

Ordine: **E1 ∥ E2** → **E3+E4** → **E5** → **E5+E1 tests** → **E6** → **E7**.

---

## 10. Calendario primi 14 giorni

| Giorno | Obiettivo |
|--------|-----------|
| 1–2 | Spike adapter + ADR-001 Accepted |
| 3 | Round-trip `basic.md` in CI |
| 4–5 | Tiptap ↔ Markdown in webview (fine placeholder) |
| 6–7 | Sync end-to-end su file reale |
| 8 | Toggle + due viste |
| 9–10 | Fixture ampliate + unsupported preserve |
| 11 | Undo policy ADR-003 |
| 12 | Integrazione test bridge |
| 13 | `npm run package` + profilo pulito |
| 14 | Smoke Cursor |

**DoD giorno 14:** come §19 del piano originale (file `.md` end-to-end + sorgente).

---

## 11. Definition of Ready / Done

**Ready (issue):** criterio di accettazione scritto; fixture o screenshot atteso; dipendenze epic indicate.

**Done (issue):** codice + test; ADR aggiornato se comportamento utente; nessun `setContent` full senza ticket; documentato in CHANGELOG se user-facing.

---

## 12. Issue checklist — copia in tracker

### P0 — Bloccanti

```markdown
- [x] E1: Spike @tiptap/markdown — report gap + ADR-001 Accepted
- [x] E1: MarkdownAdapter parse/serialize reali (no placeholder webview)
- [x] E1: Round-trip CI su basic.md, gfm.md (parziale), frontmatter.md, unsupported.md
- [ ] E2: Build ripetibile + vsix in profilo pulito
- [ ] E3: Flush debounce on webview dispose / panel close
- [ ] E3: Test integrazione open → edit → save → reopen
- [ ] E4: Schema Tiptap allineato a MarkdownCapabilities
- [ ] E5: Toggle visuale/sorgente verificato con due tab
- [ ] E5: Sync modifica esterna (sorgente) → visuale
- [ ] ADR-003: Undo/redo checklist 15 punti
- [ ] ADR-002: Banner + nessun rewrite automatico su unsupported
- [ ] ADR-006: Parse error → no applyEdit
```

### P1 — Esperienza

```markdown
- [x] Slash menu MVP (§10.3 piano originale)
- [ ] Link popover
- [ ] Toolbar contestuale completa
- [ ] Stati conflitto UI
- [ ] Tema chiaro/scuro verificato
- [ ] Accessibilità tastiera slash + toolbar
```

### P2 — Blocchi aggiuntivi

```markdown
- [ ] Tabelle GFM
- [ ] Immagini locali (asWebviewUri)
- [ ] Callout sintassi documentata
- [ ] Front matter editor UI (opzionale)
- [ ] Mermaid = fence preservato
```

### P3 — Avanzato

```markdown
- [ ] Block handle + drag reorder
- [ ] Incolla da browser
- [ ] Performance documenti grandi
- [ ] Impostazioni utente
```

---

## 13. Trigger stop-work

| Segnale | Azione |
|---------|--------|
| Round-trip perde task/HTML in 2+ fixture | Stop UI; adapter o nodi opachi |
| Undo duplica testo | Freeze feature; solo undo IDE |
| Loop sync in test | Nessuna feature finché revision verde |
| Full replace > 300 ms @ 100 KB | ADR-005 revisione incremental |

---

## 14. Distribuzione

1. Publisher marketplace (nome da definire)  
2. `mdotion.mdotion` o `{publisher}.mdotion`  
3. `0.1.0` = bridge affidabile; `1.0.0` = MVP §2 completo  

---

## 15. Stato scaffold corrente

Completato in repo:

- Struttura cartelle, script `build` / `watch` / `test` / `package`
- `MarkdownEditorProvider`, `DocumentBridge`, protocollo Zod
- Webview React + Tiptap con `getMarkdown` / front matter split
- `MarkdownAdapter` + round-trip CI su fixture core
- Comandi toggle / sorgente / visuale
- Fixture + test iniziali

**Prossimo passo critico:** Epic E5 (toggle verificato), undo ADR-003, `gfm.md` in CI, integrazione `@vscode/test-electron`.
