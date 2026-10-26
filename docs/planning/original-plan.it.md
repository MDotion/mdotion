# Piano di sviluppo --- Notion-like Markdown Editor

**Tipo di progetto:** estensione per Visual Studio Code e Cursor\
**Formato dei documenti:** Markdown (`.md`)\
**Esperienza principale:** editor WYSIWYG, con passaggio esplicito al
sorgente Markdown\
**Versione del piano:** 1.0\
**Stato:** proposta iniziale da validare durante il prototipo

------------------------------------------------------------------------

## 1. Visione e obiettivi

Realizzare un'estensione che permetta di leggere e modificare file
Markdown con un'esperienza di scrittura ispirata a Notion, senza
trasformare i file in un formato proprietario e senza richiedere un
servizio cloud.

L'utente deve poter aprire un file `.md`, modificarlo direttamente in un
editor visuale, usare blocchi e scorciatoie familiari e salvare il
risultato come normale Markdown. Deve inoltre poter passare all'editor
sorgente quando desidera intervenire sulla sintassi.

### 1.1 Obiettivi del prodotto

-   Rendere la scrittura di documentazione Markdown semplice e visuale.
-   Mantenere i file `.md` come formato persistente e portabile.
-   Supportare i componenti Markdown più comuni e una selezione di
    estensioni utili.
-   Integrarsi con i flussi di lavoro di VS Code e Cursor.
-   Funzionare localmente, senza account, database o server obbligatori.
-   Evitare perdita silenziosa di contenuti non supportati.
-   Mantenere accessibili le funzioni standard dell'IDE, incluso
    l'editor testuale.

### 1.2 Non-obiettivi iniziali

La prima versione non deve replicare l'intera piattaforma Notion. Sono
fuori ambito per l'MVP:

-   collaborazione multiutente in tempo reale;
-   sincronizzazione cloud o account;
-   database relazionali, proprietà e viste di database;
-   automazioni e workflow;
-   sistema completo di workspace e permessi;
-   importazione perfetta di ogni formato rich-text;
-   layout proprietari non rappresentabili ragionevolmente in Markdown;
-   supporto garantito a ogni estensione Markdown di terze parti.

### 1.3 Principi guida

1.  **Markdown come formato persistente:** nessun database proprietario
    è necessario per salvare un documento.
2.  **Nessuna perdita silenziosa:** se un costrutto non è supportato, va
    preservato oppure segnalato chiaramente.
3.  **Una sola fonte di verità per il file:** l'Extension Host e il
    `TextDocument` dell'IDE governano il contenuto persistente.
4.  **Editing visuale autentico:** l'utente modifica il documento
    formattato, non una preview con controlli sovrapposti.
5.  **Incrementalità:** introdurre funzionalità solo dopo aver validato
    conversione e sincronizzazione.
6.  **Portabilità:** minimizzare le dipendenze da comportamenti
    specifici di una sola versione di VS Code o Cursor.
7.  **Testabilità:** parser, serializer, protocollo e sincronizzazione
    devono poter essere testati separatamente.

------------------------------------------------------------------------

## 2. Definizione del successo

L'MVP può essere considerato pronto quando un utente riesce a:

1.  aprire un file Markdown esistente nell'editor visuale;
2.  vedere correttamente i costrutti supportati;
3.  modificare titoli, paragrafi, liste, task, link e codice;
4.  salvare le modifiche nel file originale;
5.  passare alla modalità sorgente e tornare senza perdere contenuto;
6.  usare undo/redo in modo prevedibile;
7.  vedere le modifiche effettuate dall'editor sorgente o da un altro
    processo;
8.  riaprire il file e ottenere lo stesso contenuto semantico;
9.  lavorare su un file con sintassi non supportata senza che questa
    venga cancellata in modo silenzioso;
10. eseguire il flusso principale sia in VS Code sia in Cursor, nelle
    versioni dichiarate supportate.

Il criterio non è soltanto "l'interfaccia si vede": il criterio è "il
ciclo apri-modifica-salva-riapri è affidabile".

------------------------------------------------------------------------

## 3. Utenti e casi d'uso prioritari

### 3.1 Utenti principali

-   sviluppatori che scrivono README e documentazione tecnica;
-   team che mantengono documentazione versionata con Git;
-   persone che usano file Markdown come appunti personali;
-   utenti di VS Code o Cursor che preferiscono un editor visuale al
    testo grezzo.

### 3.2 Casi d'uso da supportare per primi

-   scrivere un nuovo documento;
-   modificare un README già esistente;
-   aggiungere e completare checklist;
-   formattare testo e link;
-   inserire snippet di codice;
-   passare temporaneamente al sorgente;
-   lavorare con file versionati in Git;
-   modificare lo stesso documento da più viste dell'IDE, gestendo gli
    aggiornamenti.

