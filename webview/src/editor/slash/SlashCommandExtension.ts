import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { SlashMenu, type SlashMenuHandle } from '../../components/SlashMenu';
import { filterBlockTypes, type BlockType } from '../blockTypes';

export const slashPluginKey = new PluginKey('mdotionSlash');

/**
 * Notion slash menu: `/` at the start of a line or after a space, never
 * inside code. Typing filters; no match shows "No results" and Enter falls
 * through to a normal new line.
 */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<BlockType, BlockType>({
        editor: this.editor,
        pluginKey: slashPluginKey,
        char: '/',
        allowSpaces: false,
        allowedPrefixes: [' ', '\u00a0'],
        startOfLine: false,
        placement: 'bottom-start',
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.spec.code) {
            return false;
          }
          return !state.doc.rangeHasMark(range.from, range.to, state.schema.marks.code);
        },
        items: ({ query }) => filterBlockTypes(query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: BlockType }) => {
          editor.chain().focus().deleteRange(range).run();
          props.apply(editor);
        },
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, SuggestionProps<BlockType, BlockType>> | null = null;
          let unmount: (() => void) | null = null;

          const destroy = () => {
            unmount?.();
            renderer?.destroy();
            renderer = null;
            unmount = null;
          };

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              unmount = props.mount(renderer.element);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                destroy();
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: destroy,
          };
        },
      }),
    ];
  },
});
