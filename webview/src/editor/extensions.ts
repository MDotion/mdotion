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
import { SectionFolding } from './outline/SectionFolding';
import { SlashCommand } from './slash/SlashCommandExtension';
import { MdotionTableView } from './table/columnWidths';
import { TableBehaviour } from './table/TableBehaviour';

export function createEditorExtensions(): Extensions {
  return [
    ...getMdotionExtensions({
      codeBlock: ReactNodeViewRenderer(CodeBlockView),
      image: ReactNodeViewRenderer(ImageView),
      callout: ReactNodeViewRenderer(CalloutView),
      rawBlock: ReactNodeViewRenderer(RawBlockView),
      htmlInline: htmlInlineView,
      // Column widths are view state, so the table view is ours (see columnWidths.ts).
      table: ({ node, view, getPos }) => new MdotionTableView(node, view, getPos),
    }),
    // The webview owns fine-grained undo (see ADR-003); edits reach the IDE as plain text changes.
    UndoRedo.configure({ depth: 500, newGroupDelay: 600 }),
    TrailingNode,
    Placeholder.configure({
      includeChildren: true,
      showOnlyCurrent: true,
      // Only the node decides the text here: the plugin can call this while the editor
      // still holds the previous selection. The container (list, to-do, quote, callout,
      // table cell) is picked in CSS from the live DOM (notion.css, "Placeholders").
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') {
          return `Heading ${String(node.attrs.level)}`;
        }
        return node.type.name === 'paragraph' ? "Write something, or press '/' for commands…" : '';
      },
    }),
    SlashCommand,
    TableBehaviour,
    SectionFolding,
    BlockSelectionExtension,
    NotionKeymap,
    MarkdownClipboard,
  ];
}
