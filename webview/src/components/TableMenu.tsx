import type { Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { BubbleMenu } from '@tiptap/react/menus';

const tableBubbleKey = new PluginKey('mdotionTableBubble');

function currentTable(editor: Editor): HTMLElement | null {
  const { view, state } = editor;
  const dom = view.domAtPos(state.selection.from).node;
  const element = dom instanceof HTMLElement ? dom : dom.parentElement;
  return element?.closest('table') ?? null;
}

/** Row / column controls shown above a table while the caret is inside it. */
export function TableMenu({ editor }: { editor: Editor }): React.ReactElement {
  const run = (action: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    action(editor.chain().focus()).run();

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={tableBubbleKey}
      className="mdotion-popover mdotion-bubble mdotion-table-menu"
      options={{ placement: 'top-start', offset: 6 }}
      getReferencedVirtualElement={() => {
        const table = currentTable(editor);
        return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null;
      }}
      shouldShow={({ editor: ed, state, view }) =>
        ed.isEditable &&
        ed.isActive('table') &&
        (state.selection.empty || state.selection instanceof CellSelection) &&
        view.hasFocus()
      }
    >
      <div className="mdotion-bubble-row" role="toolbar" aria-label="Table">
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => run((c) => c.addRowBefore())}>
          + Row above
        </button>
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => run((c) => c.addRowAfter())}>
          + Row below
        </button>
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => run((c) => c.addColumnBefore())}>
          + Col left
        </button>
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => run((c) => c.addColumnAfter())}>
          + Col right
        </button>
        <span className="mdotion-bubble-sep" />
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => run((c) => c.deleteRow())}>
          Delete row
        </button>
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => run((c) => c.deleteColumn())}>
          Delete col
        </button>
        <button type="button" className="mdotion-bubble-button mdotion-bubble-wide mdotion-danger" onClick={() => run((c) => c.deleteTable())}>
          Delete table
        </button>
      </div>
    </BubbleMenu>
  );
}