### 3.3 Casi da investigare durante il prototipo

-   file Markdown molto lunghi;
-   file con front matter YAML;
-   link relativi e immagini locali;
-   sintassi GitHub Flavored Markdown (GFM);
-   blocchi HTML inline o block-level;
-   direttive o componenti personalizzati presenti nei documenti;
-   newline Windows/Unix e caratteri Unicode;
-   conflitti fra modifiche visuali e modifiche esterne.

------------------------------------------------------------------------

## 4. Architettura proposta

### 4.1 Panoramica

Il progetto avrà due runtime distinti:

-   **Extension Host:** codice TypeScript che gira nell'ambiente
    dell'IDE e usa le API di VS Code.
-   **Webview:** interfaccia React isolata che contiene l'editor Tiptap.

Il documento Markdown rimane un `TextDocument` gestito dall'IDE. La
Webview comunica con l'Extension Host attraverso un protocollo di
messaggi tipizzato. L'Extension Host applica le modifiche al documento
usando le API dell'editor, invece di permettere alla Webview di scrivere
direttamente sul filesystem.

### 4.2 Componenti

#### Extension Host

Responsabilità: - registrare il custom editor; - registrare i comandi; -
aprire la vista visuale e quella sorgente; - creare e gestire le
Webview; - ricevere richieste di modifica; - applicare `WorkspaceEdit`
al documento; - osservare cambiamenti del `TextDocument`; - gestire
lifecycle, disposal e risorse.

#### Custom editor provider

Usare inizialmente `CustomTextEditorProvider`, perché il contenuto
persistente è testo Markdown. La registrazione dovrebbe consentire
all'utente di scegliere l'editor visuale, senza eliminare la possibilità
di aprire il file nell'editor di testo standard.

Responsabilità: - inizializzare la Webview; - inviare il contenuto
iniziale e i metadati necessari; - ricevere messaggi dalla Webview; -
applicare modifiche e notificare gli aggiornamenti; - rispettare il
ciclo di vita dell'editor e del documento.

#### Document Bridge

Modulo dedicato alla sincronizzazione. Non deve contenere codice UI.

Responsabilità: - assegnare revisioni alle versioni del documento; -
distinguere gli aggiornamenti originati dalla Webview da quelli
esterni; - evitare loop di aggiornamento; - validare i messaggi
ricevuti; - coordinare il debounce, se necessario; - gestire conflitti e
messaggi fuori ordine; - inviare alla Webview aggiornamenti coerenti.

#### Webview React

Responsabilità: - creare e montare l'editor Tiptap; - visualizzare
toolbar e menu contestuali; - gestire slash command; - tradurre azioni
dell'utente in operazioni sul documento; - comunicare modifiche e
richieste al bridge; - rispettare il tema dell'IDE e l'accessibilità.

#### Markdown Adapter

Responsabilità: - convertire Markdown in un documento utilizzabile da
Tiptap; - serializzare il documento Tiptap in Markdown; - definire le
estensioni supportate; - gestire front matter e costrutti speciali
secondo regole esplicite; - identificare o preservare contenuti non
supportati; - esporre un'interfaccia interna indipendente dal pacchetto
di parsing scelto.

#### Test suite

Responsabilità: - testare parsing e serializzazione; - testare il
protocollo; - testare la sincronizzazione; - testare le operazioni
essenziali dell'editor; - testare il comportamento in un host VS Code; -
verificare la compatibilità con Cursor manualmente e, ove possibile, con
test automatizzati.

### 4.3 Diagramma logico

``` mermaid
flowchart TD
    A[File Markdown / TextDocument] <--> B[Extension Host]
    B <--> C[Document Bridge]
    C <--> D[Webview React]
    D <--> E[Tiptap / ProseMirror]
    E <--> F[Markdown Adapter]
    F <--> E
    B --> G[Comandi e integrazione IDE]
    H[Test unitari e integrazione] --> B
    H --> C
    H --> F
```

### 4.4 Decisioni da confermare con uno spike tecnico

-   Compatibilità e limiti attuali di `@tiptap/markdown`.
-   Integrazione tra schema Tiptap e tutti i costrutti Markdown
    prioritari.
-   Strategia di sincronizzazione che preservi cursore e selezione.
-   Comportamento effettivo di undo/redo tramite `WorkspaceEdit`.
-   Gestione di contenuto non supportato senza perdita.
-   Differenze tra le versioni target di VS Code e Cursor.

Queste decisioni vanno verificate con un prototipo, non date per
scontate.

------------------------------------------------------------------------

## 5. Stack tecnologico

### 5.1 Stack iniziale

