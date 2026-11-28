import * as React from "react";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { BoldIcon, CodeIcon, ItalicIcon, Link2Icon, StrikethroughIcon } from "lucide-react";

import { RichTextLinkPopover } from "./link-popover";

const BUBBLE_BUTTON_CLASSES =
  "inline-flex size-7 items-center justify-center rounded-none text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring aria-pressed:bg-muted aria-pressed:text-foreground [&_svg]:pointer-events-none [&_svg]:size-3.5";

type BubbleState = {
  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
  isCode: boolean;
  isLink: boolean;
};

const EMPTY_BUBBLE_STATE: BubbleState = {
  isBold: false,
  isItalic: false,
  isStrike: false,
  isCode: false,
  isLink: false,
};

export function RichTextBubbleMenu({ editor }: { editor: Editor }) {
  const activeState = useEditorState({
    editor,
    selector: (ctx): BubbleState => ({
      isBold: ctx.editor.isActive("bold"),
      isItalic: ctx.editor.isActive("italic"),
      isStrike: ctx.editor.isActive("strike"),
      isCode: ctx.editor.isActive("code"),
      isLink: ctx.editor.isActive("link"),
    }),
  });

  const state = activeState ?? EMPTY_BUBBLE_STATE;

  // Keep `shouldShow` referentially stable so `<BubbleMenu>` does not dispatch
  // `updateOptions` transactions on every render before controlled `value` syncs.
  const shouldShow = React.useCallback(
    ({ editor: currentEditor, state: editorState }: { editor: Editor; state: EditorState }) =>
      currentEditor.isEditable &&
      !editorState.selection.empty &&
      !currentEditor.isActive("codeBlock"),
    [],
  );

  return (
    <BubbleMenu editor={editor} shouldShow={shouldShow}>
      <div
        role="toolbar"
        aria-label="Selection formatting"
        data-slot="rich-text-bubble-menu"
        className="flex items-center gap-0.5 rounded-none border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <button
          type="button"
          aria-label="Bold"
          title="Bold"
          aria-pressed={state.isBold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={BUBBLE_BUTTON_CLASSES}
        >
          <BoldIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          title="Italic"
          aria-pressed={state.isItalic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={BUBBLE_BUTTON_CLASSES}
        >
          <ItalicIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Strikethrough"
          title="Strikethrough"
          aria-pressed={state.isStrike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={BUBBLE_BUTTON_CLASSES}
        >
          <StrikethroughIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Inline code"
          title="Inline code"
          aria-pressed={state.isCode}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={BUBBLE_BUTTON_CLASSES}
        >
          <CodeIcon aria-hidden="true" />
        </button>
        <RichTextLinkPopover
          editor={editor}
          active={state.isLink}
          trigger={
            <button
              type="button"
              aria-label="Link"
              title="Link"
              aria-pressed={state.isLink}
              className={BUBBLE_BUTTON_CLASSES}
            >
              <Link2Icon aria-hidden="true" />
            </button>
          }
        />
      </div>
    </BubbleMenu>
  );
}
