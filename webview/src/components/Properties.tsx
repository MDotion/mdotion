import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildFrontMatter,
  frontMatterContent,
  readFrontMatterProperties,
} from '../../../src/markdown/FrontMatter';

interface PropertiesProps {
  frontMatter: string | null;
  onChange: (frontMatter: string | null) => void;
}

/** YAML front matter shown as Notion page properties; edited as raw YAML so nothing is reformatted. */
export function Properties({ frontMatter, onChange }: PropertiesProps): React.ReactElement {
  const yaml = frontMatter ? frontMatterContent(frontMatter) : '';
  const properties = useMemo(() => readFrontMatterProperties(yaml), [yaml]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(yaml);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  }, [editing, draft]);

  const startEditing = () => {
    setDraft(yaml);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (draft === yaml) {
      return;
    }
    onChange(draft.trim() === '' && !frontMatter ? null : buildFrontMatter(draft));
  };

  if (frontMatter === null && !editing) {
    return (
      <div className="mdotion-page-actions">
        <button type="button" onClick={startEditing}>
          ☰ Add properties
        </button>
      </div>
    );
  }

  return (
    <section className="mdotion-properties" aria-label="Page properties (YAML front matter)">
      {editing ? (
        <textarea
          ref={textareaRef}
          className="mdotion-properties-source"
          autoFocus
          spellCheck={false}
          placeholder="title: My page"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
              event.preventDefault();
              commit();
            }
          }}
        />
      ) : (
        <div className="mdotion-properties-list" onDoubleClick={startEditing}>
          {properties.length === 0 ? (
            <div className="mdotion-property mdotion-muted">Empty front matter</div>
          ) : (
            properties.map((property) => (
              <div className="mdotion-property" key={property.key}>
                <span className="mdotion-property-key">{property.key}</span>
                <span className="mdotion-property-value">{property.value || <span className="mdotion-muted">Empty</span>}</span>
              </div>
            ))
          )}
          <button type="button" className="mdotion-properties-edit" onClick={startEditing}>
            Edit properties
          </button>
        </div>
      )}
    </section>
  );
}