-   **TypeScript:** logica dell'estensione e tipi condivisi.
-   **VS Code Extension API:** integrazione con editor e documenti.
-   **React:** UI della Webview.
-   **Tiptap / ProseMirror:** editing rich-text e modello del documento.
-   **`@tiptap/markdown`:** candidato per parsing e serializzazione,
    isolato dietro un adapter.
-   **Vite:** build della Webview.
-   **esbuild:** build dell'Extension Host.
-   **Vitest:** test unitari e di conversione.
-   **`@vscode/test-electron`:** test d'integrazione nell'host VS Code.
-   **ESLint e Prettier:** qualità e formattazione del codice.

### 5.2 Regole sulle dipendenze

-   Bloccare versioni compatibili nel lockfile.
-   Non duplicare estensioni già incluse nello StarterKit di Tiptap.
-   Tenere le dipendenze della Webview separate da quelle dell'Extension
    Host.
-   Non introdurre librerie per funzionalità non previste nell'MVP.
-   Valutare licenze, manutenzione e stato beta dei pacchetti prima
    della distribuzione.
-   Tenere l'API del Markdown Adapter indipendente dal parser concreto,
    per facilitare una sostituzione futura.

### 5.3 Build

La build deve produrre: - un bundle per l'Extension Host; - asset
statici della Webview; - CSS e font eventualmente necessari; - un
pacchetto `.vsix` installabile.

La Webview deve usare una Content Security Policy restrittiva, risorse
locali autorizzate e nessuna dipendenza da script remoti. Le URI delle
risorse vanno convertite con le API della Webview.

------------------------------------------------------------------------

## 6. Struttura del repository

``` text
notion-md/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── src/
│   ├── extension.ts
│   ├── commands/
│   │   ├── openVisualEditor.ts
│   │   ├── openSource.ts
│   │   └── toggleEditor.ts
│   ├── editor/
│   │   ├── MarkdownEditorProvider.ts
│   │   ├── DocumentBridge.ts
│   │   ├── WebviewFactory.ts
│   │   └── protocol.ts
│   ├── markdown/
│   │   ├── MarkdownAdapter.ts
│   │   ├── MarkdownCapabilities.ts
│   │   ├── FrontMatter.ts
│   │   └── extensions/
│   │       ├── Callout.ts
│   │       └── TaskList.ts
│   ├── shared/
│   │   ├── messages.ts
│   │   └── types.ts
│   └── test/
│       ├── unit/
│       └── integration/
├── webview/
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── editor/
│       │   ├── createEditor.ts
│       │   └── extensions.ts
│       ├── components/
│       │   ├── EditorToolbar.tsx
│       │   ├── SlashMenu.tsx
│       │   ├── LinkPopover.tsx
│       │   └── BlockHandle.tsx
│       ├── hooks/
│       │   └── useDocumentBridge.ts
│       └── styles/
│           ├── editor.css
│           └── theme.css
├── tests/
│   ├── fixtures/
│   │   ├── basic.md
│   │   ├── gfm.md
│   │   ├── frontmatter.md
│   │   └── unsupported.md
│   ├── markdown-roundtrip.test.ts
│   └── document-sync.test.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
├── esbuild.mjs
├── .eslintrc.cjs
├── .prettierrc
├── README.md
├── CHANGELOG.md
└── LICENSE
```

Non tutti i file devono essere creati il primo giorno: la struttura è la
destinazione prevista. Iniziare con il minimo necessario è preferibile a
creare molti moduli vuoti.

------------------------------------------------------------------------

## 7. Protocollo di comunicazione

I messaggi fra Webview ed Extension Host devono essere tipizzati e
versionati. La Webview è un contesto separato: non deve essere
considerata attendibile e i payload devono essere validati.

### 7.1 Tipi iniziali

Esempio concettuale:

``` ts
type WebviewToHostMessage =
  | {
      type: "ready";
      protocolVersion: 1;
    }
  | {
      type: "requestDocument";
      requestId: string;
    }
  | {
      type: "updateMarkdown";
      revision: number;
      baseRevision: number;
      markdown: string;
    }
  | {
      type: "requestSource";
    };

type HostToWebviewMessage =
  | {
      type: "documentSnapshot";
      revision: number;
      markdown: string;
    }
  | {
      type: "documentChanged";
      revision: number;
      markdown: string;
      origin: "external" | "host";
    }
  | {
      type: "operationResult";
      requestId: string;
      ok: boolean;
      message?: string;
    }
  | {
      type: "conflict";
      currentRevision: number;
      markdown: string;
    };
```

Il protocollo è illustrativo: prima dell'implementazione bisogna
definire esattamente quali messaggi sono necessari e quali dati vengono
trasferiti.

### 7.2 Regole del protocollo

