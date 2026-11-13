# MDotion Cloud: web app, desktop e organizzazione intelligente

**Stato:** analisi / proposta, ottobre 2026
**Ambito:** un nuovo prodotto accanto all'estensione VS Code / Cursor
**Base di partenza:** estensione `0.x` (editor Notion-like su Tiptap, round-trip byte per byte, sync versionata)

---

## 1. Sintesi

Le AI (Claude Desktop, claude.ai, ChatGPT, Claude Code, Cursor) producono ogni giorno piani, specifiche, report e appunti in Markdown. Oggi questi file finiscono sparsi: nelle conversazioni, in Download, in cartelle di progetto diverse, spesso in tre o quattro versioni quasi identiche (`plan.md`, `plan-v2.md`, `plan-final.md`).

**MDotion Cloud** è il posto unico dove questi file arrivano, vengono organizzati e si possono leggere e modificare con l'editor di MDotion. Ha tre pilastri:

1. **Ingestione senza attrito.** Le AI salvano direttamente in MDotion tramite un **server MCP**. Sul desktop, le cartelle osservate importano i file già presenti sul disco.
2. **Organizzazione intelligente.** Classificazione automatica, **riconoscimento delle versioni** dello stesso documento, divisione e unione delle note, ricerca semantica.
3. **Ovunque, sempre Markdown.** Web app e app desktop sincronizzate via cloud; i file restano Markdown puro, esportabile in ogni momento.

L'estensione VS Code resta gratuita e completamente locale. MDotion Cloud è il prodotto a pagamento.

---

## 2. Il problema

| Situazione oggi | Conseguenza |
|---|---|
| Claude Desktop / claude.ai generano file come artifact o download | Vanno salvati a mano, uno per uno |
| Ogni AI salva in un posto diverso | Nessuna vista unica, si perdono documenti |
| Le AI rigenerano lo stesso documento più volte | Copie quasi identiche, non è chiaro quale sia l'ultima né cosa sia cambiato |
| I file `.md` si leggono male fuori dall'IDE | Sintassi grezza, nessuna struttura visiva |
| Nessun collegamento tra documenti dello stesso progetto | Il contesto va ricostruito ogni volta, anche per l'AI |

**Utente tipo:** chi lavora tutti i giorni con più assistenti AI (sviluppatori, product manager, founder, consulenti) e accumula decine di documenti generati alla settimana.

### Casi d'uso principali

1. *"Claude, salva questo piano in MDotion nel progetto Website."* → il documento compare nel progetto giusto, già formattato.
2. Claude rigenera il piano dopo una discussione → MDotion lo riconosce come **versione 3 dello stesso piano**, mostra cosa è cambiato e tiene la cronologia.
3. Scarico cinque `.md` da ChatGPT → l'app desktop li trova in Download, li mette nella **Inbox** con progetto e tag già proposti.
4. *"Dov'era la decisione sull'autenticazione?"* → la ricerca semantica la trova anche senza le parole esatte.
5. Un report lungo di 40 sezioni → lo divido in note collegate, una per argomento.
6. In una nuova conversazione: *"Leggi le specifiche del progetto X da MDotion e continua da lì."* → l'AI legge via MCP.

---

## 3. Cosa si riusa dal codice attuale

L'editor è già quasi indipendente da VS Code. È il vantaggio principale di questo progetto.

