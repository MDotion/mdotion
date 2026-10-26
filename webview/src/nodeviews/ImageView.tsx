import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { resolveResourceUrl } from '../lib/env';

export function ImageView({ node, updateAttributes, selected, deleteNode, editor }: ReactNodeViewProps): React.ReactElement {
  const src = (node.attrs.src as string | null) ?? '';
  const alt = (node.attrs.alt as string | null) ?? '';
  const [editingSrc, setEditingSrc] = useState(src === '');
  const [draft, setDraft] = useState(src);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
    setDraft(src);
  }, [src]);

  const commitSrc = () => {
    const value = draft.trim();
    if (!value) {
      if (!src) {
        deleteNode();
      }
      setEditingSrc(false);
      return;
    }
    updateAttributes({ src: value });
    setEditingSrc(false);
  };

  if (editingSrc || !src) {
    return (
      <NodeViewWrapper className="mdotion-image-empty" data-selected={selected || undefined}>
        <div className="mdotion-embed" contentEditable={false}>
          <span className="mdotion-embed-icon" aria-hidden>
            🖼
          </span>
          <input
            autoFocus
            className="mdotion-embed-input"
            placeholder="Paste an image link or a path relative to this file…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitSrc();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(src);
                if (!src) {
                  deleteNode();
                } else {
                  setEditingSrc(false);
                }
                editor.commands.focus();
              }
            }}
          />
          <button type="button" className="mdotion-button-primary" onClick={commitSrc}>
            Embed image
          </button>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="mdotion-image" data-selected={selected || undefined}>
      <figure contentEditable={false}>
        {broken ? (
          <div className="mdotion-image-broken" onDoubleClick={() => setEditingSrc(true)}>
            Could not load image <code>{src}</code>
          </div>
        ) : (
          <img
            src={resolveResourceUrl(src)}
            alt={alt}
            title={(node.attrs.title as string | null) ?? undefined}
            draggable={false}
            onError={() => setBroken(true)}
            onDoubleClick={() => setEditingSrc(true)}
          />
        )}
        <div className="mdotion-image-tools">
          <button type="button" onClick={() => setEditingSrc(true)}>
            Replace
          </button>
        </div>
        <input
          className="mdotion-image-caption"
          placeholder="Add a caption"
          value={alt}
          aria-label="Image caption (alt text)"
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              editor.commands.focus();
            }
          }}
        />
      </figure>
    </NodeViewWrapper>
  );
}