-   Ogni messaggio ha un `type` noto e dati validabili.
-   Le revisioni impediscono di applicare modifiche obsolete.
-   I messaggi non riconosciuti vengono ignorati in sicurezza e
    registrati in debug.
-   Gli errori sono comunicati alla UI in modo comprensibile.
-   Il contenuto del documento non deve essere inserito in HTML non
    sanificato.
-   Nessun messaggio può eseguire comandi arbitrari o scrivere file
    arbitrari.
-   Il bridge deve distinguere gli aggiornamenti locali da quelli
    provenienti da altre viste.

------------------------------------------------------------------------

## 8. Strategia Markdown e integrità dei contenuti

Questa è una delle aree a maggior rischio. Markdown ha varianti e molte
estensioni; non tutti gli elementi rich-text hanno una rappresentazione
standard.

### 8.1 Matrice di supporto

  ------------------------------------------------------------------------
  Costrutto                                      MVP Strategia
  --------------------- ---------------------------- ---------------------
  Paragrafi                                       Sì Parsing e
                                                     serializzazione

  H1--H3                                          Sì Heading standard

  Grassetto e corsivo                             Sì Mark Markdown
                                                     standard

  Barrato                                         Sì Sintassi GFM

  Link                                            Sì Preservare URL e
                                                     testo

  Liste                                           Sì Liste standard
  puntate/numerate                                   

  Checklist                                       Sì GFM task list

  Citazioni                                       Sì Blockquote

  Code inline e code                              Sì Preservare linguaggio
  fence                                              e contenuto

  Separatore                                      Sì HR

  Tabelle GFM                      Inizialmente base Validare parser e
                                                     serializer

  Immagini                                Successivo Gestire path relativi
                                                     e alt text

  Callout                                 Successivo Definire sintassi
                                                     compatibile e
                                                     documentata

  Mermaid                                 Successivo Blocco di codice
                                                     preservato, preview
                                                     eventuale

  Formule matematiche                     Successivo Valutare sintassi e
                                                     renderer

  HTML arbitrario                      Non garantito Preservare o
                                                     segnalare

  Front matter YAML        Preservazione prioritaria Trattarlo
                                                     separatamente dal
                                                     corpo

  Sintassi sconosciuta     Preservazione prioritaria Evitare conversione
                                                     distruttiva
  ------------------------------------------------------------------------

### 8.2 Round-trip test

Per ogni fixture: 1. leggere il Markdown originale; 2. convertirlo nel
modello dell'editor; 3. serializzare nuovamente; 4. ricaricare il
risultato; 5. confrontare la struttura semantica e i contenuti.

Non è sempre necessario che il testo serializzato sia identico byte per
byte: il parser può normalizzare spaziatura o liste. Tuttavia, link,
testo, gerarchia, codice, task, front matter e contenuti non supportati
non devono scomparire o cambiare significato.

### 8.3 Contenuto non supportato

Prima di una conversione che possa eliminare contenuti: - rilevare i
costrutti fuori dallo schema supportato; - evitare la serializzazione
distruttiva; - mostrare un avviso o mantenere una rappresentazione opaca
del contenuto; - offrire l'apertura nel sorgente; - coprire il
comportamento con test di regressione.

Se il parser scelto non permette di preservare un costrutto in modo
sicuro, il documento non deve essere riscritto automaticamente dopo una
modifica non correlata senza avvertire l'utente.

------------------------------------------------------------------------

## 9. Sincronizzazione, salvataggio e undo/redo

### 9.1 Fonte di verità

Il `TextDocument` dell'IDE è la fonte di verità persistente. Tiptap
mantiene il modello interattivo della Webview, ma non una copia
indipendente che possa sovrascrivere modifiche esterne senza controllo.

### 9.2 Flusso di modifica

1.  L'utente modifica il documento in Tiptap.
2.  L'adapter produce il Markdown aggiornato.
3.  La Webview invia una richiesta con revisione di base.
4.  Il bridge valida il messaggio.
5.  L'Extension Host calcola e applica una modifica al `TextDocument`.
6.  L'evento di modifica dell'IDE aggiorna la revisione.
7.  La Webview riceve conferma o aggiornamento.
8.  Gli aggiornamenti originati dalla Webview non vengono riapplicati
    inutilmente all'editor.

### 9.3 Debounce e granularità

-   Un debounce iniziale di circa 150--250 ms può ridurre il numero di
    aggiornamenti.
-   Il debounce non deve compromettere il salvataggio né perdere
    l'ultima modifica alla chiusura.
-   Preferire modifiche incrementali quando la strategia è affidabile.
-   La sostituzione dell'intero documento può essere usata solo come
    prima implementazione controllata, con limiti e test.
-   Non reinizializzare l'intero editor a ogni battitura.

### 9.4 Undo/redo

