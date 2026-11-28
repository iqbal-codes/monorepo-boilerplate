import type * as React from "react";
import type { Editor, JSONContent, Range } from "@tiptap/core";

import type { BaseFieldProps } from "../form/types";

export type { JSONContent };

/**
 * Canonical empty ProseMirror/Tiptap document shape.
 */
export const EMPTY_RICH_TEXT_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type SlashCommandItem = {
  id: string;
  label: string;
  description: string;
  keywords?: ReadonlyArray<string>;
  run: (ctx: { editor: Editor; range: Range }) => void;
};

export type RichTextEditorProps = {
  id?: string;
  value?: JSONContent | null;
  defaultValue?: JSONContent | null;
  onChange?: (value: JSONContent) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  toolbar?: boolean;
  bubbleMenu?: boolean;
  slashCommands?: boolean;
  className?: string;
  editorClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export type RichTextViewerProps = {
  value?: JSONContent | null;
  emptyFallback?: React.ReactNode;
  className?: string;
};

export type RichTextFieldProps = BaseFieldProps &
  Pick<
    RichTextEditorProps,
    "placeholder" | "readOnly" | "toolbar" | "bubbleMenu" | "slashCommands" | "editorClassName"
  >;
