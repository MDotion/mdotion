# Come testare Mdotion

## Come riconoscerlo

| **Non è Mdotion** (anteprima di VS Code/Cursor) | **È Mdotion** |
|---|---|
| In alto a destra: **Preview** \| **Markdown** | Pagina in stile Notion: nome del file in alto a sinistra, pulsanti **Markdown** e **•••** in alto a destra |
| Testo di sola lettura | Al passaggio del mouse compaiono `+` e `⋮⋮` a sinistra di ogni blocco; `/` apre il menu dei blocchi |

Nella barra di stato, in basso a destra, il pulsante **Mdotion** / **Markdown** passa da una vista all'altra.

## Metodo 1 — Installare il `.vsix` (Cursor o VS Code)

```bash
cd /Users/sebastian/Progetti/mdotion
nvm use            # Node 20.11+
npm run package    # crea mdotion-0.5.0.vsix
```

Extensions (⇧⌘X) → **⋯** → **Install from VSIX…** → `mdotion-0.5.0.vsix` → Reload. Apri un `.md`: si apre in Mdotion (altrimenti tasto destro sulla tab → **Reopen Editor With…** → **Mdotion**).

## Metodo 2 — Sviluppo (F5)

1. Apri **solo** la cartella `mdotion`.
2. `npm run watch` in un terminale.
3. **Run and Debug** → **Run Extension (Mdotion)** → F5. Prova tutto nella finestra `[Extension Development Host]`.

Dopo modifiche al codice: **Developer: Reload Window** nella finestra host.

## Metodo 3 — Solo UI, nel browser

```bash
npm run build:webview && npm run harness
```

Apri <http://localhost:5178/tests/browser/harness.html> (aggiungi `?theme=dark` per il tema scuro). A destra vedi in tempo reale il Markdown che verrebbe salvato; **External edit** simula una modifica fatta da fuori.

## Checklist manuale

- [ ] Apri `tests/fixtures/notion.md`: il file **non** diventa "modificato" (pallino sulla tab) solo aprendolo.
- [ ] Scrivi in un paragrafo, ⌘S, apri **Markdown**: è cambiata solo quella riga.
- [ ] `/` → filtra → Invio; `/xyz` mostra "No results".
- [ ] `+` e `⋮⋮`: aggiungi, trascina, menu blocco (Turn into, Duplicate, Delete).
- [ ] Seleziona testo → toolbar; ⌘K → link; ⌘B **non** chiude la sidebar.
- [ ] ⌘Z / ⌘⇧Z annullano un passo alla volta, il cursore resta dov'è.
- [ ] Modifica il file nel sorgente con Mdotion aperto accanto: l'editor visuale si aggiorna senza spostare il cursore.
- [ ] Click su un link: posiziona il cursore (nessun browser). ⌘+click: apre il link; un link a un altro `.md` lo apre nell'IDE.
- [ ] Tabelle, callout (clic sull'icona per cambiare tipo), blocchi codice (lingua + Copy), immagini relative, front matter ("Edit properties").
- [ ] Selezione a blocchi: trascina il mouse da un paragrafo all'altro, oppure dal margine sinistro; `Esc`, `Shift+↓`, `⌘A` due volte. ⌘C e incolla in un altro file: arriva Markdown formattato.
- [ ] `⋮⋮` con più blocchi selezionati: il menu dice "N blocks" e Duplica/Sposta/Elimina agiscono su tutti.
- [ ] **Visual | Markdown** in alto a destra e `⌘⌥M`: la tab viene sostituita (non duplicata), anche con modifiche non salvate.
- [ ] **Copy** in alto a destra e `⌘⇧⌥C`: negli appunti c'è tutto il file.
- [ ] Tema: pulsante sole/luna in alto a destra e **•••** → Theme (Auto / Light / Dark). Chiudi e riapri il file (o un altro `.md`): il tema resta. In Settings cerca `mdotion.theme`: c'è il valore scelto. Con **Auto** segue il tema chiaro/scuro dell'IDE.

## Se qualcosa non va

1. **Output** → **Extension Host** per gli errori dell'estensione.
2. **Developer: Open Webview Developer Tools** per gli errori della webview.
3. Verifica che esistano `dist/extension.js`, `dist/webview/assets/index.js` e `dist/webview/assets/index.css`.
