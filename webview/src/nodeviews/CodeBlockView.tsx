import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useMemo, useState } from 'react';
import { lowlight } from '../../../src/markdown/mdotionExtensions';
import { copyText } from '../lib/clipboard';

const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  graphql: 'GraphQL',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  python: 'Python',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly',
  xml: 'HTML / XML',
  yaml: 'YAML',
};

export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps): React.ReactElement {
  const language = (node.attrs.language as string | null) ?? '';
  const [copied, setCopied] = useState(false);
  const languages = useMemo(() => lowlight.listLanguages().sort(), []);
  const known = language === '' || languages.includes(language) || lowlight.registered(language);

  const copy = () => {
    void copyText(node.textContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <NodeViewWrapper className="mdotion-code">
      <div className="mdotion-code-bar" contentEditable={false}>
        <select
          className="mdotion-code-language"
          value={language}
          disabled={!editor.isEditable}
          aria-label="Code language"
          onChange={(event) => updateAttributes({ language: event.target.value || null })}
        >
          <option value="">Plain text</option>
          {!known ? <option value={language}>{language}</option> : null}
          {languages.map((name) => (
            <option key={name} value={name}>
              {LANGUAGE_LABELS[name] ?? name}
            </option>
          ))}
        </select>
        <button type="button" className="mdotion-code-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent<'code'> as="code" className={language ? `hljs language-${language}` : 'hljs'} />
      </pre>
    </NodeViewWrapper>
  );
}
