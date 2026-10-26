import type { Editor } from '@tiptap/core';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockSelection } from '../editor/BlockSelection';
import { CONVERTIBLE_TYPES, currentBlockType } from '../editor/blockTypes';
import { modKey } from '../lib/env';
import { onUiEvent } from '../lib/uiEvents';
import { LinkInput } from './LinkPopover';

const formatBubbleKey = new PluginKey('mdotionFormatBubble');

interface BubbleToolbarProps {
  editor: Editor;
}

/** Notion's selection toolbar: Turn into · B I S code · link. */
export function BubbleToolbar({ editor }: BubbleToolbarProps): React.ReactElement {
  const [linkMode, setLinkMode] = useState(false);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  const linkModeRef = useRef(false);

  const setLink = useCallback(
    (value: boolean) => {
      linkModeRef.current = value;
      setLinkMode(value);
      setTurnIntoOpen(false);
      editor.view.dispatch(editor.state.tr.setMeta(formatBubbleKey, value ? 'show' : 'updatePosition'));
    },
    [editor],
  );

  useEffect(
    () =>
      onUiEvent('editLink', () => {
        const { empty } = editor.state.selection;
        if (empty && !editor.isActive('link')) {
          return;
        }
        if (empty) {
          editor.chain().focus().extendMarkRange('link').run();
        }
        setLink(true);
      }),
    [editor, setLink],
  );

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      strike: ed.isActive('strike'),
      code: ed.isActive('code'),
      link: ed.isActive('link'),
      href: (ed.getAttributes('link').href as string | undefined) ?? '',
      blockTitle: currentBlockType(ed)?.title ?? 'Text',
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={formatBubbleKey}
      className="mdotion-popover mdotion-bubble"
      updateDelay={0}
      options={{
        placement: 'top-start',
        offset: 8,
        onHide: () => {
          linkModeRef.current = false;
          setLinkMode(false);
          setTurnIntoOpen(false);
        },
      }}
      shouldShow={({ editor: ed, state: editorState, view }) => {
        if (linkModeRef.current) {
          return true;
        }
        const { selection } = editorState;
        if (!ed.isEditable || selection.empty || selection instanceof NodeSelection || selection instanceof BlockSelection) {
          return false;
        }
        if (ed.isActive('codeBlock') || ed.isActive('rawBlock') || selection instanceof CellSelection) {
          return false;
        }
        if (!editorState.doc.textBetween(selection.from, selection.to).trim()) {
          return false;
        }
        return view.hasFocus();
      }}
    >
      {linkMode ? (
        <LinkInput
          initialHref={state.href}
          onSubmit={(href) => {
            const chain = editor.chain().focus().extendMarkRange('link');
            if (href) {
              chain.setLink({ href }).run();
            } else {
              chain.unsetLink().run();
            }
            setLink(false);
          }}
          onCancel={() => {
            setLink(false);
            editor.commands.focus();
          }}
        />
      ) : (
        <div className="mdotion-bubble-row" role="toolbar" aria-label="Text formatting">
          <div className="mdotion-turn-into">
            <button
              type="button"
              className="mdotion-bubble-button mdotion-bubble-wide"
              aria-haspopup="menu"
              aria-expanded={turnIntoOpen}
              onClick={() => setTurnIntoOpen((open) => !open)}
            >
              {state.blockTitle} <span className="mdotion-caret">▾</span>
            </button>
            {turnIntoOpen ? (
              <div className="mdotion-popover mdotion-menu mdotion-turn-into-menu" role="menu">
                <div className="mdotion-menu-section">Turn into</div>
                {CONVERTIBLE_TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    role="menuitem"
                    className={`mdotion-menu-item${type.title === state.blockTitle ? ' is-active' : ''}`}
                    onClick={() => {
                      type.apply(editor);
                      setTurnIntoOpen(false);
                    }}
                  >
                    <span className="mdotion-menu-icon">{type.icon}</span>
                    {type.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span className="mdotion-bubble-sep" />
          <FormatButton label="Bold" shortcut={`${modKey}B`} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </FormatButton>
          <FormatButton label="Italic" shortcut={`${modKey}I`} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>i</i>
          </FormatButton>
          <FormatButton label="Strikethrough" shortcut={`${modKey}⇧S`} active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <s>S</s>
          </FormatButton>
          <FormatButton label="Inline code" shortcut={`${modKey}E`} active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
            <span className="mdotion-mono">&lt;/&gt;</span>
          </FormatButton>
          <span className="mdotion-bubble-sep" />
          <FormatButton label="Link" shortcut={`${modKey}K`} active={state.link} onClick={() => setLink(true)}>
            <span className="mdotion-bubble-link">Link</span>
          </FormatButton>
        </div>
      )}
    </BubbleMenu>
  );
}

function FormatButton(props: {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={`mdotion-bubble-button${props.active ? ' is-active' : ''}`}
      title={`${props.label} (${props.shortcut})`}
      aria-label={props.label}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}
