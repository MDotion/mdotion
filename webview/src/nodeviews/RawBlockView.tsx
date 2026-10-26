import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { marked } from 'marked';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getAdapter } from '../editor/adapter';
import { sanitizeHtml } from '../lib/sanitizeHtml';

/** Markdown rendering passes HTML through and also renders Markdown nested in it (e.g. inside <details>). */
function buildPreview(raw: string): DocumentFragment {
  return sanitizeHtml(marked.parse(raw, { async: false, gfm: true }) as string);
}

function describe(raw: string): string {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('<!--')) {
    return 'HTML comment';
  }
  if (trimmed.startsWith('<')) {
    return 'HTML';
  }
  if (/^\[[^\]]+\]:/.test(trimmed)) {
    return 'Link reference';
  }
  return 'Markdown';
}

/**
 * Opaque block: shows a sanitized preview of source the editor cannot edit
 * visually, and lets the user edit that source directly.
 */
export function RawBlockView({ node, updateAttributes, deleteNode, selected, editor, getPos }: ReactNodeViewProps): React.ReactElement {
  const raw = (node.attrs.raw as string) ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(raw);
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => setDraft(raw), [raw]);

  useLayoutEffect(() => {
    if (editing || !previewRef.current) {
      return;
    }
    const fragment = buildPreview(raw);
    previewRef.current.replaceChildren(fragment);
    const element = previewRef.current;
    setEmpty(!element.textContent?.trim() && !element.querySelector('img, hr, table'));
  }, [raw, editing]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (editing && textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  }, [editing, draft]);

  const commit = () => {
    setEditing(false);
    if (draft === raw) {
      return;
    }
    if (draft.trim() === '') {
      deleteNode();
      return;
    }
    const parsed = getAdapter().parse(draft);
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (parsed.rawBlocks === 0 && pos !== undefined) {
      // The source is now plain Markdown the editor understands: make it editable.
      editor
        .chain()
        .insertContentAt({ from: pos, to: pos + node.nodeSize }, parsed.doc.content.toJSON() as object[])
        .run();
      return;
    }
    updateAttributes({ raw: draft });
  };

  const label = describe(raw);

  return (
    <NodeViewWrapper className="mdotion-raw" data-selected={selected || undefined}>
      <div contentEditable={false}>
        <div className="mdotion-raw-label">
          <span>{label}</span>
          {editor.isEditable && !editing ? (
            <button type="button" onClick={() => setEditing(true)}>
              Edit source
            </button>
          ) : null}
        </div>
        {editing ? (
          <textarea
            ref={textareaRef}
            className="mdotion-raw-source"
            autoFocus
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
                event.preventDefault();
                commit();
                editor.commands.focus();
              }
            }}
          />
        ) : (
          <>
            <div
              ref={previewRef}
              className="mdotion-raw-preview"
              hidden={empty}
              onDoubleClick={() => editor.isEditable && setEditing(true)}
            />
            {empty ? (
              <pre className="mdotion-raw-code" onDoubleClick={() => editor.isEditable && setEditing(true)}>
                {raw}
              </pre>
            ) : null}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
