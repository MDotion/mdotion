# Piano release 0.2.0 — Tabelle e outline

**Base:** `0.1.0` (prima preview pubblica, 2026-10-27)
**Obiettivo:** rendere MDotion lo strumento più comodo per scrivere documentazione tecnica lunga: tabelle che si incollano da un foglio di calcolo e si modificano come in Notion, documenti lunghi che si navigano e si riorganizzano trascinando le sezioni.
**Demo di lancio:** copio un intervallo da Excel / Google Sheets → incollo in MDotion → ottengo una tabella GFM pulita.
**Fuori da questa release:** gestione delle immagini, rimandata (analisi conservata in [backlog-images.it.md](backlog-images.it.md)).

**Stato (2026-10-28):** M0–M6 completati sul branch `release-0.2.0`: test unitari ed e2e verdi, fixture degli appunti reali da Excel per Mac e Chrome (GitHub, Wikipedia), sito aggiornato in locale (`mdotion-website`, da pubblicare con il rilascio). Restano solo le verifiche che richiedono una persona: la checklist manuale in VS Code e Cursor, e fixture reali da Numbers e Google Sheets (vedi `tests/fixtures/clipboard/README.md`).

---

## 1. Vincoli

Sono i principi della 0.1.0 (vedi [execution-plan.it.md](execution-plan.it.md) §1 e ADR 002–008). Ogni task sotto deve rispettarli.

| Vincolo | Conseguenza per la 0.2.0 |
|---|---|
| Il file resta Markdown standard | Nessun metadato proprietario nel `.md`. Larghezze colonne, sezioni collassate e stato dell'outline sono **stato della vista**, non contenuto. |
| Round trip fedele (ADR-002) | Ciò che non è "contenuto" non deve finire negli attributi dei nodi: un attributo cambiato fa perdere l'origine al blocco e lo fa riserializzare. |
| La webview non scrive il filesystem | Lo stato della vista da conservare (larghezze colonne) passa all'host con un messaggio validato con zod. |
| Un'azione = un passo di undo | Incollare una tabella, riordinare una colonna, spostare una sezione: ognuna è annullabile con un solo `⌘Z`. |
| Cursor = VS Code | Il drag & drop di righe, colonne e sezioni va provato in entrambi. |

---

## 2. Ordine e stima

| ID | Milestone | Dipende da | Stima |
|----|-----------|------------|-------|
| M0 | Fondamenta: fixture appunti, messaggio `saveViewState` | — | 1 g |
| M1 | Tabelle: incolla da foglio di calcolo e da web | M0 | 3 g |
| M2 | Tabelle: maniglie, riordino, allineamento, tastiera | M1 | 4 g |
| M3 | Tabelle: ridimensionamento colonne (stato vista) | M2 | 1–2 g |
| M4 | Outline: pannello, navigazione, diagnostica | — | 2 g |
| M5 | Outline: spostamento sezioni e folding | M4 | 3 g |
| M6 | Hardening, documentazione, release | tutte | 2–3 g |

**Totale:** ~16–18 giorni di lavoro.

**Sequenza consigliata:** M0 → M1 (la demo è subito pronta) → M4 (veloce, alto valore) → M2 → M5 → M3 → M6.
Tabelle (M1–M3) e outline (M4–M5) toccano file diversi, quindi possono procedere in parallelo.

**Taglio di scope se serve uscire prima:** M3 passa alla 0.2.x senza compromettere la demo.

---

## 3. Tabelle (priorità altissima)

### Stato attuale

- Schema: `Table` di Tiptap con `resizable: false`, celle con `content: 'paragraph'` ([mdotionExtensions.ts](../../src/markdown/mdotionExtensions.ts)).
- Il serializer di `@tiptap/extension-table` già supporta allineamento (`:---:`), padding delle colonne e `<br>` per gli a capo nelle celle.
- UI: una bubble toolbar con sette pulsanti ([TableMenu.tsx](../../webview/src/components/TableMenu.tsx)).
- Incolla: `MarkdownClipboard` cede l'HTML "ricco" (che include `<table>`) al parser di default di ProseMirror, che non conosce i vincoli GFM.
- `prosemirror-tables` 1.8.5 è già installato ed espone `moveTableRow` / `moveTableColumn`.

### M1 — Incolla un foglio di calcolo (la demo)