Non dare per scontato che lo stack undo di ProseMirror e quello dell'IDE
siano automaticamente sincronizzati. Definire esplicitamente quale
componente governa l'undo e verificare il comportamento reale con test.

Requisiti: - Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z devono avere un comportamento
prevedibile; - undo/redo non deve duplicare le modifiche; - le modifiche
esterne devono essere gestite senza cancellare la cronologia in modo
inatteso; - le scorciatoie devono rispettare le convenzioni dell'IDE.

### 9.5 Conflitti

Se il documento cambia esternamente mentre l'utente sta modificando una
versione precedente: - rilevare la revisione obsoleta; - evitare
l'overwrite silenzioso; - provare a riconciliare gli aggiornamenti non
conflittuali; - in caso di conflitto reale, mantenere il contenuto e
offrire un percorso per recuperare o confrontare le versioni.

Per l'MVP è accettabile una strategia di conflitto semplice e
conservativa; non è accettabile perdere dati senza avviso.

------------------------------------------------------------------------

## 10. Esperienza utente

### 10.1 Modalità visuale

La UI iniziale deve includere: - documento centrato con larghezza di
lettura ragionevole; - titoli e paragrafi formattati; - toolbar per
formattazione inline; - shortcut da tastiera; - menu slash con
ricerca; - checkbox interattive; - code fence leggibili; - stati di
caricamento ed errore; - integrazione con tema chiaro/scuro dell'IDE.

### 10.2 Modalità sorgente

Comandi previsti: - `Markdown: Open Visual Editor` -
`Markdown: Open Source` - `Markdown: Toggle Editor`

La modalità sorgente deve aprire lo stesso URI nell'editor testuale
standard. Entrambe le viste devono condividere il documento gestito
dall'IDE.

### 10.3 Slash menu MVP

Comandi minimi: - Paragraph - Heading 1 - Heading 2 - Heading 3 - Bullet
list - Numbered list - Task list - Quote - Code block - Divider

Il menu deve: - aprirsi quando l'utente digita `/` in una posizione
appropriata; - filtrare le voci mentre l'utente digita; - supportare
frecce, Invio ed Escape; - non interferire con URL o testo in cui `/` è
parte di contenuto normale; - mantenere il focus e la selezione
corretti.

### 10.4 Accessibilità

-   Navigazione da tastiera per tutti i comandi.
-   Focus visibile.
-   Etichette accessibili per pulsanti e menu.
-   Contrasto sufficiente in entrambi i temi.
-   Non affidarsi solo al colore per comunicare uno stato.
-   Verificare il comportamento con screen reader dove possibile.

------------------------------------------------------------------------

## 11. Piano di lavoro per fasi

Le stime sono indicative per una persona che conosce TypeScript e
sviluppo web; aumentano se la familiarità con le API di VS Code o
ProseMirror è limitata.

### Fase 0 --- Ricerca e decisioni tecniche

**Obiettivo:** ridurre i rischi prima di costruire la UI.

Attività: - verificare le API correnti per `CustomTextEditorProvider`; -
verificare lo stato e i limiti di `@tiptap/markdown`; - creare un test
minimo di parsing e serializzazione; - verificare le estensioni Tiptap
per task list e link; - scegliere versioni compatibili; - definire i
primi file fixture; - scrivere le decisioni architetturali (ADR).

Deliverable: - repository iniziale; - documento delle decisioni; - spike
di conversione funzionante; - matrice dei rischi aggiornata.

Criterio di uscita: - un Markdown semplice può essere convertito,
modificato e serializzato senza perdita semantica evidente.

### Fase 1 --- Scaffold e build

**Obiettivo:** avviare l'estensione in modalità sviluppo.

Attività: - inizializzare package e TypeScript; - configurare esbuild
per Extension Host; - configurare Vite per Webview; - configurare
comandi di build, watch, test e packaging; - creare `extension.ts`; -
registrare il custom editor; - generare una Webview con Content Security
Policy; - verificare il caricamento delle risorse locali.

Deliverable: - estensione avviabile tramite Extension Development
Host; - build ripetibile; - primo pacchetto `.vsix` locale.

Criterio di uscita: - il custom editor si apre e mostra una UI React
senza errori.

### Fase 2 --- Editor WYSIWYG minimo

**Obiettivo:** modificare contenuto localmente nella Webview.

Attività: - inizializzare Tiptap; - configurare paragrafi, heading, mark
e liste; - implementare la toolbar base; - collegare le scorciatoie; -
applicare CSS per tema e leggibilità; - creare test UI e unitari
essenziali.

Deliverable: - editor visuale funzionante con documento in memoria.

Criterio di uscita: - si possono modificare i costrutti base senza usare
il sorgente.

### Fase 3 --- Apertura e salvataggio del file

**Obiettivo:** collegare l'editor al `TextDocument`.

