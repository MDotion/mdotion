import type { DiffItem, DiffRow } from '../changes/lineDiff';

const SIGNS = { add: '+', del: '-', context: ' ' } as const;

function LineText({ row }: { row: DiffRow }): React.ReactElement {
  if (row.words.length === 0) {
    return <>{row.text || '​'}</>;
  }
  const pieces: React.ReactNode[] = [];
  let offset = 0;
  row.words.forEach(([from, to], index) => {
    pieces.push(row.text.slice(offset, from));
    pieces.push(
      <span key={index} className="mdotion-sdiff-word">
        {row.text.slice(from, to)}
      </span>,
    );
    offset = to;
  });
  pieces.push(row.text.slice(offset));
  return <>{pieces}</>;
}

interface SourceDiffProps {
  items: DiffItem[];
  onExpand: (key: number) => void;
  currentHunk: number | null;
}

/** A unified diff of the Markdown source, laid out like a pull request on GitHub. */
export function SourceDiff({ items, onExpand, currentHunk }: SourceDiffProps): React.ReactElement {
  return (
    <table className="mdotion-sdiff">
      <colgroup>
        <col className="mdotion-sdiff-num-col" />
        <col className="mdotion-sdiff-num-col" />
        <col className="mdotion-sdiff-sign-col" />
        <col />
      </colgroup>
      <tbody>
        {items.map((item, position) => {
          if (item.type === 'hunk') {
            // After hidden lines, the header shares the row of their Expand button (like GitHub).
            if (items[position - 1]?.type === 'gap') {
              return null;
            }
            return (
              <tr key={`h${item.hunk}`} className={`mdotion-sdiff-hunk${item.hunk === currentHunk ? ' is-current' : ''}`} data-hunk={item.hunk}>
                <td colSpan={3} className="mdotion-sdiff-num" />
                <td className="mdotion-sdiff-code">{item.header}</td>
              </tr>
            );
          }
          if (item.type === 'gap') {
            const next = items[position + 1];
            const hunk = next?.type === 'hunk' ? next : null;
            const label = `Expand ${item.count} unchanged ${item.count === 1 ? 'line' : 'lines'}`;
            return (
              <tr
                key={`g${item.key}`}
                className={`mdotion-sdiff-hunk mdotion-sdiff-gap${hunk && hunk.hunk === currentHunk ? ' is-current' : ''}`}
                data-hunk={hunk?.hunk}
              >
                <td colSpan={3} className="mdotion-sdiff-num">
                  <button type="button" aria-label={label} title={label} onClick={() => onExpand(item.key)}>
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                      <path d="M5 6l3-3 3 3M5 10l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </td>
                <td className="mdotion-sdiff-code">{hunk ? hunk.header : ''}</td>
              </tr>
            );
          }
          return (
            <tr key={`r${item.index}`} className={`mdotion-sdiff-row is-${item.row.kind}`}>
              <td className="mdotion-sdiff-num">{item.row.oldLine ?? ''}</td>
              <td className="mdotion-sdiff-num">{item.row.newLine ?? ''}</td>
              <td className="mdotion-sdiff-sign">{SIGNS[item.row.kind]}</td>
              <td className="mdotion-sdiff-code">
                <LineText row={item.row} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
