import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BlockType } from '../editor/blockTypes';

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

type SlashMenuProps = SuggestionProps<BlockType, BlockType>;

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(props, ref) {
  const { items, command, query } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelectedIndex(0), [items]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === 'ArrowUp') {
        setSelectedIndex((index) => (index + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((index) => (index + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="mdotion-popover mdotion-slash" role="listbox" aria-label="Insert block" ref={listRef}>
      {items.length === 0 ? (
        <div className="mdotion-menu-empty">No results for “{query}”</div>
      ) : (
        <>
          <div className="mdotion-menu-section">{query ? 'Results' : 'Basic blocks'}</div>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              data-index={index}
              aria-selected={index === selectedIndex}
              className={`mdotion-slash-item${index === selectedIndex ? ' is-selected' : ''}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                command(item);
              }}
            >
              <span className="mdotion-slash-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="mdotion-slash-text">
                <span className="mdotion-slash-title">{item.title}</span>
                <span className="mdotion-slash-desc">{item.description}</span>
              </span>
              {item.hint ? <span className="mdotion-slash-hint">{item.hint}</span> : null}
            </button>
          ))}
        </>
      )}
    </div>
  );
});