Attività: - implementare `MarkdownEditorProvider`; - inviare snapshot
iniziale alla Webview; - implementare `DocumentBridge`; - validare il
protocollo; - convertire Markdown in documento Tiptap; - serializzare le
modifiche in Markdown; - applicare modifiche al documento tramite API VS
Code; - prevenire loop di sincronizzazione.

Deliverable: - file reale modificabile dall'editor visuale.

Criterio di uscita: - una modifica visuale aggiorna il file e sopravvive
a chiusura e riapertura.

### Fase 4 --- Toggle sorgente/visuale

**Obiettivo:** garantire un flusso fluido tra le due modalità.

Attività: - implementare `Open Source`; - implementare
`Open Visual Editor`; - implementare `Toggle Editor`; - verificare due
viste aperte sullo stesso file; - gestire aggiornamenti esterni; -
testare focus, selezione e salvataggio.

Deliverable: - comandi di passaggio tra le viste.

Criterio di uscita: - modificare il sorgente e tornare al visuale non
perde le modifiche confermate.

### Fase 5 --- Integrità e qualità della conversione

**Obiettivo:** evitare regressioni e perdita di contenuto.

Attività: - ampliare fixture Markdown; - testare GFM, code fence, link
relativi e Unicode; - definire comportamento per front matter; -
rilevare sintassi non supportata; - implementare avvisi o
rappresentazioni conservative; - verificare undo/redo; - verificare
newline e formattazione.

Deliverable: - suite di round-trip test; - matrice delle capacità
aggiornata; - documentazione dei limiti.

Criterio di uscita: - tutti i costrutti dichiarati supportati passano i
test e i contenuti fuori ambito non vengono cancellati silenziosamente.

### Fase 6 --- Interazioni Notion-like

**Obiettivo:** rendere l'editing piacevole e veloce.

Attività: - menu slash con ricerca; - toolbar contestuale; - popover per
link; - checklist interattive; - selezione e navigazione coerenti; -
gestione tastiera del menu; - miglioramenti di focus e accessibilità.

Deliverable: - flusso di scrittura simile a un editor a blocchi.

Criterio di uscita: - le operazioni più comuni sono eseguibili senza
conoscere la sintassi Markdown.

### Fase 7 --- Hardening e compatibilità

**Obiettivo:** preparare una release utilizzabile.

Attività: - test con file lunghi; - test di apertura, chiusura e
riapertura; - test con modifiche esterne e conflitti; - test di
sicurezza della Webview; - verifica di CSP e URI delle risorse; - test
su versioni dichiarate di VS Code; - test manuali su Cursor; - controllo
delle dipendenze e delle licenze; - packaging e documentazione.

Deliverable: - release candidate; - README e changelog; - istruzioni
d'installazione; - matrice di compatibilità.

Criterio di uscita: - nessun bug bloccante noto nei flussi principali e
limiti documentati.

------------------------------------------------------------------------

## 12. Roadmap sintetica

  Milestone                      Risultato                                   Priorità
  ------------------------------ ----------------------------------- ----------------
  M0 --- Spike                   Conversione Markdown validata                     P0
  M1 --- Scaffold                Estensione avviabile                              P0
  M2 --- Editor base             Editing WYSIWYG locale                            P0
  M3 --- File bridge             Lettura e salvataggio reale                       P0
  M4 --- Toggle                  Passaggio visuale/sorgente                        P0
  M5 --- Integrità               Round-trip e contenuti preservati                 P0
  M6 --- UX                      Toolbar e slash menu                              P1
  M7 --- Stabilità               Test VS Code/Cursor e packaging       P0 per release
  M8 --- Tabelle e immagini      Blocchi aggiuntivi                                P2
  M9 --- Callout e Mermaid       Estensioni Markdown                               P2
  M10 --- Drag & drop avanzato   Gestione blocchi evoluta                          P3

Le priorità non indicano necessariamente l'ordine temporale assoluto: la
qualità della sincronizzazione e dell'integrità deve essere verificata
prima di investire in molte funzioni UI.

------------------------------------------------------------------------

## 13. Strategia di test

### 13.1 Test unitari

-   Markdown Adapter: parsing e serializzazione.
-   Protocollo: validazione dei messaggi.
-   Document Bridge: revisioni e origine degli aggiornamenti.
-   Funzioni di rilevamento dei costrutti non supportati.
-   Utility per link e path, se introdotte.

### 13.2 Test di integrazione

-   apertura di un file Markdown;
-   ricezione dello snapshot iniziale;
-   modifica e aggiornamento del documento;
-   salvataggio e riapertura;
-   passaggio alla vista sorgente;
-   aggiornamento del file dall'esterno;
-   gestione di messaggi obsoleti;
-   chiusura della Webview durante una modifica.

