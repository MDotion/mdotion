# Backlog — Gestione intelligente delle immagini

**Stato:** rimandata dopo la 0.2.0 (vedi [release-0.2.0.it.md](release-0.2.0.it.md)). Analisi fatta il 2026-10-27, da riverificare sul codice quando si riprende.
**Stima:** ~6–7 giorni.

## Stato attuale

- `ImageView` mostra immagini con percorso relativo (via `documentDirUri`), permette di sostituire il link e di modificare l'alt come didascalia.
- Nessun incolla o trascina di file, nessuna scrittura su disco. La CSP permette `img-src` da `webview.cspSource`, `https:` e `data:`.
- La webview non scrive il filesystem: salvare, rinominare o cercare immagini lo deve fare l'extension host.

## Nuovi messaggi del protocollo

| Direzione | Messaggio | Contenuto |
|---|---|---|
| webview → host | `saveImage` | `requestId`, nome suggerito, MIME, byte (`Uint8Array`, trasferibile da VS Code 1.57) |
| host → webview | `imageSaved` | `requestId`, `src` relativo da scrivere nel Markdown, oppure errore |
| webview → host | `resolveDroppedUris` | URI trascinati dall'Explorer → percorsi relativi (nessuna copia) |
| webview → host | `renameImage` | `src` attuale, nuovo nome → l'host rinomina e restituisce il nuovo `src` e i file aggiornati |

Validazione zod lato host: MIME ammessi (png, jpeg, gif, webp, svg), dimensione massima (20 MB, configurabile), nome file sanificato.

## Fase 1 — Incolla, trascina, salva

| # | Task |
|---|------|
| 1 | Impostazione `mdotion.images.folder` (default `assets`, relativa al documento). Variabili `${documentDir}`, `${workspaceFolder}`; un percorso che inizia con `/` è relativo alla workspace. |
| 2 | `src/images/ImageStore.ts` (host): risolve la cartella, la crea se manca, sceglie un nome univoco (mai sovrascrivere), scrive con `workspace.fs` (funziona anche in remoto), calcola il percorso relativo **POSIX dalla cartella del documento**. Rifiuta destinazioni fuori dalla workspace. Documento non salvato → messaggio "Salva il file prima di aggiungere immagini". |
| 3 | Webview: `handlePaste` per `image/*`, `handleDrop` per file dal Finder / Esplora risorse. Inserisce subito un nodo immagine con anteprima locale (aggiungere `blob:` a `img-src` nella CSP), poi imposta `src` alla risposta senza creare un passo di undo separato. |
| 4 | Trascinamento dall'Explorer di VS Code (con `⇧`): nessuna copia, solo riferimento relativo via `resolveDroppedUris`. |
| 5 | **Dare un nome**: dopo l'incolla il campo didascalia prende il focus con il nome proposto (`image-2026-10-27-143012`). Scrivendo "Architecture overview" l'alt diventa quello e il file viene rinominato in `architecture-overview.png`. |
| 6 | Nomi con spazi già esistenti: scritti come `<./assets/my file.png>`, già gestito da `resolveResourceUrl`. |

## Fase 2 — Ridimensionamento e rinomina

| # | Task |
|---|------|
| 1 | Attributo `width` sul nodo immagine. Senza `width` → `![alt](src)`; con `width` → `<img src="…" alt="…" width="480">` (GitHub e GitLab lo renderizzano). |
| 2 | Parsing inverso: un blocco HTML con un solo `<img>` e soli attributi `src` / `alt` / `title` / `width` / `height` diventa nodo immagine (deve superare `isStable`); altro HTML resta raw block. |
| 3 | Maniglie di ridimensionamento con proporzioni bloccate, "Ripristina dimensione originale". |
| 4 | Menu immagine: Rinomina file…, Mostra nell'Explorer, Apri immagine, Copia percorso, Sostituisci. |
| 5 | Rinomina (host): `WorkspaceEdit.renameFile` + aggiornamento dei riferimenti nello stesso `WorkspaceEdit` (documento corrente e altri `.md` della workspace; percorsi risolti per ciascun file; esclusi `node_modules` e `.git`), con conferma "Aggiornare N riferimenti in M file?". |

## Rischi

- Rinomina che aggiorna file sbagliati → risoluzione per URI assoluto, conferma con elenco, un solo `WorkspaceEdit` annullabile.
- Drag & drop di file nella webview diverso tra VS Code e Cursor → prova manuale in entrambi, incolla sempre disponibile.

## Decisioni aperte

- Larghezza delle immagini ridimensionate come `<img width>`: raccomandato sì, solo quando l'utente ridimensiona.
- Cartella di default `./assets/` accanto al documento, configurabile.
- Rinomina con aggiornamento degli altri file: raccomandato sì, con conferma.
