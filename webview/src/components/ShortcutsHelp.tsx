import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useState } from 'react';
import { postToHost } from '../lib/env';
import { CATEGORY_LABELS, SHORTCUTS, shortcutKeys, type ShortcutCategory } from '../lib/shortcuts';
import { onUiEvent } from '../lib/uiEvents';

const ORDER: ShortcutCategory[] = ['text', 'blocks', 'actions', 'tables', 'navigation', 'find', 'changes', 'editor'];

/** Cmd+/: every shortcut of the editor, searchable. Rebindable ones open VS Code's Keyboard Shortcuts. */
export function ShortcutsHelp({ editor }: { editor: Editor }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(
    () =>
      onUiEvent('command', (command) => {
        if (command === 'showShortcuts') {
          setQuery('');
          setOpen((value) => !value);
        }
      }),
    [],
  );

  const groups = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return ORDER.map((category) => ({
      category,
      items: SHORTCUTS.filter((shortcut) => {
        if (shortcut.category !== category) {
          return false;
        }
        const text = `${shortcut.label} ${CATEGORY_LABELS[category]} ${shortcutKeys(shortcut).join(' ')}`.toLowerCase();
        return words.every((word) => text.includes(word));
      }),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  if (!open) {
    return null;
  }

  const close = () => {
    setOpen(false);
    editor.commands.focus();
  };

  return (
    <div className="mdotion-jump-backdrop" onMouseDown={close}>
      <div className="mdotion-popover mdotion-shortcuts" role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mdotion-shortcuts-header">
          <input
            autoFocus
            className="mdotion-jump-input"
            placeholder="Search shortcuts…"
            aria-label="Search shortcuts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
            }}
          />
          <button type="button" className="mdotion-topbar-button" title="Change the shortcuts marked as customizable" onClick={() => postToHost({ type: 'openKeybindings' })}>
            Customize…
          </button>
        </div>
        <div className="mdotion-shortcuts-list">
          {groups.length === 0 ? <div className="mdotion-menu-empty">No shortcuts found</div> : null}
          {groups.map((group) => (
            <section key={group.category} className="mdotion-shortcuts-group">
              <h3 className="mdotion-menu-section">{CATEGORY_LABELS[group.category]}</h3>
              {group.items.map((shortcut) => (
                <div key={shortcut.id} className="mdotion-shortcuts-row">
                  <span className="mdotion-shortcuts-label">
                    {shortcut.label}
                    {shortcut.command ? (
                      <span className="mdotion-shortcuts-tag" title="Can be changed in Keyboard Shortcuts">
                        customizable
                      </span>
                    ) : null}
                  </span>
                  <span className="mdotion-shortcuts-keys">
                    {shortcutKeys(shortcut).map((keys) => (
                      <kbd key={keys}>{keys}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="mdotion-shortcuts-footer">Customized shortcuts are not shown here: VS Code does not share them with extensions.</div>
      </div>
    </div>
  );
}