### 13.3 Test manuali

-   VS Code su macOS, Windows e Linux dove disponibili;
-   Cursor sulle piattaforme supportate;
-   tema chiaro e scuro;
-   tastiera senza mouse;
-   documenti piccoli e grandi;
-   repository Git con modifiche locali;
-   file con front matter e sintassi non supportata.

### 13.4 Fixture iniziali

`basic.md`: - heading; - paragrafi; - grassetto e corsivo; - link; -
liste; - task list; - quote; - code fence.

`gfm.md`: - barrato; - tabelle; - task list; - URL e riferimenti.

`frontmatter.md`: - front matter YAML; - corpo Markdown; - separatore
tra metadata e contenuto.

`unsupported.md`: - HTML; - direttive o sintassi personalizzata; -
elementi che il modello editoriale non rappresenta.

------------------------------------------------------------------------

## 14. Sicurezza e robustezza

-   Usare una Content Security Policy restrittiva nella Webview.
-   Non eseguire HTML o script contenuti nei file Markdown.
-   Non fidarsi dei messaggi provenienti dalla Webview.
-   Validare tipo, dimensione e struttura dei payload.
-   Evitare percorsi file arbitrari e accessi non necessari.
-   Usare URI delle risorse autorizzate dalla Webview.
-   Sanificare o rendere inerti contenuti HTML quando vengono
    visualizzati.
-   Non caricare script remoti.
-   Gestire errori di parsing senza cancellare il documento.
-   Prevedere un modo chiaro per tornare al sorgente quando l'editor non
    riesce a rappresentare un contenuto.

La preview di immagini e link deve inoltre rispettare il modello di
sicurezza e le impostazioni dell'IDE. Il supporto a risorse remote va
valutato separatamente dal supporto ai percorsi locali.

------------------------------------------------------------------------

## 15. Prestazioni

Obiettivi iniziali da verificare sperimentalmente: - apertura rapida di
documenti piccoli; - nessun re-render completo dell'editor a ogni
carattere; - debounce limitato e senza perdita dell'ultima modifica; -
uso ragionevole della memoria su documenti lunghi; - aggiornamento
incrementale quando possibile; - menu slash e toolbar reattivi; - nessun
ciclo infinito di sincronizzazione.

Non fissare soglie di performance definitive prima di avere un
prototipo. Creare invece benchmark ripetibili con documenti da circa 100
KB, 500 KB e 1 MB, e registrare tempi di apertura, modifica,
serializzazione e memoria quando possibile.

------------------------------------------------------------------------

## 16. Rischi principali e mitigazioni

  -----------------------------------------------------------------------
  Rischio                 Impatto                 Mitigazione
  ----------------------- ----------------------- -----------------------
  Parser Markdown in beta Alto                    Adapter interno, spike
  o incompleto                                    e test round-trip

  Perdita di sintassi non Molto alto              Preservazione
  supportata                                      conservativa, avvisi,
                                                  fixture

  Loop tra Webview e      Alto                    Revisioni, origine
  documento                                       delle modifiche, test

  Undo/redo incoerente    Alto                    Definire una fonte di
                                                  controllo e test
                                                  specifici

  Perdita di cursore o    Alto                    Evitare reset completi
  selezione                                       e usare aggiornamenti
                                                  mirati

  Differenze VS           Medio-alto              API standard, matrice
  Code/Cursor                                     di compatibilità, test
                                                  reali

  Webview insicura        Alto                    CSP, risorse locali,
                                                  validazione dei
                                                  messaggi

  Scope troppo ampio      Alto                    MVP rigoroso e roadmap
                                                  per livelli

  Tabelle e blocchi       Medio-alto              Aggiungerli dopo la
  speciali complessi                              validazione del core

  File lunghi e           Medio                   Benchmark e
  serializzazione costosa                         aggiornamenti
                                                  incrementali
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 17. Distribuzione e manutenzione

### 17.1 Prima distribuzione

-   creare un publisher reale;
-   definire identificativo e nome definitivo;
-   generare il pacchetto `.vsix`;
-   provarlo in un profilo pulito dell'IDE;
-   verificare che gli asset Webview siano inclusi;
-   documentare installazione e disinstallazione;
-   dichiarare le versioni supportate.

### 17.2 Documentazione minima

Il repository dovrebbe contenere: - README con obiettivo e screenshot; -
istruzioni per sviluppo e build; - elenco dei costrutti supportati; -
limiti noti del Markdown Adapter; - comandi disponibili; - matrice di
compatibilità; - changelog; - licenza; - guida per segnalare bug.

### 17.3 Versionamento

