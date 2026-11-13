import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildFrontMatter,
  frontMatterContent,
  frontMatterFromProperties,
  isSimpleFrontMatter,
  readFrontMatterProperties,
  type FrontMatterProperty,
} from '../../../src/markdown/FrontMatter';

interface PropertiesProps {
  frontMatter: string | null;
  onChange: (frontMatter: string | null) => void;
}

type EditTarget =
  | { mode: 'yaml' }
  | { mode: 'key' | 'value'; index: number }
  | { mode: 'new'; field: 'key' | 'value' };

/** YAML front matter as Notion page properties, with inline edit and raw YAML fallback. */
export function Properties({ frontMatter, onChange }: PropertiesProps): React.ReactElement {
  const yaml = frontMatter ? frontMatterContent(frontMatter) : '';
  const parsed = useMemo(() => readFrontMatterProperties(yaml), [yaml]);
  const simple = useMemo(() => isSimpleFrontMatter(yaml), [yaml]);
  const [rows, setRows] = useState<FrontMatterProperty[]>(parsed);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [draft, setDraft] = useState('');
  const [yamlDraft, setYamlDraft] = useState(yaml);
  const [newRow, setNewRow] = useState<FrontMatterProperty | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (edit) {
      return;
    }
    setRows(parsed);
  }, [parsed, edit]);

  useLayoutEffect(() => {
    if (edit?.mode === 'yaml') {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight + 2}px`;
        textarea.focus();
        textarea.select();
      }
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [edit, newRow]);

  const commitProperties = (next: FrontMatterProperty[]) => {
    const cleaned = next
      .map((row) => ({ ...row, key: row.key.trim() }))
      .filter((row) => row.key !== '');
    setRows(cleaned);
    const nextFm = frontMatterFromProperties(cleaned);
    if (nextFm !== frontMatter) {
      onChange(nextFm);
    }
  };

  const startYaml = () => {
    setYamlDraft(yaml);
    setEdit({ mode: 'yaml' });
  };

  const cancel = () => {
    skipBlurCommit.current = true;
    setEdit(null);
    setNewRow(null);
    setDraft('');
    setRows(parsed);
  };

  const commitYaml = () => {
    setEdit(null);
    if (yamlDraft === yaml) {
      return;
    }
    onChange(yamlDraft.trim() === '' ? null : buildFrontMatter(yamlDraft));
  };

  const startField = (index: number, mode: 'key' | 'value') => {
    if (!simple) {
      startYaml();
      return;
    }
    const row = rows[index];
    if (!row) {
      return;
    }
    setDraft(mode === 'key' ? row.key : row.value);
    setEdit({ mode, index });
  };

  const commitField = () => {
    if (!edit || edit.mode === 'yaml' || edit.mode === 'new') {
      return;
    }
    const { mode, index } = edit;
    setEdit(null);
    const current = rows[index];
    if (!current) {
      return;
    }
    const nextValue = draft;
    if (mode === 'key' && nextValue.trim() === current.key) {
      return;
    }
    if (mode === 'value' && nextValue === current.value) {
      return;
    }
    const next = rows.map((row, i) => {
      if (i !== index) {
        return row;
      }
      return mode === 'key' ? { ...row, key: nextValue } : { ...row, value: nextValue };
    });
    commitProperties(next);
  };

  const removeRow = (index: number) => {
    commitProperties(rows.filter((_, i) => i !== index));
  };

  const startAdd = () => {
    if (frontMatter && !simple) {
      startYaml();
      return;
    }
    setNewRow({ key: '', value: '', kind: 'scalar' });
    setDraft('');
    setEdit({ mode: 'new', field: 'key' });
  };

  const commitNew = (advance: boolean) => {
    if (!newRow || !edit || edit.mode !== 'new') {
      return;
    }
    if (edit.field === 'key') {
      const key = draft.trim();
      if (!key) {
        cancel();
        return;
      }
      const row = { ...newRow, key };
      setNewRow(row);
      setDraft(row.value);
      if (advance) {
        setEdit({ mode: 'new', field: 'value' });
        return;
      }
      setEdit(null);
      setNewRow(null);
      commitProperties([...rows, row]);
      return;
    }
    const row = { ...newRow, value: draft };
    setEdit(null);
    setNewRow(null);
    setDraft('');
    commitProperties([...rows, row]);
  };

  if (frontMatter === null && !edit && !newRow) {
    return (
      <div className="mdotion-page-actions">
        <button type="button" onClick={startAdd}>
          ☰ Add properties
        </button>
      </div>
    );
  }

  if (edit?.mode === 'yaml') {
    return (
      <section className="mdotion-properties" aria-label="Page properties (YAML front matter)">
        <textarea
          ref={textareaRef}
          className="mdotion-properties-source"
          spellCheck={false}
          placeholder={'title: My page\ntags:\n  - one\n  - two'}
          value={yamlDraft}
          onChange={(event) => setYamlDraft(event.target.value)}
          onBlur={() => {
            if (skipBlurCommit.current) {
              skipBlurCommit.current = false;
              return;
            }
            commitYaml();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
              return;
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              commitYaml();
            }
          }}
        />
        <div className="mdotion-properties-actions">
          <span className="mdotion-muted">⌘↵ save · Esc cancel</span>
        </div>
      </section>
    );
  }

  const showEmpty = rows.length === 0 && !newRow;

  return (
    <section className="mdotion-properties" aria-label="Page properties (YAML front matter)">
      <div className="mdotion-properties-list">
        {showEmpty ? <div className="mdotion-property mdotion-muted">Empty front matter</div> : null}
        {rows.map((property, index) => {
          const editingKey = edit?.mode === 'key' && edit.index === index;
          const editingValue = edit?.mode === 'value' && edit.index === index;
          return (
            <div
              className={`mdotion-property${editingKey || editingValue ? ' is-editing' : ''}`}
              key={`${property.key}-${index}`}
            >
              {editingKey ? (
                <input
                  ref={inputRef}
                  className="mdotion-property-input mdotion-property-key-input"
                  value={draft}
                  aria-label="Property name"
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => {
                    if (skipBlurCommit.current) {
                      skipBlurCommit.current = false;
                      return;
                    }
                    commitField();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancel();
                    } else if (event.key === 'Enter') {
                      event.preventDefault();
                      commitField();
                    } else if (event.key === 'Tab') {
                      event.preventDefault();
                      const key = draft.trim() || property.key;
                      setRows((current) => current.map((row, i) => (i === index ? { ...row, key } : row)));
                      setDraft(property.value);
                      setEdit({ mode: 'value', index });
                    }
                  }}
                />
              ) : (
                <button type="button" className="mdotion-property-key" onClick={() => startField(index, 'key')}>
                  {property.key}
                </button>
              )}
              {editingValue ? (
                <input
                  ref={inputRef}
                  className="mdotion-property-input mdotion-property-value-input"
                  value={draft}
                  aria-label={`Value of ${property.key}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => {
                    if (skipBlurCommit.current) {
                      skipBlurCommit.current = false;
                      return;
                    }
                    commitField();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancel();
                    } else if (event.key === 'Enter') {
                      event.preventDefault();
                      commitField();
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="mdotion-property-value"
                  onClick={() => startField(index, 'value')}
                >
                  {property.value || <span className="mdotion-muted">Empty</span>}
                </button>
              )}
              {simple ? (
                <button
                  type="button"
                  className="mdotion-property-remove"
                  aria-label={`Remove ${property.key}`}
                  title="Remove"
                  onMouseDown={(event) => {
                    // Avoid blurring an open field into a stale commit before delete.
                    event.preventDefault();
                    skipBlurCommit.current = true;
                  }}
                  onClick={() => {
                    setEdit(null);
                    removeRow(index);
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
        {newRow && edit?.mode === 'new' ? (
          <div className="mdotion-property is-editing">
            {edit.field === 'key' ? (
              <input
                ref={inputRef}
                className="mdotion-property-input mdotion-property-key-input"
                value={draft}
                placeholder="Property"
                aria-label="New property name"
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  if (skipBlurCommit.current) {
                    skipBlurCommit.current = false;
                    return;
                  }
                  commitNew(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                  } else if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    commitNew(true);
                  }
                }}
              />
            ) : (
              <span className="mdotion-property-key">{newRow.key}</span>
            )}
            {edit.field === 'value' ? (
              <input
                ref={inputRef}
                className="mdotion-property-input mdotion-property-value-input"
                value={draft}
                placeholder="Value"
                aria-label={`Value of ${newRow.key}`}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  if (skipBlurCommit.current) {
                    skipBlurCommit.current = false;
                    return;
                  }
                  commitNew(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    commitNew(false);
                  }
                }}
              />
            ) : (
              <span className="mdotion-property-value mdotion-muted">Value</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="mdotion-properties-actions">
        {simple || !frontMatter ? (
          <button type="button" className="mdotion-properties-edit" onClick={startAdd}>
            + Add property
          </button>
        ) : null}
        <button type="button" className="mdotion-properties-edit" onClick={startYaml}>
          Edit as YAML
        </button>
      </div>
      {!simple && frontMatter ? (
        <p className="mdotion-properties-note">Complex YAML — edit as source to avoid changing nested values.</p>
      ) : null}
    </section>
  );
}
