import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { BlockType } from '../editor/blockTypes';

export interface SlashMenuHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

type SlashMenuProps = SuggestionProps<BlockType, BlockType>;

const GRID_COLUMNS = 10;
const GRID_ROWS = 8;

interface TableSize {
  rows: number;
  cols: number;
}

/** The table item inserts a table of the size picked in the grid. */
function tableOfSize(item: BlockType, size: TableSize): BlockType {
  return {
    ...item,
    apply: (editor) => editor.chain().focus().insertTable({ rows: size.rows, cols: size.cols, withHeaderRow: true }).run(),
  };
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(props, ref) {
  const { items, command, query } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  /** Set while choosing the size of a new table. */
  const [tableSize, setTableSize] = useState<TableSize | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
    setTableSize(null);
  }, [items]);

  const choose = (item: BlockType) => {
    if (item.id === 'table') {
      setTableSize({ rows: 3, cols: 3 });
      return;
    }
    command(item);
  };

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (tableSize) {
        const table = items.find((item) => item.id === 'table');
        const resize = (rows: number, cols: number) =>
          setTableSize({ rows: Math.min(Math.max(rows, 2), GRID_ROWS), cols: Math.min(Math.max(cols, 1), GRID_COLUMNS) });
        switch (event.key) {
          case 'ArrowUp':
            resize(tableSize.rows - 1, tableSize.cols);
            return true;
          case 'ArrowDown':
            resize(tableSize.rows + 1, tableSize.cols);
            return true;
          case 'ArrowLeft':
            resize(tableSize.rows, tableSize.cols - 1);
            return true;
          case 'ArrowRight':
            resize(tableSize.rows, tableSize.cols + 1);
            return true;
          case 'Enter':
          case 'Tab':
            if (table) {
              command(tableOfSize(table, tableSize));
            }
            return true;
          default:
            return false;
        }
      }
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
          choose(item);
        }
        return true;
      }
      return false;
    },
  }));

  if (tableSize) {
    const table = items.find((item) => item.id === 'table');
    return (
      <div className="mdotion-popover mdotion-slash mdotion-table-picker" role="dialog" aria-label="Table size">
        <div className="mdotion-menu-section">
          Table · {tableSize.cols} × {tableSize.rows}
        </div>
        <div className="mdotion-table-picker-grid" role="grid" aria-label={`${tableSize.cols} columns, ${tableSize.rows} rows`}>
          {Array.from({ length: GRID_ROWS }, (_, row) => (
            <div key={row} role="row" className="mdotion-table-picker-row">
              {Array.from({ length: GRID_COLUMNS }, (_, col) => (
                <button
                  key={col}
                  type="button"
                  role="gridcell"
                  aria-label={`${col + 1} × ${row + 1}`}
                  className={[
                    'mdotion-table-picker-cell',
                    row < tableSize.rows && col < tableSize.cols ? 'is-in' : '',
                    row === 0 ? 'is-header' : '',
                  ].join(' ')}
                  onMouseEnter={() => setTableSize({ rows: Math.max(row + 1, 2), cols: col + 1 })}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (table) {
                      command(tableOfSize(table, { rows: Math.max(row + 1, 2), cols: col + 1 }));
                    }
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mdotion-table-picker-hint">Arrow keys to resize · Enter to insert · first row is the header</div>
      </div>
    );
  }

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
                choose(item);
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
