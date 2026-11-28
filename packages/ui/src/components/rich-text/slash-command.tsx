import * as React from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { cn } from "cn";

import type { SlashCommandItem } from "./types";

export const DEFAULT_SLASH_COMMANDS: ReadonlyArray<SlashCommandItem> = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain body paragraph",
    keywords: ["paragraph", "text", "normal"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["h1", "title", "heading"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "subtitle", "heading"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["h3", "subheading", "heading"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    id: "bullet-list",
    label: "Bullet list",
    description: "Unordered bulleted list",
    keywords: ["ul", "bullets", "list"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: "ordered-list",
    label: "Ordered list",
    description: "Numbered list",
    keywords: ["ol", "numbered", "list"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: "blockquote",
    label: "Blockquote",
    description: "Highlighted quote block",
    keywords: ["quote", "callout"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    id: "code-block",
    label: "Code block",
    description: "Monospace fenced code",
    keywords: ["code", "pre", "snippet"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    id: "horizontal-rule",
    label: "Divider",
    description: "Horizontal rule",
    keywords: ["hr", "separator", "line"],
    run: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

export type SlashCommandMenuHandle = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

const SlashCommandMenuList = React.forwardRef<
  SlashCommandMenuHandle,
  SuggestionProps<SlashCommandItem, SlashCommandItem>
>(function SlashCommandMenuList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    },
    [items, command],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }),
    [items.length, selectItem, selectedIndex],
  );

  return (
    <div
      role="listbox"
      aria-label="Insert block"
      data-slot="rich-text-slash-menu"
      className="z-50 flex max-h-72 w-64 flex-col gap-0.5 overflow-y-auto rounded-none border border-border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items.length === 0 ? (
        <div className="px-2.5 py-2 text-xs text-muted-foreground">No matching blocks</div>
      ) : (
        items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onMouseDown={(event) => {
                event.preventDefault();
                selectItem(index);
              }}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-none px-2.5 py-1.5 text-left transition-colors outline-none",
                isSelected
                  ? "bg-muted text-foreground"
                  : "text-popover-foreground hover:bg-muted/60",
              )}
            >
              <span className="text-xs font-medium">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </button>
          );
        })
      )}
    </div>
  );
});

export function filterSlashCommands(
  items: ReadonlyArray<SlashCommandItem>,
  query: string,
): SlashCommandItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...items];

  return items.filter((item) => {
    if (item.label.toLowerCase().includes(normalized)) return true;
    if (item.description.toLowerCase().includes(normalized)) return true;
    return item.keywords?.some((kw) => kw.toLowerCase().includes(normalized)) ?? false;
  });
}

export function createSlashCommandExtension(
  commands: ReadonlyArray<SlashCommandItem> = DEFAULT_SLASH_COMMANDS,
) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem, SlashCommandItem>({
          editor: this.editor,
          char: "/",
          items: ({ query }) => filterSlashCommands(commands, query),
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: SlashCommandItem;
          }) => {
            props.run({ editor, range });
          },
          render: () => {
            let renderer: ReactRenderer<
              SlashCommandMenuHandle,
              SuggestionProps<SlashCommandItem, SlashCommandItem>
            > | null = null;
            let unmountFloating: (() => void) | null = null;

            return {
              onStart: (props) => {
                if (typeof document === "undefined") return;
                renderer = new ReactRenderer(SlashCommandMenuList, {
                  props,
                  editor: props.editor,
                });
                if (typeof props.mount === "function") {
                  unmountFloating = props.mount(renderer.element);
                }
              },
              onUpdate: (props) => {
                renderer?.updateProps(props);
              },
              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  unmountFloating?.();
                  unmountFloating = null;
                  renderer?.destroy();
                  renderer = null;
                  return true;
                }
                return renderer?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                unmountFloating?.();
                unmountFloating = null;
                renderer?.destroy();
                renderer = null;
              },
            };
          },
        }),
      ];
    },
  });
}
