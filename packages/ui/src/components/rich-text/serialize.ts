import type { JSONContent } from "@tiptap/core";

import { EMPTY_RICH_TEXT_DOC } from "./types";

type JSONMark = NonNullable<JSONContent["marks"]>[number];

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Sanitizes link URLs for both Markdown serialization and React anchor rendering.
 * Rejects `javascript:`, `data:`, `vbscript:`, and malformed schemes.
 */
export function sanitizeLinkHref(rawHref: unknown): string | null {
  if (typeof rawHref !== "string") return null;
  const trimmed = rawHref.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Normalizes any nullable/partial value into a valid ProseMirror `doc` node.
 */
export function normalizeRichTextContent(value: JSONContent | null | undefined): JSONContent {
  if (!value || typeof value !== "object" || value.type !== "doc") {
    return EMPTY_RICH_TEXT_DOC;
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    return EMPTY_RICH_TEXT_DOC;
  }
  return value;
}

/**
 * Shared inline-prose typography classes used by both `RichTextEditor` and `RichTextViewer`.
 */
export const RICH_TEXT_PROSE_CLASSES = [
  "text-sm leading-relaxed wrap-anywhere text-foreground",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-heading [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1:first-child]:mt-0",
  "[&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2:first-child]:mt-0",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-heading [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0",
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:ps-5",
  "[&_li]:my-0.5 [&_li>p]:my-0.5",
  "[&_blockquote]:my-3 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-relaxed",
  "[&_:not(pre)>code]:border [&_:not(pre)>code]:border-border [&_:not(pre)>code]:bg-muted/60 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-xs",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary/80",
  "[&_hr]:my-4 [&_hr]:border-border",
].join(" ");

function extractRawText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (!Array.isArray(node.content)) return "";
  return node.content.map(extractRawText).join("");
}

function serializePlainInline(nodes: ReadonlyArray<JSONContent> | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") return node.text ?? "";
      if (node.type === "hardBreak") return "\n";
      return serializePlainInline(node.content);
    })
    .join("");
}

function serializePlainListItem(item: JSONContent, prefix: string, indentLevel: number): string {
  const indent = "  ".repeat(indentLevel);
  const children = item.content ?? [];
  const lines: string[] = [];

  for (const child of children) {
    if (child.type === "bulletList" || child.type === "orderedList") {
      const nested = serializePlainList(child, indentLevel + 1);
      if (nested) lines.push(nested);
    } else {
      const text = serializePlainBlock(child, indentLevel).trimEnd();
      if (lines.length === 0) {
        lines.push(`${indent}${prefix}${text}`);
      } else if (text) {
        lines.push(`${indent}  ${text}`);
      }
    }
  }

  if (lines.length === 0) {
    return `${indent}${prefix}`.trimEnd();
  }
  return lines.join("\n");
}

function serializePlainList(node: JSONContent, indentLevel: number): string {
  const items = node.content ?? [];
  const isOrdered = node.type === "orderedList";
  const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;

  return items
    .filter((item) => item.type === "listItem")
    .map((item, idx) => {
      const prefix = isOrdered ? `${start + idx}. ` : "- ";
      return serializePlainListItem(item, prefix, indentLevel);
    })
    .filter(Boolean)
    .join("\n");
}

function serializePlainBlock(node: JSONContent, indentLevel = 0): string {
  switch (node.type) {
    case "paragraph":
    case "heading":
      return serializePlainInline(node.content);
    case "codeBlock":
      return extractRawText(node);
    case "blockquote":
      return (node.content ?? [])
        .map((child) => serializePlainBlock(child, indentLevel))
        .filter((part) => part.length > 0)
        .join("\n\n");
    case "bulletList":
    case "orderedList":
      return serializePlainList(node, indentLevel);
    case "horizontalRule":
      return "";
    default:
      return Array.isArray(node.content)
        ? node.content.map((child) => serializePlainBlock(child, indentLevel)).join("\n\n")
        : serializePlainInline([node]);
  }
}

/**
 * Deterministically converts ProseMirror `JSONContent` into plain text.
 */
export function toPlainText(doc: JSONContent | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  return doc.content
    .map((block) => serializePlainBlock(block))
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

/**
 * Returns `true` when the document has no meaningful text or divider nodes.
 */
export function isRichTextEmpty(doc: JSONContent | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) {
    return true;
  }
  if (toPlainText(doc).trim().length > 0) {
    return false;
  }
  return !doc.content.some((node) => node.type === "horizontalRule");
}