| Componente | Dove | Riuso |
|---|---|---|
| Parser / serializer Markdown, source map, front matter | [src/markdown/](../../src/markdown/) | Totale: TypeScript puro, nessuna dipendenza da VS Code |
| Editor React + Tiptap (slash menu, blocchi, callout, tabelle, codice) | [webview/src/](../../webview/src/) | Totale, salvo il ponte con l'host |
| Ponte con l'host | [webview/src/vscodeApi.ts](../../webview/src/vscodeApi.ts) | **Da astrarre**: è l'unico punto legato a VS Code |
| Protocollo dei messaggi (zod) | [src/shared/messages.ts](../../src/shared/messages.ts) | Base dell'interfaccia host (vedi §6.2) |
| Gestione versioni e conflitti | [ADR 004](../adr/004-external-edits-and-conflicts.md), [ADR 005](../adr/005-document-update-granularity.md), [textDiff.ts](../../src/shared/textDiff.ts) | Stessa semantica `baseVersion` → `conflict` per la sync cloud |
| Round-trip byte per byte dei blocchi non toccati | [ADR 002](../adr/002-front-matter-and-opaque-blocks.md), [ADR 008](../adr/008-mvp-capability-guarantee.md) | Garantisce che il cloud non "riscriva" i file |

Quindi **non serve un nuovo editor**. Il lavoro nuovo è: la shell (web e desktop), il backend, l'ingestione, l'organizzazione.

---

## 4. Ingestione: come entrano i file

È la parte che decide il successo del prodotto. Ordine di priorità:

### 4.1 Server MCP di MDotion (priorità massima)

Un server MCP **remoto** (`https://mcp.mdotion.app`, autenticazione OAuth) funziona con tutti i client che supportano i connettori MCP: Claude Desktop, claude.ai, Claude Code, Cursor, ChatGPT. Per chi preferisce, si può distribuire anche una versione locale (stdio) che parla con la stessa API.

**Strumenti proposti:**

| Strumento | Scopo | Parametri principali |
|---|---|---|
| `save_document` | Crea un documento | `title`, `markdown`, `project?`, `tags?`, `kind?`, `supersedes?` |
| `update_document` | Nuova versione di un documento esistente | `document_id`, `markdown`, `change_summary?` |
| `search_documents` | Ricerca testuale + semantica | `query`, `project?`, `kind?`, `limit?` |
| `read_document` | Legge un documento (ultima versione o una specifica) | `document_id`, `version?` |
| `list_projects` | Elenca progetti e documenti recenti | `project?` |
| `append_to_document` | Aggiunge una sezione (diario, log decisioni) | `document_id`, `markdown`, `heading?` |

**Dettagli importanti:**

- La descrizione degli strumenti deve **invitare l'AI a cercare prima di salvare**: *"Prima di creare un documento, cerca se esiste già una versione precedente e usa `update_document`"*. È il segnale più affidabile per il riconoscimento delle versioni (§5.2).
- Ogni salvataggio registra la **provenienza**: client (`claude-desktop`, `chatgpt`, …), timestamp, eventuale identificativo di conversazione se il client lo fornisce.
- Permessi: l'utente sceglie a livello di connettore se l'AI può solo scrivere, anche leggere, o anche modificare i documenti esistenti.
- Limiti di dimensione allineati a `MAX_DOCUMENT_CHARS` del protocollo attuale.

### 4.2 Cartelle osservate (desktop)

- L'utente aggiunge cartelle (Download, cartelle di progetto, cartelle di output delle AI).
- Un watcher (`chokidar` in Electron) rileva i nuovi `.md` / `.markdown` e i file modificati.
- Due modalità per cartella:
  - **Importa**: il file viene copiato nel cloud e finisce nella Inbox; l'originale resta dov'è.
  - **Sincronizza**: la cartella diventa un progetto; le modifiche vanno in entrambe le direzioni (fase successiva, vedi §6.5).
- Filtri: ignora `node_modules`, `.git`, file più vecchi di N giorni alla prima scansione, pattern personalizzati.

### 4.3 Importazione manuale

- Trascinamento di file e cartelle (web e desktop).
- Incolla dagli appunti: il testo Markdown incollato crea un documento (riusa [MarkdownClipboard.ts](../../webview/src/editor/MarkdownClipboard.ts)).
- Importazione di archivi `.zip` e di vault Obsidian.

### 4.4 Estensione del browser (fase successiva)

