import * as React from "react";
import type { JSONContent } from "@tiptap/core";
import { cn } from "cn";

import { isRichTextEmpty, RICH_TEXT_PROSE_CLASSES, sanitizeLinkHref } from "./serialize";
import type { RichTextViewerProps } from "./types";

type JSONMark = NonNullable<JSONContent["marks"]>[number];

function renderMarkedText(
  text: string,
  marks: ReadonlyArray<JSONMark> | undefined,
  key: React.Key,
): React.ReactNode {
  if (!marks || marks.length === 0) {
    return text;
  }

  let element: React.ReactNode = text;

  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    if (!mark) continue;

    switch (mark.type) {
      case "code":
        element = <code key={`${key}-code-${i}`}>{element}</code>;
        break;
      case "bold":
        element = <strong key={`${key}-bold-${i}`}>{element}</strong>;
        break;
      case "italic":
        element = <em key={`${key}-italic-${i}`}>{element}</em>;
        break;
      case "strike":
        element = <s key={`${key}-strike-${i}`}>{element}</s>;
        break;
      case "underline":
        element = (
          <span key={`${key}-underline-${i}`} className="underline underline-offset-2">
            {element}
          </span>
        );
        break;
      case "link": {
        const safeHref = sanitizeLinkHref(mark.attrs?.href);
        if (safeHref) {
          element = (
            <a
              key={`${key}-link-${i}`}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {element}
            </a>
          );
        }
        break;
      }
      default:
        break;
    }
  }

  return element;
}

function renderInlineNodes(
  nodes: ReadonlyArray<JSONContent> | undefined,
  keyPrefix: string,
): React.ReactNode {
  if (!nodes || nodes.length === 0) return null;

  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") {
      return (
        <React.Fragment key={key}>
          {renderMarkedText(node.text ?? "", node.marks, key)}
        </React.Fragment>
      );
    }
    if (node.type === "hardBreak") {
      return <br key={key} />;
    }
    return <React.Fragment key={key}>{renderNode(node, key)}</React.Fragment>;
  });
}

function renderHeading(node: JSONContent, key: string): React.ReactNode {
  const rawLevel = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
  const level = Math.min(6, Math.max(1, rawLevel));
  const children = renderInlineNodes(node.content, key);

  switch (level) {
    case 1:
      return <h1 key={key}>{children}</h1>;
    case 2:
      return <h2 key={key}>{children}</h2>;
    case 3:
      return <h3 key={key}>{children}</h3>;
    case 4:
      return <h4 key={key}>{children}</h4>;
    case 5:
      return <h5 key={key}>{children}</h5>;
    default:
      return <h6 key={key}>{children}</h6>;
  }
}

function renderNode(node: JSONContent, key: string): React.ReactNode {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map((child, idx) => renderNode(child, `${key}-${idx}`));
    case "paragraph": {
      const hasChildren = Array.isArray(node.content) && node.content.length > 0;
      return <p key={key}>{hasChildren ? renderInlineNodes(node.content, key) : <br />}</p>;
    }
    case "heading":
      return renderHeading(node, key);
    case "bulletList":
      return (
        <ul key={key}>
          {(node.content ?? []).map((child, idx) => renderNode(child, `${key}-li-${idx}`))}
        </ul>
      );
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : undefined;
      return (
        <ol key={key} start={start}>
          {(node.content ?? []).map((child, idx) => renderNode(child, `${key}-li-${idx}`))}
        </ol>
      );
    }
    case "listItem":
      return (
        <li key={key}>
          {(node.content ?? []).map((child, idx) => renderNode(child, `${key}-c-${idx}`))}
        </li>
      );
    case "blockquote":
      return (
        <blockquote key={key}>
          {(node.content ?? []).map((child, idx) => renderNode(child, `${key}-bq-${idx}`))}
        </blockquote>
      );
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" ? node.attrs.language.trim() : "";
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      return (
        <pre key={key} data-language={language || undefined}>
          <code>{code}</code>
        </pre>
      );
    }
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "text":
      return (
        <React.Fragment key={key}>
          {renderMarkedText(node.text ?? "", node.marks, key)}
        </React.Fragment>
      );
    default:
      return Array.isArray(node.content)
        ? node.content.map((child, idx) => renderNode(child, `${key}-u-${idx}`))
        : null;
  }
}

/**
 * Pure React AST renderer over ProseMirror `JSONContent`.
 * Never uses `dangerouslySetInnerHTML` or raw HTML strings.
 */
export function RichTextViewer({ value, emptyFallback, className }: RichTextViewerProps) {
  if (isRichTextEmpty(value)) {
    if (!emptyFallback) return null;
    return (
      <div
        data-slot="rich-text-viewer"
        data-empty="true"
        className={cn("text-sm text-muted-foreground", className)}
      >
        {emptyFallback}
      </div>
    );
  }

  return (
    <div data-slot="rich-text-viewer" className={cn(RICH_TEXT_PROSE_CLASSES, className)}>
      {value ? renderNode(value, "doc") : null}
    </div>
  );
}