function wrapInlineCode(text: string): string {
  const matches = text.match(/`+/g);
  const maxRun = matches ? Math.max(...matches.map((m) => m.length)) : 0;
  const fence = "`".repeat(maxRun + 1);
  const needsPadding = text.startsWith("`") || text.endsWith("`");
  return needsPadding ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

function escapeMarkdownText(text: string): string {
  return text
    .replace(/[\\`*_~[\]#!+|=-]/g, "\\$&")
    .replace(/(\d)([.)])(?=\s)/g, "$1\\$2")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function applyMarkdownMarks(text: string, marks: ReadonlyArray<JSONMark> | undefined): string {
  if (!text) return text;
  const markMap = new Map(marks?.map((mark) => [mark.type, mark]));
  let output = markMap.has("code") ? wrapInlineCode(text) : escapeMarkdownText(text);

  if (markMap.has("bold")) {
    output = `**${output}**`;
  }
  if (markMap.has("italic")) {
    output = `*${output}*`;
  }
  if (markMap.has("strike")) {
    output = `~~${output}~~`;
  }

  const linkMark = markMap.get("link");
  if (linkMark) {
    const safeHref = sanitizeLinkHref(linkMark.attrs?.href);
    if (safeHref) {
      const destination = safeHref
        .replace(/[\s\\<>]/g, (char) => encodeURIComponent(char))
        .replace(/[()]/g, "\\$&")
        .replaceAll("&", "&amp;");
      output = `[${output}](${destination})`;
    }
  }

  return output;
}

function serializeMarkdownInline(nodes: ReadonlyArray<JSONContent> | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return applyMarkdownMarks(node.text ?? "", node.marks);
      }
      if (node.type === "hardBreak") {
        return "  \n";
      }
      return serializeMarkdownInline(node.content);
    })
    .join("");
}

function encodeLeadingListWhitespace(line: string): string {
  return line.replace(/^[ \t]+/, (whitespace) =>
    whitespace.replaceAll(" ", "&#32;").replaceAll("\t", "&#9;"),
  );
}

function serializeMarkdownListItem(item: JSONContent, prefix: string): string {
  const indent = " ".repeat(prefix.length);
  const lines: string[] = [];
  let hasContent = false;

  for (const child of item.content ?? []) {
    const block = serializeMarkdownBlock(child);
    const [rawFirst = "", ...rest] = block.split("\n");
    const first = child.type === "paragraph" ? encodeLeadingListWhitespace(rawFirst) : rawFirst;
    if (lines.length === 0) {
      lines.push(first ? `${prefix}${first}` : prefix.trimEnd());
    } else if (block) {
      // CommonMark can't interrupt a paragraph with an ordered list starting above 1,
      // and reads an adjacent `---` as a setext underline. Leave a block boundary,
      // but never put a blank line immediately after an empty list marker.
      if (
        hasContent &&
        (child.type === "paragraph" ||
          child.type === "orderedList" ||
          child.type === "horizontalRule")
      ) {
        lines.push("");
      }
      lines.push(first ? `${indent}${first}` : "");
    }
    lines.push(...rest.map((line) => (line ? `${indent}${line}` : "")));
    hasContent ||= first.trim().length > 0 || rest.some((line) => line.trim().length > 0);
  }

  return lines.length ? lines.join("\n") : prefix.trimEnd();
}

function serializeMarkdownList(node: JSONContent): string {
  const items = node.content ?? [];
  const isOrdered = node.type === "orderedList";
  const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;

  return items
    .filter((item) => item.type === "listItem")
    .map((item, idx) => {
      const prefix = isOrdered ? `${start + idx}. ` : "- ";
      return serializeMarkdownListItem(item, prefix);
    })
    .filter(Boolean)
    .join("\n");
}

function serializeMarkdownBlock(node: JSONContent): string {
  switch (node.type) {
    case "heading": {
      const rawLevel = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      const level = Math.min(6, Math.max(1, rawLevel));
      return `${"#".repeat(level)} ${serializeMarkdownInline(node.content)}`.trimEnd();
    }
    case "paragraph":
      return serializeMarkdownInline(node.content);
    case "blockquote": {
      const inner = (node.content ?? [])
        .map(serializeMarkdownBlock)
        .filter((part) => part.length > 0)
        .join("\n\n");
      if (!inner) return ">";
      return inner
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n");
    }
    case "codeBlock": {
      const code = extractRawText(node);
      const language = typeof node.attrs?.language === "string" ? node.attrs.language.trim() : "";
      const fenceRuns = code.match(/`{3,}/g);
      const maxFence = fenceRuns ? Math.max(...fenceRuns.map((f) => f.length)) : 2;
      const fence = "`".repeat(Math.max(3, maxFence + 1));
      const info = /^[\w+-]+$/.test(language) ? language : "";
      return `${fence}${info}\n${code}\n${fence}`;
    }
    case "bulletList":
    case "orderedList":
      return serializeMarkdownList(node);
    case "horizontalRule":
      return "---";
    default:
      return Array.isArray(node.content)
        ? node.content.map(serializeMarkdownBlock).join("\n\n")
        : serializeMarkdownInline([node]);
  }
}

/**
 * Deterministically converts ProseMirror `JSONContent` into Markdown (without raw HTML).
 */
export function toMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  return doc.content
    .map((block) => serializeMarkdownBlock(block))
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}