Un pulsante "Salva in MDotion" su claude.ai e ChatGPT, accanto agli artifact e ai blocchi di codice Markdown. È utile per chi non configura MCP, ma è fragile perché dipende dal DOM di terze parti: si fa dopo.

---

## 5. Organizzazione intelligente

### 5.1 Inbox e classificazione automatica

Ogni documento che entra senza una destinazione esplicita passa dalla **Inbox**. Per ciascuno, un modello leggero (Claude Haiku) propone:

- **progetto** (tra quelli esistenti, o uno nuovo);
- **tipo**: piano, specifica, appunti, report, ricerca, prompt, checklist, log decisioni, altro;
- **titolo** pulito (dall'H1, o generato se manca);
- **tag** (massimo 5, riusando quelli esistenti);
- **riepilogo** di una o due frasi.

L'utente accetta con un clic, modifica o rifiuta. Le correzioni diventano esempi per le classificazioni successive dello stesso utente (few-shot con le ultime correzioni nel prompt; niente fine-tuning).

Con un'alta confidenza e un progetto esistente, l'utente può attivare lo **smistamento automatico**: il documento va direttamente al suo posto e la Inbox mostra solo un avviso annullabile.

I metadati proposti vengono scritti anche nel **front matter** del file (`project`, `kind`, `tags`), così restano nel Markdown e sopravvivono all'esportazione. L'editor li mostra già come proprietà della pagina ([Properties.tsx](../../webview/src/components/Properties.tsx)).

### 5.2 Riconoscimento delle versioni (funzione chiave)

**Obiettivo:** quando arriva un documento che è una nuova stesura di uno esistente, non crearne uno nuovo. Va aggiunto come **nuova versione** dello stesso documento, mostrando cosa è cambiato.

#### Modello

```
Documento "Piano sito web"
 ├─ v1  2026-10-20  claude-desktop   "Prima stesura"
 ├─ v2  2026-10-22  claude-desktop   "Aggiunta sezione SEO, rimossa la fase 4"
 └─ v3  2026-10-27  chatgpt          "Riscritta la roadmap"   ← versione corrente
```

Un documento è una **catena di versioni**. Le modifiche fatte a mano nell'editor non creano versioni a ogni tasto: si raggruppano in una versione per sessione di modifica (per esempio dopo 10 minuti di inattività, o alla chiusura del documento).

#### Segnali, dal più forte al più debole

| Segnale | Come si calcola | Peso |
|---|---|---|
| **Dichiarazione esplicita** | L'AI usa `update_document` o `supersedes` via MCP | Decisivo: nessuna euristica |
| **Stesso percorso** | Stesso file osservato che cambia sul disco | Decisivo |
| **Nome del file normalizzato** | Si tolgono suffissi come `v2`, `final`, `new`, `copy`, `(1)`, date, numeri finali; poi distanza di edit | Alto |
| **Titolo (H1) simile** | Similarità normalizzata del titolo | Alto |
| **Struttura simile** | Sovrapposizione dei titoli di sezione (H2/H3), Jaccard | Medio |
| **Contenuto simile** | MinHash su shingle di parole (veloce) + similarità degli embeddings (semantica) | Medio-alto |
| **Stesso progetto** | Stesso progetto proposto o assegnato | Medio |
| **Vicinanza nel tempo** | Generato entro pochi giorni dal precedente | Basso (spareggio) |
| **Stessa provenienza** | Stesso client, stessa conversazione se nota | Basso-medio |

#### Decisione

Si calcola un punteggio combinato contro i candidati (documenti dello stesso utente, filtrati prima con la ricerca vettoriale per non confrontare tutto con tutto):

- **≥ 0,85** → nuova versione automatica, con un avviso annullabile ("Aggiunto come v3 di *Piano sito web*. Annulla").
- **0,60 – 0,85** → proposta nella Inbox: "Sembra una nuova versione di *Piano sito web*. Unisci / Tieni separato".
- **< 0,60** → documento nuovo.

Le soglie vanno tarate su dati reali (vedi §10, metriche). Ogni scelta dell'utente ("tieni separato") viene ricordata per non riproporre la stessa coppia.

#### Cosa vede l'utente

- **Cronologia delle versioni** nel pannello laterale, con provenienza e data.
- **Diff a livello di blocco** tra due versioni qualsiasi: blocchi aggiunti, rimossi, modificati, spostati. Il diff per blocchi è più leggibile del diff per righe e si appoggia alla source map che l'adapter ha già.
- **Riepilogo delle modifiche** generato dall'AI ("Aggiunta la sezione SEO, la fase 4 è stata unita alla 3, cambiate le date").
- **Ripristina questa versione** (crea una nuova versione uguale a quella vecchia; la cronologia non si riscrive mai).
- **Separa da qui**: se una versione era in realtà un documento diverso, la catena si divide.
- **Unisci catene**: due documenti riconosciuti tardi come lo stesso.

#### Casi difficili

- **Documenti a template** (per esempio report settimanali con la stessa struttura): hanno struttura simile ma contenuto diverso, quindi non sono versioni. Per questo serve anche la similarità del contenuto, e i documenti di tipo `report` / `log` hanno soglie più alte.
- **Riscritture profonde**: stesso titolo, contenuto molto diverso. Qui decidono il titolo, il nome del file e la provenienza, e il caso finisce nella fascia "proposta".
- **Rami**: l'AI genera due alternative a partire dalla v2. Per l'MVP si tratta come catena lineare con l'ultima versione come corrente. I rami veri si valutano dopo, solo se emergono dall'uso.

### 5.3 Divisione e unione

- **Dividi per titoli**: un documento si spezza in note, una per H1 o H2 (a scelta). Il documento originale diventa un indice con i collegamenti alle note figlie, oppure si archivia.
- **Divisione suggerita**: per documenti molto lunghi o con argomenti eterogenei, l'AI propone i punti di taglio; l'utente vede l'anteprima prima di confermare.
- **Estrai selezione**: i blocchi selezionati (la selezione multipla esiste già, [BlockSelection.ts](../../webview/src/editor/BlockSelection.ts)) diventano una nuova nota collegata.
- **Unisci**: più note in un unico documento, nell'ordine scelto, con i titoli adattati.

Divisioni e unioni sono operazioni registrate: si possono annullare.

### 5.4 Ricerca

- **Testuale**: full-text di Postgres (`tsvector`), con configurazioni per italiano e inglese.
- **Semantica**: embeddings per sezione (non per documento intero, così il risultato punta al punto giusto), salvati con `pgvector`.
- **Ibrida**: si combinano i due punteggi; i filtri sono progetto, tipo, tag, provenienza e data.
- **Domande sui documenti** (fase successiva): "cosa abbiamo deciso sul pricing?" → risposta con le citazioni dei documenti. La stessa funzione è esposta via MCP all'AI.

### 5.5 Collegamenti

- Link tra documenti con `[[titolo]]` o link Markdown normali, risolti dentro l'app.
- Pannello "documenti correlati" (vicini per embeddings, stesso progetto).

---

## 6. Architettura

### 6.1 Monorepo

```
packages/
  core/          ← src/markdown attuale: parser, serializer, source map, front matter, textDiff
  editor/        ← webview attuale, con EditorHost al posto di vscodeApi
  protocol/      ← src/shared/messages.ts + tipi condivisi
apps/
  vscode/        ← l'estensione di oggi (comportamento identico)
  web/           ← web app (Vite + React), host = API cloud
  desktop/       ← Electron: web app + accesso al filesystem + watcher + cache offline
services/
  api/           ← API, sync, job AI (oppure funzioni Supabase)
  mcp/           ← server MCP remoto
```

Strumenti: workspace npm (o pnpm), un unico TypeScript config di base, test esistenti spostati nei rispettivi pacchetti. **Criterio di uscita della migrazione:** l'estensione supera tutti i test unit ed e2e attuali senza modifiche di comportamento.

### 6.2 Interfaccia host dell'editor

Oggi l'editor parla con VS Code tramite i messaggi di [messages.ts](../../src/shared/messages.ts). La stessa semantica diventa un'interfaccia che ogni shell implementa:

```ts
interface EditorHost {
  /** Equivalente di `init`: testo, versione, nome, base per le immagini relative. */
  load(): Promise<{ text: string; version: number; fileName: string; assetBaseUrl: string }>;
  /** Equivalente di `edit`: testo completo + versione su cui si basa. */
  applyEdit(text: string, baseVersion: number): void;
  /** Equivalenti di `update` e `conflict`. */
  onExternalUpdate(cb: (text: string, version: number) => void): () => void;
  onConflict(cb: (rejectedText: string) => void): () => void;
  openLink(href: string): void;
  getSettings(): PageSettings;
  saveSettings(settings: PageSettings): void;
  getTheme(): Theme;
  setTheme(theme: Theme): void;
}
```

- **VS Code**: implementazione sopra `postMessage` (quello che c'è oggi).
- **Web**: implementazione sopra l'API cloud + canale realtime.
- **Desktop**: implementazione sopra lo store locale (cache) che si sincronizza con il cloud.

Le funzioni specifiche di VS Code (`switchToSource`, `copyMarkdown` con comando IDE) diventano capacità opzionali dell'host; nel web e nel desktop la vista sorgente è un pannello interno.

### 6.3 Shell desktop: Electron

| | Electron | Tauri |
|---|---|---|
| Motore di rendering | Chromium (lo stesso di VS Code) | WebKit su macOS, WebView2 su Windows |
| Comportamento dell'editor | Identico a oggi | Possibili differenze su `contenteditable`, selezione, IME |
| Linguaggio del backend | Node / TypeScript | Rust |
| Dimensione dell'app | ~100 MB | ~10 MB |
| Watcher, file system, auto-update | Maturi (`chokidar`, `electron-updater`) | Maturi, ma in Rust |

**Scelta: Electron.** L'editor lavora molto sul `contenteditable`, e con Chromium non ci sono sorprese rispetto a ciò che è già testato. Tutto resta in TypeScript. La dimensione dell'app è un costo accettabile.

Funzioni specifiche del desktop: cartelle osservate, uso offline, scorciatoia globale (per esempio `⌘⇧M` per aprire la Inbox o incollare dagli appunti), icona nella barra dei menu, apertura di `.md` dal Finder ("Apri con MDotion"), notifiche per i nuovi documenti.

### 6.4 Backend

**Supabase** per l'MVP:

- **Postgres** per metadati, versioni, testo dei documenti;
- **Auth** (email magic link, Google, GitHub) e OAuth per il connettore MCP;
- **Storage** per immagini e allegati;
- **Realtime** per aggiornare gli altri dispositivi aperti;
- **pgvector** per gli embeddings;
- **Edge Functions** o un piccolo servizio Node per i job AI e il server MCP.

Alternativa se si vuole più controllo: Postgres gestito (Neon) + servizio Node su Fly.io / Railway. Si decide prima della fase 2, non è bloccante.

### 6.5 Modello dati

```
users            id, email, plan, created_at
projects         id, user_id, name, color, created_at, archived_at
documents        id, user_id, project_id?, title, kind?, current_version_id,
                 status (inbox | filed | archived), created_at, updated_at
versions         id, document_id, number, markdown, content_hash,
                 source (mcp | watch | import | editor), source_client?,
                 source_ref?, change_summary?, created_at, author (ai | user)
tags             id, user_id, name
document_tags    document_id, tag_id
chunks           id, version_id, heading_path, text, embedding vector
version_links    candidate_document_id, target_document_id, score, decision
                 (auto | proposed | accepted | rejected), decided_at
watched_folders  id, user_id, device_id, path, mode (import | sync), filters
devices          id, user_id, name, platform, last_seen_at
mcp_clients      id, user_id, client_name, scopes, created_at, revoked_at
```

Il testo completo di ogni versione si salva così com'è: i documenti generati dalle AI sono piccoli e lo spazio costa poco. La compressione o i delta si valutano solo se servono.

### 6.6 Sincronizzazione

**Principio:** il dato canonico è il **testo Markdown** con un numero di versione, come oggi nell'estensione (`baseVersion` → `edit` → `update` / `conflict`).

- **Web (fase 2):** il cloud è l'unica fonte. Ogni modifica è `applyEdit(text, baseVersion)`. Se la versione sul server è più nuova, il server prova un **merge a tre vie** (base, server, client) a livello di blocco; se non riesce, risponde con un conflitto e l'editor lo gestisce come già fa con le modifiche esterne.
- **Desktop (fase 4):** cache locale (SQLite) con coda delle modifiche offline. Al ritorno online, ogni modifica in coda passa dallo stesso merge a tre vie. Un conflitto non risolvibile crea una **copia del conflitto** visibile ("Piano sito web, conflitto da MacBook"): non si perde mai niente.
- **Cartelle sincronizzate (fase 5):** il file sul disco e il documento cloud si allineano con la stessa logica; il file sul disco resta Markdown puro con il front matter.

**Perché non i CRDT (Yjs) da subito:** servono per la modifica simultanea di più persone, che non è un obiettivo iniziale, e lavorano sul documento ProseMirror invece che sul testo. Questo andrebbe contro la garanzia di round-trip byte per byte dei blocchi non toccati. Si rivalutano solo se arriva la collaborazione in tempo reale.

### 6.7 Pipeline AI

Ogni nuovo documento o nuova versione attiva una coda di job:

1. **Normalizzazione**: fine riga LF, front matter separato, hash del contenuto (si scartano i duplicati esatti).
2. **Chunking per sezioni** + embeddings.
3. **Riconoscimento versioni** (§5.2): prima i candidati via vettori, poi il punteggio combinato.
4. **Classificazione** (§5.1) con Claude Haiku, output strutturato (JSON con schema).
5. **Riepilogo delle modifiche** se è una nuova versione.

I job sono idempotenti (chiave = `version_id` + tipo di job) e ritentabili. I modelli si scelgono per costo: Haiku per classificazione e riepiloghi; un modello più grande solo per operazioni richieste esplicitamente (divisione suggerita, domande sui documenti).

---

## 7. Sicurezza e privacy

- **Isolamento dei dati**: Row Level Security di Postgres su ogni tabella (`user_id = auth.uid()`).
- **Crittografia**: in transito (TLS) e a riposo (gestita dal provider). La crittografia end-to-end è incompatibile con la ricerca semantica e la classificazione lato server: si dichiara in modo trasparente.
- **AI**: i contenuti mandati ai modelli non vengono usati per l'addestramento (condizioni dell'API commerciale); l'utente può disattivare le funzioni AI per progetto.
- **MCP**: token OAuth per client, con scope (`read`, `write`, `update`), revocabili dalle impostazioni; registro delle operazioni fatte da ogni client.
- **Contenuti non fidati**: i documenti generati dalle AI possono contenere HTML; l'anteprima resta sanificata come oggi ([sanitizeHtml.ts](../../webview/src/lib/sanitizeHtml.ts)). I documenti letti via MCP sono dati, non istruzioni: lo si scrive nella descrizione degli strumenti per limitare la prompt injection tra documenti.
- **Esportazione e cancellazione**: esportazione completa in `.zip` di Markdown (con le versioni, se richiesto); cancellazione dell'account con eliminazione reale dei dati (GDPR).

---

## 8. Posizionamento e modello di business

### 8.1 Il messaggio

La promessa attuale è *"no account, no cloud, no proprietary format"*. Il cloud la cambia, ma non deve tradirla:

> **I tuoi file sono sempre Markdown, sempre tuoi.** L'estensione resta locale e gratuita. Il cloud è la scelta in più per avere tutto in un posto, su ogni dispositivo, con le AI che salvano per te.

Regole che lo rendono credibile:

- nessun formato proprietario: metadati nel front matter, esportazione completa in un clic;
- il desktop può tenere ogni progetto anche come cartella vera sul disco;
- l'estensione VS Code non richiederà mai un account.

### 8.2 Concorrenza

| Prodotto | Punto forte | Cosa manca rispetto a MDotion Cloud |
|---|---|---|
| Obsidian (+ Sync) | Locale, Markdown, plugin | Ingestione dalle AI, riconoscimento versioni, editor a blocchi stile Notion |
| Notion | Editor a blocchi, collaborazione | Markdown non nativo, importazione con perdite, niente file portabili |
| Bear, Typora, iA Writer | Ottima scrittura Markdown | Nessuna organizzazione intelligente, niente MCP |
| Mem, Reflect | Note con AI | Non pensati per i file generati dalle AI, formato chiuso |

**Differenziazione:** *la casa di tutto ciò che le AI scrivono per te*. Gli elementi sono l'ingestione via MCP, la cronologia automatica delle versioni, l'editor Notion-like e il Markdown puro.

### 8.3 Ipotesi di prezzo (da validare)

| Piano | Prezzo indicativo | Contenuto |
|---|---|---|
| Free | 0 € | Web app, fino a ~100 documenti, MCP in sola scrittura, classificazione limitata |
| Pro | 6–8 € / mese | Documenti illimitati, desktop, cartelle osservate, versioni complete, ricerca semantica, MCP completo |
| Team (dopo) | per utente | Spazi condivisi, permessi, condivisione via link |

I costi variabili principali sono le chiamate AI (classificazione, embeddings, riepiloghi) e lo storage. Con Haiku e documenti di qualche migliaio di token, il costo per documento è di frazioni di centesimo, ma va misurato nella fase 3 prima di fissare i limiti del piano Free.

---

## 9. Roadmap

### Fase 1: fondamenta (1–2 settimane)

- Monorepo con `packages/core`, `packages/editor`, `packages/protocol`.
- `EditorHost` al posto di `vscodeApi`; implementazione VS Code.
- **Uscita:** estensione identica, tutti i test verdi, editor avviabile da solo nel browser (il `playground` attuale diventa l'host di sviluppo).

### Fase 2: MVP web + MCP (4–6 settimane)

- Auth, progetti, lista documenti, editor collegato all'API.
- Server MCP remoto con `save_document`, `update_document`, `search_documents` (testuale), `read_document`, `list_projects`.
- Importazione con trascinamento e incolla; esportazione `.zip`.
- Versioni registrate (senza ancora il riconoscimento automatico: solo `update_document` esplicito e modifiche manuali).
- **Uscita:** uso quotidiano personale per due settimane con Claude Desktop e almeno un altro client.

### Fase 3: organizzazione intelligente (4–6 settimane)

- Inbox, classificazione con Haiku, metadati nel front matter.
- Riconoscimento delle versioni con punteggio combinato e soglie; diff per blocchi; riepilogo delle modifiche.
- Embeddings per sezione, ricerca ibrida, ricerca semantica via MCP.
- Dividi per titoli, estrai selezione, unisci.
- **Uscita:** precisione del riconoscimento versioni ≥ 90 % sui casi proposti automaticamente (misurata sulle correzioni dell'utente).

### Fase 4: desktop (4–6 settimane)

- Electron con la web app, auto-update, firma e notarizzazione macOS, build Windows.
- Cartelle osservate in modalità "importa"; cache offline con coda delle modifiche e merge a tre vie.
- Scorciatoia globale, barra dei menu, "Apri con MDotion".
- **Uscita:** una settimana di uso alternando desktop offline e web senza perdite di dati.

### Fase 5: ponti e crescita

- Cartelle in modalità "sincronizza" (progetto ↔ cartella sul disco).
- Estensione VS Code: apri e salva documenti del cloud (opzionale, l'estensione resta utilizzabile senza account).
- Estensione del browser "Salva in MDotion".
- Domande sui documenti con citazioni.
- Valutazione di Team e condivisione.

---

## 10. Metriche

| Metrica | Perché conta |
|---|---|
| Documenti entrati via MCP / totale | Misura se il canale principale funziona |
| Tempo medio in Inbox prima dello smistamento | Misura l'attrito dell'organizzazione |
| % di classificazioni accettate senza modifiche | Qualità della classificazione |
| Precisione e richiamo del riconoscimento versioni | Qualità della funzione chiave; base per tarare le soglie |
| Annullamenti dopo un'unione automatica | Falsi positivi percepiti |
| Ritenzione a 4 settimane | Valore reale del prodotto |
| Costo AI per utente attivo / mese | Sostenibilità del piano Free |

---

## 11. Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Sync con perdita di dati | Media | Molto alto | Testo canonico + versioni immutabili + copie di conflitto; mai sovrascrivere senza versione |
| Falsi positivi nel riconoscimento versioni | Media | Alto | Soglie prudenti, fascia "proposta", annulla sempre disponibile, separazione delle catene |
| Le AI non usano bene gli strumenti MCP | Media | Alto | Descrizioni degli strumenti chiare e testate con ogni client; fallback sul riconoscimento euristico |
| Cambiamenti nel supporto MCP dei client | Bassa-media | Medio | Server conforme alla specifica, test con ogni client a ogni rilascio, canali alternativi (watcher, import) |
| Costi AI superiori alle attese | Media | Medio | Haiku, cache per `content_hash`, limiti del piano Free, misura nella fase 3 |
| Lavoro troppo ampio per una persona | Alta | Alto | Fasi con criteri di uscita; Supabase per non costruire infrastruttura; desktop solo dopo il web |
| Percezione di tradire la promessa "no cloud" | Media | Medio | Estensione sempre locale, esportazione completa, front matter, cartelle reali sul desktop |
| Regressioni nell'estensione durante la migrazione | Media | Alto | Fase 1 con criterio di uscita "tutti i test verdi, comportamento identico" |

---

## 12. Decisioni aperte

1. **Prodotto per sé o per il pubblico fin da subito?** Cambia quanto curare onboarding, pagamenti e limiti nella fase 2.
2. **Fonte dei dati:** cloud per l'MVP e cartella locale con il desktop (proposta di questo documento), oppure locale prima (modello Obsidian), invertendo l'ordine delle fasi.
3. **Team e condivisione:** se entrano nei piani, il modello dati deve prevedere da subito spazi di lavoro (`workspace_id` al posto di `user_id`).
4. **Backend:** Supabase (proposta) o Postgres gestito + servizio proprio.
5. **Nome e dominio:** "MDotion Cloud" su `app.mdotion.app` e `mcp.mdotion.app`, oppure un nome distinto per il prodotto a pagamento.

---

## 13. Primi passi concreti

1. ADR in inglese in `docs/adr/` per le scelte strutturali: monorepo, `EditorHost`, Electron, sync a testo canonico.
2. Fase 1 su un branch dedicato: estrazione di `core` ed `editor`, test verdi.
3. Prototipo veloce del server MCP con `save_document` su uno storage minimo, per provare subito il flusso con Claude Desktop prima di costruire tutta la web app.
4. Raccolta di un piccolo dataset reale (i propri `.md` generati negli ultimi mesi, con le loro versioni) per tarare il riconoscimento versioni nella fase 3.