| # | Task |
|---|------|
| 1.1 | **Raccogliere fixture reali degli appunti** (`tests/fixtures/clipboard/`): `text/html` + `text/plain` copiati da Excel (Mac e Windows), Google Sheets, Numbers, LibreOffice, una tabella di GitHub, una di Wikipedia, una pagina con `colspan`/`rowspan`. |
| 1.2 | Nuovo modulo `webview/src/editor/table/clipboardGrid.ts`: `clipboardToGrid(html, text) → Grid \| null`. HTML: `DOMParser` (mai inserito nel DOM), legge `<table>`, espande `colspan`/`rowspan` in celle vuote, riconosce l'header da `<thead>`/`<th>`. Fallback TSV dal testo: gestisce i campi tra virgolette con a capo (Excel li produce), richiede ≥ 2 righe e ≥ 2 colonne con numero di tab coerente. |
| 1.3 | Contenuto delle celle: si parsa l'HTML della cella con il `DOMParser` dello schema e si **appiattisce a inline** (grassetto, corsivo, codice, link restano; liste e paragrafi diventano `hardBreak`, immagini diventano testo alt). Stili di Excel ignorati. |
| 1.4 | `gridToTableNode(grid, schema)`: prima riga header (GFM la richiede: se la sorgente non ne ha una, la prima riga diventa header, come fa Notion). Righe corte riempite con celle vuote. |
| 1.5 | In `MarkdownClipboard.handlePaste`: se il caret è **fuori** da una tabella e gli appunti contengono una griglia → inserisce la tabella. Se il caret è **dentro** una tabella → si lascia lavorare `handlePaste` di `prosemirror-tables` (incolla sulla selezione di celle e allarga la tabella), dandogli però celle già normalizzate. |
| 1.6 | `⌘⇧V` incolla sempre come testo semplice (via d'uscita quando l'utente non vuole una tabella). |
| 1.7 | Copia nella direzione opposta: una `CellSelection` copiata in Excel / Sheets incolla come griglia (verificare che il `text/html` generato da ProseMirror basti). |

**Exit criteria M1:** ogni fixture produce una tabella che, serializzata e riparsata, è stabile (resta tabella e non diventa raw block); incolla = un passo di undo; 1.000 righe × 10 colonne si incollano in < 1 s.

### M2 — Editing visuale fatto bene

| # | Task |
|---|------|
| 2.1 | **Maniglie riga e colonna** al passaggio del mouse (`⋮⋮` a sinistra della riga, `⋯` sopra la colonna). Clic → seleziona riga/colonna e apre il menu; trascinamento → riordino con `moveTableRow` / `moveTableColumn`. Sostituisce l'attuale bubble toolbar. |
| 2.2 | Menu riga/colonna: inserisci sopra/sotto/sinistra/destra, sposta, duplica, svuota, elimina; per le colonne anche **allineamento sinistra / centro / destra** (scrive `:---`, `:---:`, `---:`). |
| 2.3 | **Barre `+`** sul bordo destro e inferiore: clic aggiunge una colonna/riga; trascinamento ne aggiunge più d'una. |
| 2.4 | Invariante header: un `appendTransaction` garantisce che la riga 0 sia sempre di `tableHeader` e le altre di `tableCell` (dopo riordini e incolla). |
| 2.5 | **Tastiera**: `Tab` / `⇧Tab` cella successiva/precedente (`Tab` sull'ultima cella aggiunge una riga); `Enter` cella sotto (aggiunge una riga se è l'ultima); `⇧Enter` a capo nella cella (`<br>`); `↑`/`↓` cambiano riga dal bordo della cella; `⇧` + frecce estende la `CellSelection`; `Esc` seleziona la tabella come blocco (BlockSelection); `⌘⇧↑/↓` con il caret in tabella sposta la riga. |
| 2.6 | **Più celle insieme**: con una `CellSelection`, `Backspace` svuota, digitare sostituisce il contenuto della prima cella, `⌘B` / `⌘I` / allineamento si applicano a tutte le celle selezionate. |
| 2.7 | Comando slash `/table` con griglia di scelta dimensione (come in Notion). |

**Exit criteria M2:** checklist manuale tabelle tutta verde in VS Code e Cursor, temi chiaro e scuro; riordino riga/colonna e allineamento coperti da test di round trip.

### M3 — Ridimensionamento colonne

Il GFM non ha larghezze di colonna. Il `columnResizing` di Tiptap le salva negli attributi `colwidth` delle celle: questo cambierebbe i nodi e farebbe riscrivere tutta la tabella (padding compreso) anche senza modifiche al testo. Quindi:

| # | Task |
|---|------|
| 3.1 | Ridimensionamento come **plugin solo-vista**: larghezze in plugin state, applicate con `<colgroup>`/decorazioni, mai negli attributi dei nodi. |
| 3.2 | Persistenza per file in `workspaceState` dell'host (chiave: URI file + indice tabella + hash dell'header), con il messaggio `saveViewState` di M0. Se la tabella cambia struttura le larghezze si azzerano. |
| 3.3 | Doppio clic sul bordo = adatta al contenuto. |

**Exit criteria M3:** ridimensionare una colonna non modifica il file (test e2e: il documento resta non modificato).

---

## 4. Outline e navigazione (priorità alta)

### Stato attuale

