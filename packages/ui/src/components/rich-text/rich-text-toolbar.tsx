import * as React from "react";
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  BoldIcon,
  Code2Icon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  Undo2Icon,
} from "lucide-react";

import { RichTextLinkPopover } from "./link-popover";

const TOOLBAR_BUTTON_CLASSES =
  "inline-flex min-h-7 min-w-7 items-center justify-center rounded-none border border-transparent px-1.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring aria-pressed:border-border aria-pressed:bg-muted aria-pressed:text-foreground disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0";

type ToolbarEditorState = {
  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
  isCode: boolean;
  isLink: boolean;
  isH1: boolean;
  isH2: boolean;
  isH3: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isBlockquote: boolean;
  isCodeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

const EMPTY_TOOLBAR_STATE: ToolbarEditorState = {
  isBold: false,
  isItalic: false,
  isStrike: false,
  isCode: false,
  isLink: false,
  isH1: false,
  isH2: false,
  isH3: false,
  isBulletList: false,
  isOrderedList: false,
  isBlockquote: false,
  isCodeBlock: false,
  canUndo: false,
  canRedo: false,
};

function ToolbarToggleButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ToolbarPrimitive.Button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      focusableWhenDisabled
      onClick={onClick}
      className={TOOLBAR_BUTTON_CLASSES}
    >
      {children}
    </ToolbarPrimitive.Button>
  );
}

function ToolbarActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ToolbarPrimitive.Button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      focusableWhenDisabled
      onClick={onClick}
      className={TOOLBAR_BUTTON_CLASSES}
    >
      {children}
    </ToolbarPrimitive.Button>
  );
}

export function RichTextToolbar({
  editor,
  editorId,
  disabled,
  readOnly,
}: {
  editor: Editor | null;
  editorId: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const activeState = useEditorState({
    editor,
    selector: (ctx): ToolbarEditorState => {
      const current = ctx.editor;
      if (!current) return EMPTY_TOOLBAR_STATE;
      return {
        isBold: current.isActive("bold"),
        isItalic: current.isActive("italic"),
        isStrike: current.isActive("strike"),
        isCode: current.isActive("code"),
        isLink: current.isActive("link"),
        isH1: current.isActive("heading", { level: 1 }),
        isH2: current.isActive("heading", { level: 2 }),
        isH3: current.isActive("heading", { level: 3 }),
        isBulletList: current.isActive("bulletList"),
        isOrderedList: current.isActive("orderedList"),
        isBlockquote: current.isActive("blockquote"),
        isCodeBlock: current.isActive("codeBlock"),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const state = activeState ?? EMPTY_TOOLBAR_STATE;
  const controlsDisabled = Boolean(disabled || readOnly || !editor);

  return (
    <ToolbarPrimitive.Root
      aria-label="Formatting"
      aria-controls={editorId}
      disabled={controlsDisabled}
      data-slot="rich-text-toolbar"
      className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-1.5"
    >
      <ToolbarPrimitive.Group
        aria-label="Inline formatting"
        className="flex flex-wrap items-center gap-0.5"
      >
        <ToolbarToggleButton
          label="Bold"
          pressed={state.isBold}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <BoldIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Italic"
          pressed={state.isItalic}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Strikethrough"
          pressed={state.isStrike}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Inline code"
          pressed={state.isCode}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <CodeIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <RichTextLinkPopover
          editor={editor}
          active={state.isLink}
          disabled={controlsDisabled}
          trigger={
            <ToolbarPrimitive.Button
              type="button"
              aria-label="Link"
              title="Link"
              aria-pressed={state.isLink}
              disabled={controlsDisabled}
              focusableWhenDisabled
              className={TOOLBAR_BUTTON_CLASSES}
            >
              <Link2Icon aria-hidden="true" />
            </ToolbarPrimitive.Button>
          }
        />
      </ToolbarPrimitive.Group>

      <ToolbarPrimitive.Separator className="mx-0.5 h-5 w-0 shrink-0 border-s border-border" />

      <ToolbarPrimitive.Group aria-label="Headings" className="flex flex-wrap items-center gap-0.5">
        <ToolbarToggleButton
          label="Heading 1"
          pressed={state.isH1}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1Icon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Heading 2"
          pressed={state.isH2}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2Icon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Heading 3"
          pressed={state.isH3}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3Icon aria-hidden="true" />
        </ToolbarToggleButton>
      </ToolbarPrimitive.Group>

      <ToolbarPrimitive.Separator className="mx-0.5 h-5 w-0 shrink-0 border-s border-border" />

      <ToolbarPrimitive.Group aria-label="Blocks" className="flex flex-wrap items-center gap-0.5">
        <ToolbarToggleButton
          label="Bullet list"
          pressed={state.isBulletList}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <ListIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Ordered list"
          pressed={state.isOrderedList}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Blockquote"
          pressed={state.isBlockquote}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarToggleButton
          label="Code block"
          pressed={state.isCodeBlock}
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <Code2Icon aria-hidden="true" />
        </ToolbarToggleButton>
        <ToolbarActionButton
          label="Divider"
          disabled={controlsDisabled}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        >
          <MinusIcon aria-hidden="true" />
        </ToolbarActionButton>
      </ToolbarPrimitive.Group>

      <ToolbarPrimitive.Separator className="mx-0.5 h-5 w-0 shrink-0 border-s border-border" />

      <ToolbarPrimitive.Group aria-label="History" className="flex flex-wrap items-center gap-0.5">
        <ToolbarActionButton
          label="Undo"
          disabled={controlsDisabled || !state.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2Icon aria-hidden="true" />
        </ToolbarActionButton>
        <ToolbarActionButton
          label="Redo"
          disabled={controlsDisabled || !state.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2Icon aria-hidden="true" />
        </ToolbarActionButton>
      </ToolbarPrimitive.Group>
    </ToolbarPrimitive.Root>
  );
}
