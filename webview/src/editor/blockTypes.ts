import type { Editor } from '@tiptap/core';

export interface BlockType {
  id: string;
  title: string;
  description: string;
  /** Glyph shown in the Notion-style icon tile. */
  icon: string;
  keywords: string[];
  /** Markdown shortcut hint shown on the right of the menu. */
  hint?: string;
  /** Converts the block containing the selection (or the empty line) into this type. */
  apply: (editor: Editor) => boolean;
  isActive?: (editor: Editor) => boolean;
  /** Whether "Turn into" offers this type (insert-only types are excluded). */
  convertible: boolean;
}

const inList = (editor: Editor) =>
  editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList');

export const BLOCK_TYPES: BlockType[] = [
  {
    id: 'paragraph',
    title: 'Text',
    description: 'Just start writing with plain text.',
    icon: 'Aa',
    keywords: ['text', 'paragraph', 'plain', 'p'],
    apply: (editor) => editor.chain().focus().clearNodes().run(),
    isActive: (editor) =>
      editor.isActive('paragraph') && !inList(editor) && !editor.isActive('blockquote') && !editor.isActive('callout'),
    convertible: true,
  },
  ...([1, 2, 3] as const).map<BlockType>((level) => ({
    id: `h${level}`,
    title: `Heading ${level}`,
    description: ['Big section heading.', 'Medium section heading.', 'Small section heading.'][level - 1],
    icon: `H${level}`,
    keywords: ['heading', `h${level}`, 'title', 'header'],
    hint: '#'.repeat(level),
    apply: (editor) => editor.chain().focus().clearNodes().setHeading({ level }).run(),
    isActive: (editor) => editor.isActive('heading', { level }),
    convertible: true,
  })),
  {
    id: 'bulletList',
    title: 'Bulleted list',
    description: 'Create a simple bulleted list.',
    icon: '•',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    hint: '-',
    apply: (editor) =>
      editor.isActive('bulletList') || editor.chain().focus().setParagraph().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
    convertible: true,
  },
  {
    id: 'orderedList',
    title: 'Numbered list',
    description: 'Create a list with numbering.',
    icon: '1.',
    keywords: ['numbered', 'ordered', 'list', 'ol'],
    hint: '1.',
    apply: (editor) =>
      editor.isActive('orderedList') || editor.chain().focus().setParagraph().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
    convertible: true,
  },
  {
    id: 'taskList',
    title: 'To-do list',
    description: 'Track tasks with a to-do list.',
    icon: '☑',
    keywords: ['todo', 'to-do', 'task', 'checkbox', 'check'],
    hint: '[]',
    apply: (editor) =>
      editor.isActive('taskList') || editor.chain().focus().setParagraph().toggleTaskList().run(),
    isActive: (editor) => editor.isActive('taskList'),
    convertible: true,
  },
  {
    id: 'blockquote',
    title: 'Quote',
    description: 'Capture a quote.',
    icon: '❝',
    keywords: ['quote', 'blockquote', 'citation'],
    hint: '>',
    apply: (editor) => editor.isActive('blockquote') || editor.chain().focus().clearNodes().setBlockquote().run(),
    isActive: (editor) => editor.isActive('blockquote'),
    convertible: true,
  },
  {
    id: 'callout',
    title: 'Callout',
    description: 'Make writing stand out.',
    icon: '💡',
    keywords: ['callout', 'note', 'tip', 'warning', 'important', 'caution', 'alert', 'admonition'],
    apply: (editor) => editor.isActive('callout') || editor.chain().focus().clearNodes().setCallout('note').run(),
    isActive: (editor) => editor.isActive('callout'),
    convertible: true,
  },
  {
    id: 'codeBlock',
    title: 'Code',
    description: 'Capture a code snippet.',
    icon: '</>',
    keywords: ['code', 'snippet', 'fence', 'pre'],
    hint: '```',
    apply: (editor) => editor.isActive('codeBlock') || editor.chain().focus().clearNodes().setCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
    convertible: true,
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually divide blocks.',
    icon: '—',
    keywords: ['divider', 'hr', 'horizontal', 'rule', 'line', 'separator'],
    hint: '---',
    apply: (editor) => editor.chain().focus().setHorizontalRule().run(),
    convertible: false,
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Add a simple table.',
    icon: '▦',
    keywords: ['table', 'grid', 'rows', 'columns'],
    apply: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    convertible: false,
  },
  {
    id: 'image',
    title: 'Image',
    description: 'Embed an image from a link or a file path.',
    icon: '🖼',
    keywords: ['image', 'picture', 'photo', 'img', 'media'],
    apply: (editor) => editor.chain().focus().insertContent({ type: 'image', attrs: { src: '' } }).run(),
    convertible: false,
  },
];

export const CONVERTIBLE_TYPES = BLOCK_TYPES.filter((type) => type.convertible);

/** The convertible type matching the current selection, used as the "Turn into" label. */
export function currentBlockType(editor: Editor): BlockType | undefined {
  const order = ['taskList', 'orderedList', 'bulletList', 'callout', 'blockquote', 'codeBlock', 'h1', 'h2', 'h3', 'paragraph'];
  for (const id of order) {
    const type = CONVERTIBLE_TYPES.find((candidate) => candidate.id === id);
    if (type?.isActive?.(editor)) {
      return type;
    }
  }
  return undefined;
}

export function filterBlockTypes(query: string): BlockType[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return BLOCK_TYPES;
  }
  const scored = BLOCK_TYPES.map((type) => {
    const title = type.title.toLowerCase();
    let score = -1;
    if (title.startsWith(q)) {
      score = 3;
    } else if (type.keywords.some((keyword) => keyword.startsWith(q))) {
      score = 2;
    } else if (title.includes(q) || type.keywords.some((keyword) => keyword.includes(q))) {
      score = 1;
    }
    return { type, score };
  });
  return scored
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.type);
}
