# Piano release 0.3.0 — Trova e sostituisci, scorciatoie, modifiche Git

**Base:** `0.2.2` (2026-10-28)
**Obiettivo:** gli strumenti di lavoro quotidiano che un editor di codice dà per scontati: cercare e sostituire nella pagina, conoscere e cambiare le scorciatoie, e vedere a colpo d'occhio cosa è cambiato in un `.md` rispetto all'ultimo commit, a livello di blocchi e non di righe.
**Demo di lancio:** modifico un documento, clicco **Changes** nella barra in alto → vedo i blocchi aggiunti in verde, quelli eliminati barrati in rosso, le parole cambiate dentro un paragrafo e le sezioni spostate.
**Fuori da questa release:** il folding delle sezioni, perché esiste già dalla 0.2.0 (chevron sugli heading, Fold all / Unfold all dall'outline). In questa release diventa solo più facile da scoprire, con scorciatoie e comandi (M2).

**Stato (2026-10-29):** M0–M5 completati sul branch `release-0.3.0`, non ancora committato. Unit test (189) ed e2e (10, con un repository Git temporaneo) verdi; la UI è stata provata nell'harness del browser, in tema chiaro e scuro. Restano:
- le verifiche che richiedono una persona: la checklist manuale in VS Code **e in Cursor** (soprattutto i conflitti di scorciatoie, 2.6) e su Windows o Linux;
- le voci P2 non fatte: ripristino di un singolo blocco (4.6), confronto con lo staging (4.7), diff cella per cella per tabelle di forma diversa (3.5);
- il sito (5.5).

**Cambi rispetto al piano:**
- Callout: `⌘⌥9`, non `⌘⇧X` (che in VS Code apre le estensioni e non ha un equivalente in Notion).
- Le scorciatoie rimappabili valgono solo con il focus fuori da sidebar, pannello e campi di input: VS Code non ha una context key per il focus dentro una webview, e senza questa condizione `⌘F` nell'Explorer aprirebbe la ricerca di MDotion.
- `Alt+C/W/R` (Windows / Linux) e `⌘⌥C/W/R` (Mac) per le opzioni della ricerca, come in VS Code.
- Un blocco modificato senza differenze di testo (per esempio un to-do spuntato) mostra la nota "Same text: formatting, links or checkboxes changed".
- I repository fuori dal workspace vanno aperti in VS Code (Source Control) prima che Changes li veda: l'estensione Git non li apre da sola.

---

## 1. Vincoli

Sono gli stessi della 0.2.0 (vedi [release-0.2.0.it.md](release-0.2.0.it.md) §1 e ADR 002–009).

| Vincolo | Conseguenza per la 0.3.0 |
|---|---|
| Il file resta Markdown standard | Ricerca, evidenziazioni e vista delle modifiche sono **stato della vista** (decorazioni), mai contenuto. |
| Round trip fedele (ADR-002) | Una sostituzione tocca solo i blocchi che contengono un'occorrenza; gli altri restano byte per byte. La vista delle modifiche non tocca mai il documento dell'editor. |
| La webview non scrive il filesystem e non esegue git | Il testo del file all'ultimo commit lo legge l'host, tramite l'API dell'estensione Git di VS Code, e lo passa con un messaggio validato con zod. |
| Un'azione = un passo di undo | *Replace* e *Replace all* valgono un solo `⌘Z` ciascuno. |
| Cursor = VS Code | Scorciatoie e vista delle modifiche vanno provate in entrambi: Cursor si prende molte combinazioni con `⌘`. |

---

## 2. Ordine e stima

| ID | Milestone | Dipende da | Stima |
|----|-----------|------------|-------|
| M0 | Fondamenta: registro delle scorciatoie, comandi IDE → webview generalizzati | — | 1 g |
| M1 | Trova e sostituisci | M0 | 3–4 g |
| M2 | Scorciatoie: mancanti, rimappabili, pannello di aiuto | M0, M1 | 2–3 g |
| M3 | Modifiche Git: baseline dall'host e diff a blocchi | — | 3 g |
| M4 | Modifiche Git: vista, navigazione, casi limite | M3 | 4 g |
| M5 | Hardening, documentazione, release | tutte | 2 g |

**Totale:** ~15–17 giorni di lavoro.

**Sequenza consigliata:** M0 → M3 → M4 (la demo e la parte più rischiosa, subito) → M1 → M2 → M5.
Il diff (M3–M4) e la ricerca (M1) toccano file diversi, quindi possono procedere in parallelo. M2 viene per ultima perché il pannello di aiuto deve elencare anche le scorciatoie di ricerca e del diff.

**Taglio di scope se serve uscire prima:** le voci P2 (ripristino di un singolo blocco, confronto con lo staging, diff cella per cella) passano alla 0.3.x senza compromettere la demo.

---

## 3. M0 — Fondamenta

### Stato attuale

- Le scorciatoie sono sparse: Tiptap (`⌘B`, `⌘⌥1`…), [NotionKeymap.ts](../../webview/src/editor/NotionKeymap.ts), [TableBehaviour.ts](../../webview/src/editor/table/TableBehaviour.ts), l'handler `keydown` di [App.tsx](../../webview/src/App.tsx) e i `keybindings` di `package.json`. I testi dei tooltip sono costanti scritte a mano in [Topbar.tsx](../../webview/src/components/Topbar.tsx).
- Il percorso "comando IDE → webview" esiste già (`toggleOutline`, `goToHeading`: messaggio `command` con un `z.enum`), ma ogni comando nuovo va aggiunto in quattro punti.
- `enableFindWidget: true` in [extension.ts](../../src/extension.ts): oggi `⌘F` apre la ricerca nativa della webview, che trova il testo visibile ma non sostituisce, non vede le sezioni collassate e non sa niente dei blocchi.

| # | Task |
|---|------|
| 0.1 | `webview/src/lib/shortcuts.ts`: **registro unico** delle scorciatoie (id, etichetta, tasti Mac / Windows-Linux, categoria, `ide: true` se è un comando rimappabile). Lo usano i tooltip, il pannello di aiuto e un test che lo confronta con i `keybindings` di `package.json`. |
| 0.2 | Comando generico `mdotion.<id>` → messaggio `command` → `emitUiEvent`. Aggiungere un comando diventa: una voce nel registro, una in `package.json`, un handler. |
| 0.3 | `enableFindWidget: false`: la ricerca nativa e quella di MDotion non devono convivere. |

---

## 4. M1 — Trova e sostituisci

### Come si presenta

- **Icona lente** nella barra in alto (accanto a Outline) e `⌘F` / `Ctrl+F`: si apre una barra di ricerca flottante in alto a destra, sotto la barra in alto, come in VS Code. Se c'è del testo selezionato, diventa la query.
- `⌘⌥F` / `Ctrl+H` (gli stessi di VS Code) aprono la barra già con la riga **Replace**. Anche il chevron a sinistra della barra mostra e nasconde la riga Replace.
- Opzioni come in VS Code: **Aa** maiuscole/minuscole, **ab** parola intera, **.\*** espressione regolare. Contatore "3 of 12", ↑/↓, `Enter` / `⇧Enter`, `Esc` chiude e lascia il caret sull'occorrenza corrente.

### Task

| # | Task |
|---|------|
| 1.1 | Motore: **`prosemirror-search`** (pacchetto ufficiale di ProseMirror, MIT). Dà `SearchQuery` (maiuscole, parola intera, regex, sostituzione con `$1`), le decorazioni delle occorrenze e i comandi `findNext` / `replaceNext` / `replaceAll`. Scriverlo da zero non porta niente. Aggiornare `THIRD_PARTY_NOTICES.md`. |
| 1.2 | Estensione `webview/src/editor/search/Search.ts` che lo configura, più due stili: occorrenza (giallo tenue) e occorrenza corrente (arancio), in chiaro e scuro. |
| 1.3 | Componente `FindBar.tsx`: input, opzioni, contatore, riga Replace (**Replace**, **Replace all**). La query si aggiorna mentre si scrive (debounce di ~100 ms su documenti grandi). Regex non valida → bordo rosso e contatore "Invalid regex", senza errori. |
| 1.4 | **Sezioni collassate:** le occorrenze nascoste contano nel totale; quando si arriva su una di esse, `revealPosition` apre la sezione. *Replace all* sostituisce anche nel contenuto nascosto (come VS Code). |
| 1.5 | **Dove si cerca:** paragrafi, heading, liste, to-do, quote, callout, celle di tabella, blocchi di codice. Un'occorrenza non attraversa due blocchi né un a capo (`<br>`), ma attraversa la formattazione (`**foo**bar` trova `foobar`). |
| 1.6 | **Dove non si cerca in 0.3.0:** raw block e HTML inline (sono atomi: la sorgente non è testo dell'editor) e proprietà del front matter. Il contatore lo segnala con una nota ("2 more in raw blocks") se ci sono occorrenze lì. Vedi D2. |
| 1.7 | Sostituzione: la nuova parola prende la formattazione del primo carattere sostituito. *Replace all* è una sola transazione, quindi un solo `⌘Z`. |
| 1.8 | Test: unit su query e sostituzioni (maiuscole, parola intera, regex con gruppi, attraversamento di marks, celle), round trip (sostituire in un blocco lascia identici gli altri), e2e (`⌘F` nella webview apre la barra, non la ricerca nativa). |

**Exit criteria M1:** 1.000 occorrenze in un documento da 5.000 righe: evidenziazione < 100 ms, *Replace all* < 300 ms e un solo passo di undo; il diff Git di un *Replace all* contiene solo le righe con un'occorrenza.

---

## 5. M2 — Scorciatoie

### Stato attuale

Molte scorciatoie esistono già ma non sono documentate da nessuna parte nell'editor:

| Esistenti | |
|---|---|
| Testo | `⌘B`, `⌘I`, `⌘E` codice inline, `⌘⇧S` barrato, `⌘K` link |
| Blocchi | `⌘⌥0` testo, `⌘⌥1–6` heading, `⌘⇧7` lista numerata, `⌘⇧8` puntata, `⌘⇧9` to-do, `⌘⇧B` quote, `⌘⌥C` codice |
| Azioni | `⌘D` duplica, `⌘⇧↑/↓` sposta blocco, `⌥↑/↓` sposta sezione, `⌘Enter` spunta to-do, `Esc` seleziona blocco, `⌘A` due volte |
| Tabelle | `Tab`, `⇧Tab`, `Enter`, `⇧Enter`, `⌘⇧↑/↓` |
| Editor | `⌘⌥M`, `⌘⇧⌥C`, `⌘⌥O`, `⌘⇧O`, `⌘⇧V` |

### Task

| # | Task |
|---|------|
| 2.1 | **Scorciatoie mancanti**, allineate a Notion dove non rompono quelle di Markdown: `⌘⌥4` to-do, `⌘⌥5` lista puntata, `⌘⌥6` numerata, `⌘⌥8` blocco di codice (vedi D3 per gli heading H4–H6); `⌘⇧X` callout; `⌘⌥[` / `⌘⌥]` chiudi / apri la sezione corrente (come il folding di VS Code); `⌘⌥T` chiudi / apri tutte le sezioni (come in Notion). |
| 2.2 | **Comandi rimappabili:** le azioni dell'editor (non la formattazione del testo) diventano comandi veri, nel Command Palette e in **Keyboard Shortcuts**: Find, Replace, Find Next / Previous, Show Changes, Next / Previous Change, Fold / Unfold Section, Fold / Unfold All, Show Keyboard Shortcuts (più Toggle Outline e Go to Heading, già esistenti). Il binding di default vive in `package.json` con `when: activeCustomEditorId == mdotion.markdownEditor`; la webview **lascia passare** questi tasti all'IDE, che risponde con il messaggio `command`. Così, se l'utente li rimappa, il vecchio tasto smette davvero di funzionare. |
| 2.3 | Formattazione e blocchi (`⌘B`, `⌘⌥1`…) restano gestiti nella webview: passare dall'IDE aggiungerebbe un giro di messaggi a ogni tasto, e rimapparli non serve quasi a nessuno. Il pannello lo dice. |
| 2.4 | **Pannello di aiuto** `⌘⌥K` / `Ctrl+Alt+K` (era `⌘/`, vedi D4), anche dal menu `•••` e da **MDotion: Show Keyboard Shortcuts**. Dialog centrato con campo di ricerca e categorie (Testo, Blocchi, Tabelle, Navigazione, Ricerca, Modifiche, Editor), tasti per la piattaforma corrente. Le voci rimappabili hanno l'etichetta "Can be changed" e il pulsante **Customize…**, che apre Keyboard Shortcuts filtrato su `mdotion` (`workbench.action.openGlobalKeybindings`). |
| 2.5 | I tooltip della barra in alto e dei menu leggono i tasti dal registro, non più da costanti scritte a mano. |
| 2.6 | Verificare ogni scorciatoia in Cursor (che usa `⌘K`, `⌘L`, `⌘I`, `⌘E`…): quelle gestite dalla webview devono fermarsi lì, quelle rimappabili devono arrivare all'IDE. |

**Limite noto:** VS Code non espone ai plugin le scorciatoie personalizzate dall'utente, quindi il pannello mostra quelle di default. Il pulsante **Customize…** porta alla verità.

**Exit criteria M2:** test che confronta registro e `package.json`; checklist manuale delle scorciatoie verde in VS Code e Cursor, su Mac e su Windows o Linux.

---

## 6. M3 — Modifiche Git: dati e algoritmo

### Idea

Il diff di Git su un `.md` è per righe: un paragrafo riscritto in una riga lunga, una tabella ripaddata o una sezione spostata diventano muri rossi e verdi illeggibili. MDotion conosce già i blocchi (source map, ADR-002), quindi può mostrare il diff **per blocchi**, con le parole cambiate dentro ciascun blocco.

| # | Task |
|---|------|
| 3.1 | **Baseline dall'host** (`src/git/baseline.ts`): API dell'estensione Git integrata (`vscode.git`, `getAPI(1)`), `repository.show('HEAD', path)`. Niente `child_process`: l'API funziona anche in remoto (SSH, WSL, container) e in Cursor. Nessuna `extensionDependencies`: se l'estensione manca o è disattivata, la funzione si nasconde. |
| 3.2 | Messaggi: webview → host `requestBaseline`; host → webview `baseline` con `{ status: 'ok', text, ref, shortSha, committedAt }` oppure `{ status: 'untracked' \| 'noRepo' \| 'unavailable' }`. L'host la rimanda da solo quando cambia `HEAD` (`repository.state.onDidChange`: commit, checkout, pull). |
| 3.3 | **Diff a blocchi** (`src/markdown/blockDiff.ts`, funzione pura, condivisa e testata in unit): si parsano baseline e testo corrente con `MarkdownAdapter`; i segmenti top-level si allineano con Myers sull'hash del `raw`. Dentro ogni tratto non allineato: un blocco tolto e uno aggiunto dello stesso tipo con similarità > 0,5 diventano **modificati**; un blocco identico che compare altrove diventa **spostato**; il resto è **aggiunto** o **eliminato**. |
| 3.4 | **Rumore di formattazione:** se il `raw` è diverso ma i nodi sono uguali (`node.eq`, ad es. tabella ripaddata, `*` → `-` nelle liste), il blocco è "solo formattazione" e non conta come modifica. Si vede solo attivando "Show formatting changes". |
| 3.5 | **Dentro un blocco modificato:** testo → diff per parole (`diffWordsWithSpace` di `jsdiff`, BSD); codice e raw block → diff per righe; tabelle con la stessa forma → celle cambiate evidenziate, altrimenti tabella eliminata + aggiunta (cella per cella con forme diverse: P2). Front matter → proprietà aggiunte, tolte o cambiate. |
| 3.6 | Si confronta il **testo corrente dell'editor**, comprese le modifiche non salvate: è quello che l'utente ha davanti. |

**Exit criteria M3:** su un documento da 1.000 blocchi, il diff si calcola in < 100 ms; fixture di test per ogni tipo di modifica (paragrafo riscritto, sezione spostata dall'outline, tabella ripaddata, righe aggiunte in una tabella, blocco di codice modificato, front matter).

---

## 7. M4 — Modifiche Git: vista

### Come si presenta

- Pulsante **Changes** nella barra in alto, con un pallino e il numero di blocchi cambiati ("± 4") quando ce ne sono. È nascosto se il file non è in un repository Git.
- Clic (o **MDotion: Show Changes**) → la pagina passa in **modalità revisione**, in sola lettura. In alto compare una barra: *"Changes since last commit · a1b2c3d · 2 hours ago — 3 added · 1 removed · 2 modified · 1 moved"*, con ↑/↓ per andare alla modifica precedente o successiva e **Done** (`Esc`) per tornare all'editing.
- Nella pagina:
  - **Aggiunto:** barra verde a sinistra, sfondo verde tenue.
  - **Eliminato:** blocco fantasma barrato, rosso tenue, nella posizione in cui era.
  - **Modificato:** barra gialla; dentro, le parole nuove in verde e quelle tolte barrate in rosso.
  - **Spostato:** barra blu con l'etichetta "Moved from ↑" / "Moved here ↓", cliccabile per saltare all'altra posizione.
- **Show only changes:** i tratti invariati si riducono a una riga "… 12 unchanged blocks", che si apre con un clic (come GitHub).
- Link **Open text diff**: apre il diff nativo di VS Code a righe (`git.openChange`), per chi lo vuole.

### Task

| # | Task |
|---|------|
| 4.1 | La vista è una **seconda istanza Tiptap in sola lettura** (stesse estensioni di rendering, senza quelle interattive) con un documento unito: blocchi invariati, aggiunti, modificati ed eliminati in ordine, colorati con decorazioni. L'editor vero resta montato e intatto sotto: entrare e uscire dalla revisione non lo tocca, e lo scroll torna dov'era. |
| 4.2 | `ChangesBar.tsx` (riepilogo, navigazione, opzioni) e pulsante nella barra in alto con il contatore, calcolato in background (debounce ~500 ms dopo l'ultima modifica). |
| 4.3 | Clic su un blocco nella revisione → torna all'editing con il caret su quel blocco (se non è un blocco eliminato). |
| 4.4 | Se il file cambia mentre la revisione è aperta (un'altra vista, git), il diff si aggiorna da solo. |
| 4.5 | **Casi limite:** file non tracciato → "New file", tutto aggiunto; file appena creato e non salvato → pulsante nascosto; nessun repository / Git disattivato / file system virtuale → pulsante nascosto; file eliminato dal repository o rinominato → baseline da `HEAD` col nome vecchio se Git ne traccia la rinomina, altrimenti "New file"; baseline che non si parsa → diff solo testuale con il link al diff nativo. |
| 4.6 | **P2 — Ripristina blocco:** pulsante su un blocco modificato o eliminato che rimette nell'editor la versione dell'ultimo commit (una transazione, un `⌘Z`). |
| 4.7 | **P2 — Base del confronto:** selettore "Last commit" / "Staged" (`repository.show('', path)` per l'indice). |
| 4.8 | Test: unit sul documento unito; e2e con un repository Git temporaneo (commit, modifica, apertura della revisione, nessuna modifica al file uscendo). |

**Exit criteria M4:** entrare e uscire dalla revisione non marca mai il file come modificato; la demo funziona in VS Code e Cursor, in tema chiaro e scuro, anche in un workspace remoto.

---

## 8. M5 — Hardening e release

| # | Task |
|---|------|
| 5.1 | ADR-010: diff a blocchi contro la baseline letta dall'API Git dell'host, vista separata in sola lettura, nessuna modifica al documento. |
| 5.2 | `docs/TESTING.md`: voci nuove della checklist manuale (trova e sostituisci con sezioni collassate e tabelle, ogni scorciatoia nuova, comandi rimappati, revisione delle modifiche con ogni tipo di blocco, file non tracciato, workspace remoto) in VS Code e Cursor. |
| 5.3 | Prestazioni su un documento da 5.000 righe: ricerca, *Replace all*, contatore delle modifiche e apertura della revisione. |
| 5.4 | CHANGELOG, README (sezioni e screenshot nuovi), `package.json` 0.3.0, keywords (`find and replace`, `git diff`, `keyboard shortcuts`). |
| 5.5 | Sito ([MDotion/website](https://github.com/MDotion/website)): GIF della revisione delle modifiche in home, sezione funzionalità aggiornata. |

---

## 9. Rischi nuovi

| ID | Rischio | Mitigazione |
|----|---------|-------------|
| R12 | L'API Git non c'è o cambia (Git disattivato, Cursor, file system virtuali) | Uso solo di `getAPI(1)` e `show()`, nessuna dipendenza dichiarata, funzione nascosta se manca; prova in Cursor e in un workspace remoto |
| R13 | Diff rumoroso per differenze solo di formattazione (padding delle tabelle, R10) | Confronto sui nodi oltre che sul `raw` (3.4) |
| R14 | Abbinamento sbagliato tra blocchi tolti e aggiunti (un paragrafo riscritto mostrato come "modificato" quando l'utente lo vede come nuovo) | Soglia di similarità tarata sulle fixture; in dubbio, aggiunto + eliminato |
| R15 | Conflitti di scorciatoie con VS Code e soprattutto con Cursor | Registro unico, checklist per IDE, comandi di vista rimappabili |
| R16 | Le occorrenze in raw block e front matter sfuggono alla ricerca | Nota nel contatore (1.6), estensione in 0.3.x se serve (D2) |

---

## 10. Decisioni aperte

| # | Domanda | Raccomandazione |
|---|---------|-----------------|
| D1 | La revisione delle modifiche si può modificare? | No in 0.3.0: sola lettura, `Esc` torna all'editing. In seguito, eventualmente, marcatori delle modifiche nel margine durante l'editing (come la dirty diff di VS Code). |
| D2 | Cercare dentro raw block e front matter? | Non in 0.3.0; la nota nel contatore dice quante occorrenze ci sono lì. |
| D3 | `⌘⌥4/5/6` come Notion (to-do, puntata, numerata) o come Tiptap (H4–H6)? | Come Notion: H4–H6 restano disponibili da `/` e scrivendo `####`. |
| D4 | Scorciatoia del pannello di aiuto | **Decisa: `⌘⌥K`.** `⌘/` non funziona su tastiera italiana o tedesca: `/` è `⇧7`, cioè la lista numerata. Per lo stesso motivo il folding della sezione è `⌘⌥↑` / `⌘⌥↓` e non `⌘⌥[` / `⌘⌥]`, che VS Code non riesce nemmeno ad assegnare su layout italiano. |
| D5 | Base del confronto | L'ultimo commit (`HEAD`), compreso tutto quello che non è ancora committato (anche le modifiche non salvate). Lo staging è P2. |
| D6 | Numero di versione | `0.3.0`, ancora `preview`. |