Usare Semantic Versioning quando il progetto avrà un'API e un
comportamento sufficientemente stabili: - `0.x`: sviluppo e possibili
cambiamenti incompatibili; - `1.0`: flussi core affidabili e limiti
documentati; - release successive: nuovi blocchi e miglioramenti UX.

------------------------------------------------------------------------

## 18. Backlog iniziale

### P0 --- Bloccanti

-   [ ] Inizializzare repository e toolchain.
-   [ ] Verificare parsing/serializzazione Markdown con uno spike.
-   [ ] Registrare `CustomTextEditorProvider`.
-   [ ] Caricare Webview React.
-   [ ] Inizializzare Tiptap.
-   [ ] Leggere il `TextDocument`.
-   [ ] Inviare snapshot alla Webview.
-   [ ] Inviare modifiche dalla Webview all'Extension Host.
-   [ ] Applicare `WorkspaceEdit`.
-   [ ] Evitare loop di sincronizzazione.
-   [ ] Implementare il toggle visuale/sorgente.
-   [ ] Testare undo/redo.
-   [ ] Testare round-trip e contenuto non supportato.

### P1 --- Esperienza di scrittura

-   [ ] Toolbar inline.
-   [ ] Shortcut di formattazione.
-   [ ] Slash menu.
-   [ ] Checklist.
-   [ ] Link popover.
-   [ ] Stati di errore e conflitto.
-   [ ] Tema chiaro/scuro.
-   [ ] Accessibilità da tastiera.

### P2 --- Blocchi aggiuntivi

-   [ ] Tabelle.
-   [ ] Immagini.
-   [ ] Callout.
-   [ ] Front matter gestito.
-   [ ] Diagrammi Mermaid.
-   [ ] Formule matematiche.
-   [ ] Navigazione dei link interni.

### P3 --- Esperienza avanzata

-   [ ] Drag & drop dei blocchi.
-   [ ] Handle dei blocchi.
-   [ ] Incolla avanzato da browser.
-   [ ] Miglioramenti di performance su documenti grandi.
-   [ ] Opzioni utente e personalizzazione.

------------------------------------------------------------------------

## 19. Primo sprint: task in ordine operativo

Lo sprint iniziale deve terminare con un percorso end-to-end
funzionante, non con una collezione di componenti scollegati.

1.  Creare repository, package e script di build.
2.  Compilare un'estensione minima con un comando.
3.  Registrare un custom editor per i file `.md`.
4.  Creare una Webview con React e una Content Security Policy.
5.  Caricare Tiptap con paragrafi e heading.
6.  Passare il contenuto del `TextDocument` alla Webview.
7.  Convertire Markdown in modello editor.
8.  Modificare un titolo dalla Webview.
9.  Serializzare il documento aggiornato.
10. Applicare una modifica al `TextDocument`.
11. Verificare che il file su disco contenga il risultato.
12. Aprire la vista sorgente e tornare alla vista visuale.
13. Aggiungere test di round-trip e sincronizzazione.
14. Provare il pacchetto in un'istanza pulita di VS Code.
15. Ripetere il flusso principale in Cursor.

**Definition of Done dello sprint:** un file `.md` può essere aperto,
visualizzato, modificato, salvato, riaperto e alternato alla vista
sorgente senza perdita del contenuto supportato.

------------------------------------------------------------------------

## 20. Decisioni da non rimandare

Prima di considerare il core stabile, rispondere con prove ai seguenti
quesiti:

1.  Il parser/serializer scelto preserva i costrutti richiesti?
2.  Come vengono preservati front matter e sintassi non supportata?
3.  Quale componente governa undo/redo?
4.  Come si evita che una modifica esterna sovrascriva una modifica
    visuale non ancora applicata?
5.  Qual è la strategia per aggiornare il documento senza perdere
    cursore e selezione?
6.  Come viene gestito un errore di parsing?
7.  Quali versioni di VS Code e Cursor saranno supportate?
8.  Quali costrutti sono ufficialmente garantiti nell'MVP?

Le risposte devono essere registrate nel repository, idealmente in brevi
Architecture Decision Records (ADR), e accompagnate da test quando
riguardano il comportamento del prodotto.

------------------------------------------------------------------------

## 21. Raccomandazione conclusiva

Il progetto è fattibile, ma la qualità finale dipenderà più dalla
conversione e dalla sincronizzazione che dalla quantità di componenti
visuali.

La sequenza più sicura è:

1.  **validare il Markdown Adapter;**
2.  **costruire il custom editor minimo;**
3.  **rendere affidabile il ciclo modifica/salvataggio/sorgente;**
4.  **aggiungere toolbar e slash menu;**
5.  **estendere progressivamente i componenti Markdown.**

Non iniziare con un clone completo di Notion. Costruire prima un editor
Markdown visuale che non perda dati crea la base necessaria per tutte le
funzionalità successive.
