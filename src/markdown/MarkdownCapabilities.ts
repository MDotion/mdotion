/**
 * Constructs the visual editor can edit and write back (see ADR-008).
 * Anything else is preserved verbatim as a raw block (ADR-002).
 */
export const EDITABLE_CAPABILITIES = [
  'paragraph',
  'heading',
  'bold',
  'italic',
  'strike',
  'code-inline',
  'link',
  'autolink',
  'bullet-list',
  'ordered-list',
  'task-list',
  'blockquote',
  'callout',
  'code-block',
  'horizontal-rule',
  'table',
  'table-alignment',
  'image',
  'hard-break',
] as const;

export const PRESERVED_CAPABILITIES = [
  'front-matter',
  'html-block',
  'html-inline',
  'link-reference-definition',
  'unsupported-block',
] as const;

export type MarkdownCapability = (typeof EDITABLE_CAPABILITIES)[number] | (typeof PRESERVED_CAPABILITIES)[number];
