import type { Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEffect, useRef, useState } from 'react';
import { modKey, openLink } from '../lib/env';
import { emitUiEvent } from '../lib/uiEvents';

const linkBubbleKey = new PluginKey('mdotionLinkBubble');

/** URL field used by the toolbar and by Cmd+K. Empty value removes the link. */
export function LinkInput(props: {
  initialHref: string;
  onSubmit: (href: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(props.initialHref);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form
      className="mdotion-link-form"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(value.trim());
      }}
    >
      <input
        ref={inputRef}
        className="mdotion-input"
        placeholder="Paste a link, a relative path or #heading"
        value={value}
        aria-label="Link address"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            props.onCancel();
          }
        }}
      />
      <button type="submit" className="mdotion-button-primary">
        {value.trim() ? 'Apply' : 'Remove'}
      </button>
    </form>
  );
}

/** Popover shown when the caret is inside a link: open / edit / remove. */
export function LinkPopover({ editor }: { editor: Editor }): React.ReactElement {
  const href = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed.getAttributes('link').href as string | undefined) ?? '',
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={linkBubbleKey}
      className="mdotion-popover mdotion-link-popover"
      options={{ placement: 'bottom-start', offset: 6 }}
      shouldShow={({ editor: ed, state, view }) =>
        state.selection.empty && ed.isActive('link') && view.hasFocus()
      }
    >
      <button type="button" className="mdotion-link-target" title={`Open (${modKey}+click)`} onClick={() => href && openLink(href)}>
        <span aria-hidden>↗</span>
        <span className="mdotion-link-href">{href}</span>
      </button>
      <span className="mdotion-bubble-sep" />
      <button type="button" className="mdotion-bubble-button mdotion-bubble-wide" onClick={() => emitUiEvent('editLink', undefined)}>
        Edit
      </button>
      <button
        type="button"
        className="mdotion-bubble-button mdotion-bubble-wide"
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      >
        Remove
      </button>
    </BubbleMenu>
  );
}
