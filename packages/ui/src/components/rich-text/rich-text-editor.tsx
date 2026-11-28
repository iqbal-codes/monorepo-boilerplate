"use client";

import * as React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import { history } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "cn";

import { RichTextBubbleMenu } from "./rich-text-bubble-menu";
import { RichTextToolbar } from "./rich-text-toolbar";
import { normalizeRichTextContent, RICH_TEXT_PROSE_CLASSES, sanitizeLinkHref } from "./serialize";
import { createSlashCommandExtension } from "./slash-command";
import type { JSONContent, RichTextEditorProps } from "./types";

const PLACEHOLDER_CLASSES = [
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-start",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
].join(" ");

// ProseMirror's history factory shares one PluginKey across its instances.
const historyKey = history().spec.key;

/**
 * Controlled ProseMirror/Tiptap rich-text editor styled with `base-sera` tokens.
 * Canonical value boundary is `JSONContent` (never raw HTML).
 */
export function RichTextEditor({
  id,
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder = "Write something, or type '/' for commands…",
  disabled = false,
  readOnly = false,
  toolbar = true,
  bubbleMenu = true,
  slashCommands = true,
  className,
  editorClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: RichTextEditorProps) {
  const generatedId = React.useId();
  const editorId = id ?? `rich-text-${generatedId}`;
  const isEditable = !disabled && !readOnly;
  const isControlled = value !== undefined;
  const initialContent = React.useMemo(
    () => normalizeRichTextContent(value === undefined ? defaultValue : value),
    // Initial snapshot only; controlled updates sync via `useEffect` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const lastSerializedRef = React.useRef<string>(JSON.stringify(initialContent));
  const placeholderRef = React.useRef(placeholder);
  placeholderRef.current = placeholder;

  const extensions = React.useMemo(() => {
    const base = [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => sanitizeLinkHref(url) !== null,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
    ];

    if (slashCommands) {
      base.push(createSlashCommandExtension());
    }

    return base;
  }, [slashCommands]);

  const editorAttributes = React.useMemo<Record<string, string>>(() => {
    const attrs: Record<string, string> = {
      id: editorId,
      role: "textbox",
      "aria-multiline": "true",
      tabindex: disabled ? "-1" : "0",
    };
    if (ariaLabel) attrs["aria-label"] = ariaLabel;
    if (ariaLabelledBy) attrs["aria-labelledby"] = ariaLabelledBy;
    if (ariaDescribedBy) attrs["aria-describedby"] = ariaDescribedBy;
    if (ariaInvalid) attrs["aria-invalid"] = "true";
    if (disabled) attrs["aria-disabled"] = "true";
    if (readOnly) attrs["aria-readonly"] = "true";
    return attrs;
  }, [editorId, disabled, readOnly, ariaLabel, ariaLabelledBy, ariaDescribedBy, ariaInvalid]);

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: isEditable,
    editorProps: {
      attributes: editorAttributes,
    },
    onUpdate: ({ editor: instance }) => {
      const json = instance.getJSON();
      lastSerializedRef.current = JSON.stringify(json);
      onChange?.(json);
    },
    onBlur: () => {
      onBlur?.();
    },
  });

  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isEditable !== isEditable) {
      editor.setEditable(isEditable, false);
    }
  }, [editor, isEditable]);

  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        attributes: editorAttributes,
      },
    });
  }, [editor, editorAttributes]);

  React.useEffect(() => {
    if (!editor || editor.isDestroyed || !isControlled) return;
    const normalized = normalizeRichTextContent(value);
    const nextSerialized = JSON.stringify(normalized);
    if (nextSerialized === lastSerializedRef.current) return;

    const currentSerialized = JSON.stringify(editor.getJSON());
    if (nextSerialized === currentSerialized) {
      lastSerializedRef.current = nextSerialized;
      return;
    }

    lastSerializedRef.current = nextSerialized;

    // External replacements (including form resets) start a new undo/redo history.
    // Excluding the replacement alone would leave the previous document's history mapped in.
    const historyPlugin = historyKey?.get(editor.state);
    if (historyKey && historyPlugin) {
      const { plugins } = editor.state;
      editor.unregisterPlugin(historyKey);
      editor.registerPlugin(historyPlugin, () => [...plugins]);
    }
    editor
      .chain()
      .setMeta("addToHistory", false)
      .setContent(normalized, { emitUpdate: false })
      .run();
  }, [editor, isControlled, value]);

  return (
    <div
      data-slot="rich-text-editor"
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-invalid={ariaInvalid || undefined}
      className={cn(
        "flex w-full min-w-0 flex-col rounded-none border border-input bg-background transition-[color,border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:bg-muted/40 data-[disabled=true]:opacity-60 data-[invalid=true]:border-destructive data-[invalid=true]:ring-destructive/20 dark:bg-input/30 dark:data-[invalid=true]:ring-destructive/40",
        className,
      )}
    >
      {toolbar ? (
        <RichTextToolbar
          editor={editor}
          editorId={editorId}
          disabled={disabled}
          readOnly={readOnly}
        />
      ) : null}

      {editor && typeof document !== "undefined" && bubbleMenu && isEditable ? (
        <RichTextBubbleMenu editor={editor} />
      ) : null}

      <div
        className={cn(
          "min-h-36 w-full min-w-0 px-3 py-2.5",
          RICH_TEXT_PROSE_CLASSES,
          PLACEHOLDER_CLASSES,
          "[&_.ProseMirror]:min-h-32 [&_.ProseMirror]:outline-none",
          editorClassName,
        )}
      >
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div
            id={editorId}
            role="textbox"
            aria-multiline="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-disabled={disabled || undefined}
            aria-readonly={readOnly || undefined}
            className="min-h-32 text-sm text-muted-foreground"
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

export type { JSONContent };
