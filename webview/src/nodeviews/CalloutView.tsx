import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { CALLOUT_TYPES, type CalloutType } from '../../../src/markdown/extensions/Callout';

export const CALLOUT_META: Record<CalloutType, { icon: string; label: string }> = {
  note: { icon: 'ℹ️', label: 'Note' },
  tip: { icon: '💡', label: 'Tip' },
  important: { icon: '❗', label: 'Important' },
  warning: { icon: '⚠️', label: 'Warning' },
  caution: { icon: '🛑', label: 'Caution' },
};

export function CalloutView({ node, updateAttributes, editor }: ReactNodeViewProps): React.ReactElement {
  const type = (CALLOUT_TYPES as readonly string[]).includes(node.attrs.type as string)
    ? (node.attrs.type as CalloutType)
    : 'note';
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <NodeViewWrapper className={`mdotion-callout mdotion-callout-${type}`} data-callout={type}>
      <div className="mdotion-callout-icon-wrap" contentEditable={false} ref={menuRef}>
        <button
          type="button"
          className="mdotion-callout-icon"
          title={`${CALLOUT_META[type].label} — click to change`}
          disabled={!editor.isEditable}
          onClick={() => setOpen((value) => !value)}
        >
          {CALLOUT_META[type].icon}
        </button>
        {open ? (
          <div className="mdotion-popover mdotion-callout-menu" role="menu">
            {CALLOUT_TYPES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="menuitemradio"
                aria-checked={candidate === type}
                className={candidate === type ? 'is-active' : ''}
                onClick={() => {
                  updateAttributes({ type: candidate });
                  setOpen(false);
                  editor.commands.focus();
                }}
              >
                <span>{CALLOUT_META[candidate].icon}</span>
                {CALLOUT_META[candidate].label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <NodeViewContent className="mdotion-callout-content" />
    </NodeViewWrapper>
  );
}
