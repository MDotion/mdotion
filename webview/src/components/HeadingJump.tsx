import type { Editor } from '@tiptap/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { computeOutline } from '../editor/outline/sections';
import { depthOf, goToHeading } from '../editor/outline/navigate';
import { onUiEvent } from '../lib/uiEvents';

/** ⌘⇧O: filter the headings of the page and jump to one (VS Code's Go to Symbol is not available in custom editors). */
export function HeadingJump({ editor }: { editor: Editor }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      onUiEvent('jumpToHeading', () => {
        setQuery('');
        setSelected(0);
        setOpen(true);
      }),
    [],
  );

  const items = useMemo(() => (open ? computeOutline(editor.state.doc) : []), [open, editor]);
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => words.every((word) => item.text.toLowerCase().includes(word)));
  }, [items, query]);

  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) {
    return null;
  }

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) {
      editor.commands.focus();
    }
  };
  const jump = (index: number) => {
    const item = matches[index];
    close(false);
    if (item) {
      goToHeading(editor, item.pos);
    }
  };

  return (
    <div className="mdotion-jump-backdrop" onMouseDown={() => close(true)}>
      <div className="mdotion-popover mdotion-jump" role="dialog" aria-label="Go to heading" onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="mdotion-jump-input"
          placeholder="Go to heading…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setSelected((value) => (matches.length === 0 ? 0 : (value + step + matches.length) % matches.length));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              jump(selected);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
            }
          }}
        />
        <div className="mdotion-jump-list" ref={listRef} role="listbox">
          {matches.length === 0 ? (
            <div className="mdotion-menu-empty">{items.length === 0 ? 'This page has no headings' : 'No results'}</div>
          ) : (
            matches.map((item, index) => (
              <button
                key={item.pos}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={`mdotion-menu-item${index === selected ? ' is-active' : ''}`}
                style={{ paddingLeft: 8 + depthOf(items, item) * 14 }}
                onMouseEnter={() => setSelected(index)}
                onClick={() => jump(index)}
              >
                <span className="mdotion-jump-level">H{item.level}</span>
                <span className="mdotion-jump-text">{item.text || 'Untitled'}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
