import type { Extensions } from '@tiptap/core';
import { Placeholder, TrailingNode, UndoRedo } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { getMdotionExtensions } from '../../../src/markdown/mdotionExtensions';
import { CalloutView } from '../nodeviews/CalloutView';
import { CodeBlockView } from '../nodeviews/CodeBlockView';
import { htmlInlineView } from '../nodeviews/htmlInlineView';
import { ImageView } from '../nodeviews/ImageView';
import { RawBlockView } from '../nodeviews/RawBlockView';
import { BlockSelectionExtension } from './BlockSelection';
import { MarkdownClipboard } from './MarkdownClipboard';
import { NotionKeymap } from './NotionKeymap';
import { SlashCommand } from './slash/SlashCommandExtension';

export function createEditorExtensions(): Extensions {
  return [
    ...getMdotionExtensions({
      codeBlock: ReactNodeViewRenderer(CodeBlockView),
      image: ReactNodeViewRenderer(ImageView),
      callout: ReactNodeViewRenderer(CalloutView),
      rawBlock: ReactNodeViewRenderer(RawBlockView),
      htmlInline: htmlInlineView,
    }),
    // The webview owns fine-grained undo (see ADR-003); edits reach the IDE as plain text changes.
    UndoRedo.configure({ depth: 500, newGroupDelay: 600 }),
    TrailingNode,
    Placeholder.configure({
      includeChildren: true,
      showOnlyCurrent: true,
      placeholder: ({ node, editor }) => {
        if (node.type.name === 'heading') {
          return `Heading ${String(node.attrs.level)}`;
        }
        if (node.type.name !== 'paragraph') {
          return '';
        }
        if (editor.isActive('taskItem')) {
          return 'To-do';
        }
        if (editor.isActive('listItem')) {
          return 'List';
        }
        if (editor.isActive('blockquote') || editor.isActive('callout')) {
          return 'Type something…';
        }
        if (editor.isActive('table')) {
          return '';
        }
        return "Write something, or press '/' for commands…";
      },
    }),
    SlashCommand,
    BlockSelectionExtension,
    NotionKeymap,
    MarkdownClipboard,
  ];
}