- Gli heading sono nodi top-level; `slugify` e lo scroll alle ancore esistono già in [env.ts](../../webview/src/lib/env.ts).
- Spostamento di blocchi (`moveBlocks`) e block selection esistono già; lo spostamento conserva i byte dei blocchi non toccati grazie alla source map.
- La vista Outline di VS Code **non funziona con i custom editor**, quindi in MDotion oggi non c'è alcuna struttura: è un vuoto reale, non solo una comodità.

### M4 — Pannello e navigazione

| # | Task |
|---|------|
| 4.1 | `webview/src/editor/outline/sections.ts`: `computeOutline(doc)` → heading top-level con posizione, livello, testo, slug e **fine della sezione** (fino al prossimo heading di livello ≤). Funzione pura, testata in unit. |
| 4.2 | Pannello laterale nella webview (destra, ~240 px), apribile dal Topbar e con scorciatoia. Su finestre strette diventa un overlay. Visibilità ricordata nelle page settings. |
| 4.3 | Clic → scroll morbido e caret all'inizio dell'heading. Evidenziazione della sezione corrente durante lo scroll. Albero dell'outline collassabile. |
| 4.4 | **Diagnostica**: titoli duplicati (ancore che collidono), salti di livello (H1 → H3), heading vuoti. Indicatore discreto accanto alla voce, con tooltip che spiega il problema. |
| 4.5 | `⌘⇧O` nella webview: elenco rapido degli heading filtrabile (rimpiazza "Go to Symbol" che nei custom editor non c'è). |

### M5 — Spostare sezioni e collassarle

| # | Task |
|---|------|
| 5.1 | **Trascinare una voce dell'outline** sposta l'intera sezione (heading + contenuto + sottosezioni) in una sola transazione. Indicatore di drop tra le voci; non si può rilasciare una sezione dentro se stessa. |
| 5.2 | Stesso spostamento da tastiera nell'outline (`⌥↑` / `⌥↓`) e dal menu del blocco heading ("Sposta sezione su/giù"). |
| 5.3 | Livelli invariati al rilascio in 0.2.0. "Promuovi / Retrocedi sezione" (sposta di un livello tutti gli heading della sezione) come P2 se avanza tempo. |
| 5.4 | **Folding nell'editor**: chevron sull'heading al passaggio del mouse; nasconde il contenuto della sezione con decorazioni (solo vista, il documento non cambia). Il caret dentro una sezione che si chiude torna all'heading; block selection e frecce saltano il contenuto nascosto. Stato salvato con `vscode.setState` per file. |
| 5.5 | Il folding si comanda anche dall'outline (collassa tutto / espandi tutto). |

**Exit criteria M5:** test di round trip — spostare una sezione produce un diff che contiene solo lo spostamento (byte dei blocchi conservati, solo i separatori ai bordi normalizzati); undo ripristina il file identico.

---

## 5. M6 — Hardening e release

| # | Task |
|---|------|
| 6.1 | ADR-009: stato della vista fuori dal documento (larghezze colonne, folding, outline). Aggiornare ADR-008 e `MarkdownCapabilities.ts` (allineamento colonne). |
| 6.2 | `docs/TESTING.md`: nuove voci della checklist manuale (incolla da Excel/Sheets/Numbers/web, maniglie tabella, tastiera in tabella, outline, spostamento sezioni, folding) in VS Code e Cursor. |
| 6.3 | Prestazioni su documento da 1.000+ righe con outline aperto e tabella da 1.000 righe (rischio R6 del risk register). |
| 6.4 | CHANGELOG, README (sezioni e screenshot nuovi), `package.json` 0.2.0 e keywords. |
| 6.5 | Sito ([MDotion/website](https://github.com/MDotion/website)): GIF della demo "paste a spreadsheet" in home, sezione funzionalità aggiornata. |

---

## 6. Rischi nuovi

| ID | Rischio | Mitigazione |
|----|---------|-------------|
| R8 | L'HTML degli appunti cambia tra Excel / Sheets / Numbers e tra versioni | Fixture reali per ogni sorgente, fallback TSV sempre disponibile |
| R9 | Una cella incollata genera Markdown che non è stabile e la tabella diventa raw block alla riapertura | Normalizzazione a contenuto inline prima dell'inserimento, test di stabilità su ogni fixture |
| R10 | Modificare una cella ripadda tutte le righe (diff rumorosi nei PR) | Comportamento noto del serializer; valutare in M2 se preservare il padding originale delle righe non toccate |
| R11 | Folding che nasconde testo a ricerca, selezione e copia | Comportamento definito in 5.4 e coperto dalla checklist |

---

## 7. Decisioni aperte

| # | Domanda | Raccomandazione |
|---|---------|-----------------|
| D1 | Persistere le larghezze delle colonne? | Sì, ma solo nello stato dell'IDE (`workspaceState`), mai nel `.md`. |
| D2 | Posizione dell'outline | Pannello a destra nella webview (l'Outline nativo non è disponibile per i custom editor). |
| D3 | Numero di versione | `0.2.0`, ancora `preview`. |
