"use client";

import { useState, type FC } from "react";
import {
  MarkdownTextPrimitive,
  memoizeMarkdownComponents,
  type CodeHeaderProps,
} from "@assistant-ui/react-markdown";
import { cn } from "cn";
import { CheckIcon, CopyIcon } from "lucide-react";
import remarkGfm from "remark-gfm";

import { TooltipIconButton } from "./tooltip-icon-button";

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-mono lowercase">{language || "text"}</span>
      <TooltipIconButton
        tooltip={copied ? "Copied code" : "Copy code"}
        onClick={() => void handleCopy()}
        className="size-7 text-muted-foreground hover:text-foreground"
      >
        {copied ? (
          <CheckIcon aria-hidden="true" className="size-3.5" />
        ) : (
          <CopyIcon aria-hidden="true" className="size-3.5" />
        )}
      </TooltipIconButton>
    </div>
  );
};

const markdownComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn("mt-4 mb-2 text-base font-semibold tracking-tight first:mt-0", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn("mt-3 mb-1.5 text-sm font-semibold tracking-tight first:mt-0", className)}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-2.5 mb-1 text-sm font-medium first:mt-0", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn("my-2 leading-relaxed wrap-break-word first:mt-0 last:mb-0", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "font-medium text-foreground underline decoration-muted-foreground/60 underline-offset-4 hover:decoration-foreground",
        className,
      )}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("my-2 border-s-2 border-border ps-3 text-muted-foreground italic", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn("my-2 ms-5 list-disc space-y-1 [&>li]:leading-relaxed", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn("my-2 ms-5 list-decimal space-y-1 [&>li]:leading-relaxed", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-3 border-border", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="my-2 max-w-full overflow-x-auto border border-border">
      <table className={cn("w-full border-collapse text-start text-xs", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border-b border-border bg-muted/60 px-2.5 py-1.5 text-start font-semibold",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border-b border-border/60 px-2.5 py-1.5 align-top", className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "my-2 overflow-x-auto border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: ({ className, ...props }) => (
    <code
      className={cn(
        "bg-muted/70 px-1 py-0.5 font-mono text-[0.85em] wrap-break-word in-[pre]:bg-transparent in-[pre]:p-0",
        className,
      )}
      {...props}
    />
  ),
  CodeHeader,
});

const remarkPlugins = [remarkGfm];

export function AssistantMarkdownText() {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={remarkPlugins}
      components={markdownComponents}
      className="min-w-0 max-w-full text-sm leading-relaxed text-start wrap-break-word"
    />
  );
}
