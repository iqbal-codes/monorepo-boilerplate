"use client";

import { useEffect, useState } from "react";
import type * as React from "react";
import {
  ActionBarPrimitive,
  AttachmentPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePartPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
  unstable_useComposerInputHistory,
  useAuiEvent,
  useAuiState,
  type Attachment,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { cn } from "cn";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@monorepo-boilerplate/ui/components/tooltip";

import { AssistantMarkdownText } from "./markdown-text";
import { ShimmerLabel, ThinkingIndicator, useElapsedSeconds } from "./thinking-indicator";
import { AssistantToolFallback, AssistantToolGroup } from "./tool-ui";
import { TooltipIconButton } from "./tooltip-icon-button";

export type AssistantThreadProps = {
  emptyTitle?: string;
  emptyDescription?: string;
  composerAddon?: React.ReactNode;
  toolFallback?: ToolCallMessagePartComponent;
};

type PreviewableAttachment = {
  name: string;
  contentType?: string;
  sizeBytes?: number;
  previewUrl: string | null;
};

function getAttachmentImageSrc(attachment: Attachment): string | null {
  const imagePart = attachment.content?.find(
    (part): part is Extract<typeof part, { type: "image" }> => part.type === "image",
  );
  return imagePart?.image ?? null;
}

function useAttachmentPreviewUrl(attachment: Attachment): string | null {
  const embeddedSrc = getAttachmentImageSrc(attachment);
  const file = attachment.file;
  const isImage =
    attachment.type === "image" || Boolean(attachment.contentType?.startsWith("image/"));
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (embeddedSrc || !file || !isImage) {
      setObjectUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setObjectUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [embeddedSrc, file, isImage]);

  return embeddedSrc ?? objectUrl;
}

function getFileExtensionLabel(name: string, contentType?: string): string {
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) {
    return name.slice(dot + 1, dot + 6).toUpperCase();
  }
  if (contentType?.includes("/")) {
    return contentType.split("/")[1]!.slice(0, 5).toUpperCase();
  }
  return "FILE";
}

function formatByteSize(bytes?: number): string | undefined {
  if (bytes === undefined || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentFileIcon({ contentType, name }: { contentType?: string; name: string }) {
  const ext = getFileExtensionLabel(name, contentType).toLowerCase();
  if (
    contentType?.includes("json") ||
    contentType?.includes("javascript") ||
    contentType?.includes("typescript") ||
    ["ts", "tsx", "js", "jsx", "json", "md", "css", "html"].includes(ext)
  ) {
    return <FileCodeIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (
    contentType?.includes("pdf") ||
    contentType?.startsWith("text/") ||
    ext === "pdf" ||
    ext === "txt"
  ) {
    return <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
}

function AttachmentSquareTile({
  removable = false,
  onPreview,
}: {
  removable?: boolean;
  onPreview: (attachment: PreviewableAttachment) => void;
}) {
  const attachment = useAuiState((s) => s.attachment);
  const previewUrl = useAttachmentPreviewUrl(attachment);
  const isUploading = attachment.status.type === "running";
  const isError = attachment.status.type === "incomplete";
  const errorMessage =
    attachment.status.type === "incomplete" ? attachment.status.message : undefined;
  const extLabel = getFileExtensionLabel(attachment.name, attachment.contentType);
  const sizeLabel = formatByteSize(attachment.file?.size);

  return (
    <AttachmentPrimitive.Root
      data-slot="attachment-square-tile"
      className={cn(
        "group/tile relative aspect-square overflow-hidden border bg-muted/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
        isError ? "border-destructive/60" : "border-border",
      )}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() =>
                onPreview({
                  name: attachment.name,
                  contentType: attachment.contentType,
                  sizeBytes: attachment.file?.size,
                  previewUrl,
                })
              }
              aria-label={previewUrl ? `Preview ${attachment.name}` : `Inspect ${attachment.name}`}
              className="relative flex size-full items-center justify-center overflow-hidden text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={attachment.name}
                  className="block size-full object-cover transition-transform duration-150 group-hover/tile:scale-105 motion-reduce:transition-none"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-between p-1.5 text-center transition-colors group-hover/tile:bg-muted/70">
                  <span className="self-start border border-border bg-background/80 px-1 py-px font-mono text-[9px] leading-none font-medium text-muted-foreground">
                    {extLabel}
                  </span>
                  <AttachmentFileIcon contentType={attachment.contentType} name={attachment.name} />
                  <span className="w-full truncate text-[10px] leading-tight text-foreground">
                    <AttachmentPrimitive.Name />
                  </span>
                </div>
              )}

              {isUploading && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]"
                >
                  <Spinner className="size-4 text-muted-foreground" />
                </div>
              )}

              {isError && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 flex items-center justify-center bg-background/75"
                >
                  <TriangleAlertIcon className="size-4 text-destructive" />
                </div>
              )}
            </button>
          }
        />
        <TooltipContent side="top">
          <div className="max-w-52 space-y-0.5 text-xs">
            <p className="truncate font-medium">{attachment.name}</p>
            {sizeLabel && <p className="text-muted-foreground tabular-nums">{sizeLabel}</p>}
            {errorMessage && <p className="text-destructive">{errorMessage}</p>}
          </div>
        </TooltipContent>
      </Tooltip>

      {removable && (
        <AttachmentPrimitive.Remove
          aria-label={`Remove ${attachment.name || "attachment"}`}
          className="absolute top-1 end-1 z-10 inline-flex size-5 items-center justify-center border border-border bg-background/90 text-foreground opacity-100 shadow-xs transition-[opacity,background-color,color] hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:opacity-0 sm:group-hover/tile:opacity-100 sm:group-focus-within/tile:opacity-100"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
}

function AttachmentPreviewDialog({
  attachment,
  onOpenChange,
}: {
  attachment: PreviewableAttachment | null;
  onOpenChange: (open: boolean) => void;
}) {
  const sizeLabel = formatByteSize(attachment?.sizeBytes);

  return (
    <Dialog open={attachment !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {attachment && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pe-8 font-sans text-sm font-semibold normal-case tracking-normal">
                {attachment.name}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {[attachment.contentType, sizeLabel].filter(Boolean).join(" · ") || "Attachment"}
              </DialogDescription>
            </DialogHeader>

            {attachment.previewUrl ? (
              <div className="flex max-h-[65dvh] items-center justify-center overflow-hidden border border-border bg-muted/30 p-2">
                <img
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className="block max-h-[60dvh] w-auto max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 border border-border bg-muted/30 p-4 text-xs">
                <AttachmentFileIcon contentType={attachment.contentType} name={attachment.name} />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-medium text-foreground">{attachment.name}</p>
                  <p className="text-muted-foreground">
                    {attachment.contentType ?? "File attachment"}
                    {sizeLabel ? ` (${sizeLabel})` : ""}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditComposer() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end">
      <ComposerPrimitive.Root className="flex w-full max-w-[90%] flex-col gap-2 border border-border bg-background p-2.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
        <ComposerPrimitive.Input
          aria-label="Edit message"
          className="min-h-14 w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none sm:text-sm"
        />
        <div className="flex items-center justify-end gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button type="button" variant="outline" size="xs">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button type="submit" size="xs">
              Save
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function UserMessage({ onPreview }: { onPreview: (attachment: PreviewableAttachment) => void }) {
  return (
    <MessagePrimitive.Root className="group/message flex w-full flex-col items-end gap-1.5">
      <AuiIf
        condition={(s) =>
          s.message.role === "user" &&
          ((s.message.submission?.attachments ?? s.message.attachments)?.length ?? 0) > 0
        }
      >
        <div
          data-slot="user-attachment-grid"
          className="grid w-full max-w-[85%] grid-cols-[repeat(auto-fill,4.5rem)] justify-end gap-1.5"
        >
          <MessagePrimitive.Attachments>
            {() => <AttachmentSquareTile onPreview={onPreview} />}
          </MessagePrimitive.Attachments>
        </div>
      </AuiIf>
      <div className="max-w-[85%] min-w-0 bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground wrap-break-word">
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "text") {
              return (
                <p className="whitespace-pre-wrap wrap-break-word">
                  <MessagePartPrimitive.Text />
                </p>
              );
            }
            if (part.type === "image") {
              return (
                <MessagePartPrimitive.Image className="my-1 max-h-48 max-w-full border border-border object-contain" />
              );
            }
            return null;
          }}
        </MessagePrimitive.Parts>
      </div>
      <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within/message:opacity-100 sm:group-hover/message:opacity-100">
        <BranchPicker />
        <ActionBarPrimitive.Root hideWhenRunning>
          <ActionBarPrimitive.Edit asChild>
            <TooltipIconButton tooltip="Edit message">
              <PencilIcon aria-hidden="true" className="size-3.5" />
            </TooltipIconButton>
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

function BranchPicker() {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums"
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous branch" className="size-7">
          <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="px-1">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next branch" className="size-7">
          <ChevronRightIcon aria-hidden="true" className="size-3.5" />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

function AssistantTailThinkingIndicator() {
  const showThinking = useAuiState((s) => {
    if (s.message.role !== "assistant" || s.message.status?.type !== "running") return false;
    if (s.message.parts.length === 0) return true;
    const lastPart = s.message.parts[s.message.parts.length - 1];
    if (!lastPart) return true;
    if (lastPart.type === "text") return lastPart.text.trim().length === 0;
    if (lastPart.type === "reasoning") return false;
    if (lastPart.type === "tool-call") return lastPart.status.type !== "running";
    return false;
  });

  const elapsed = useElapsedSeconds(showThinking);
  if (!showThinking) return null;

  return <ThinkingIndicator label="Thinking…" elapsed={elapsed} className="py-1" />;
}

function ReasoningGroupRow({
  isStreaming,
  children,
}: {
  isStreaming: boolean;
  children: React.ReactNode;
}) {
  const elapsed = useElapsedSeconds(isStreaming);

  return (
    <Collapsible className="my-1 text-xs">
      <CollapsibleTrigger className="group/reasoning flex w-full min-w-0 items-center justify-between gap-2 py-1 text-start text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isStreaming
                ? "bg-blue-500 motion-safe:animate-pulse dark:bg-blue-400"
                : "bg-muted-foreground/60",
            )}
          />
          <ShimmerLabel active={isStreaming} className="min-w-0 truncate leading-tight">
            {isStreaming ? "Thinking…" : "Thought process"}
          </ShimmerLabel>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {elapsed !== undefined && (
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {elapsed}
            </span>
          )}
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 -rotate-90 text-muted-foreground/70 opacity-60 transition-[transform,opacity] duration-150 group-hover/reasoning:opacity-100 in-data-panel-open:rotate-0 in-data-panel-open:opacity-100 motion-reduce:transition-none"
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 border-s border-border ps-2.5 text-muted-foreground whitespace-pre-wrap wrap-break-word">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssistantMessage({ ToolFallback }: { ToolFallback: ToolCallMessagePartComponent }) {
  return (
    <MessagePrimitive.Root className="group/message flex w-full min-w-0 flex-col items-start gap-1.5">
      <div className="w-full min-w-0 text-sm leading-relaxed text-foreground">
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-reasoning"],
            "tool-call": ["group-tool-call"],
          })}
        >
          {({ part, children }) => {
            if (part.type === "group-reasoning") {
              return (
                <ReasoningGroupRow isStreaming={part.status.type === "running"}>
                  {children}
                </ReasoningGroupRow>
              );
            }

            if (part.type === "group-tool-call") {
              return <AssistantToolGroup group={part}>{children}</AssistantToolGroup>;
            }

            switch (part.type) {
              case "text":
                return <AssistantMarkdownText />;
              case "reasoning":
                return <span>{part.text}</span>;
              case "image":
                return (
                  <MessagePartPrimitive.Image className="my-2 max-h-56 max-w-full border border-border object-contain" />
                );
              case "file":
                return (
                  <a
                    href={part.data}
                    download={part.filename}
                    className="my-1 inline-flex items-center gap-1.5 border border-border bg-muted/40 px-2.5 py-1 text-xs underline-offset-4 hover:underline"
                  >
                    <PaperclipIcon aria-hidden="true" className="size-3.5" />
                    <span>{part.filename ?? part.mimeType}</span>
                  </a>
                );
              case "source":
                return part.sourceType === "url" ? (
                  <a
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="me-1.5 inline-block border border-border px-1.5 py-0.5 text-xs underline-offset-4 hover:underline"
                  >
                    {part.title ?? part.url}
                  </a>
                ) : (
                  <Badge variant="outline" className="me-1.5 rounded-none text-xs">
                    {part.title}
                  </Badge>
                );
              case "tool-call":
                return part.toolUI ?? <ToolFallback {...part} />;
              case "generative-ui":
                return <MessagePrimitive.GenerativeUI components={{}} />;
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>

        <AssistantTailThinkingIndicator />
      </div>

      <MessagePrimitive.Error>
        <ErrorPrimitive.Root
          role="alert"
          className="flex w-full items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-medium">
              Unable to generate a reply. Try again or check your configuration.
            </p>
            <p className="text-destructive/90 wrap-break-word">
              <ErrorPrimitive.Message />
            </p>
          </div>
          <ActionBarPrimitive.Reload asChild>
            <Button type="button" variant="outline" size="xs" className="shrink-0">
              Retry
            </Button>
          </ActionBarPrimitive.Reload>
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>

      <div className="flex items-center gap-1">
        <BranchPicker />
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="not-last"
          className="flex items-center gap-0.5 text-muted-foreground"
        >
          <ActionBarPrimitive.Copy asChild>
            <TooltipIconButton tooltip="Copy message">
              <AuiIf condition={(s) => s.message.isCopied}>
                <CheckIcon aria-hidden="true" className="size-3.5" />
              </AuiIf>
              <AuiIf condition={(s) => !s.message.isCopied}>
                <CopyIcon aria-hidden="true" className="size-3.5" />
              </AuiIf>
            </TooltipIconButton>
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload asChild>
            <TooltipIconButton tooltip="Regenerate response">
              <RefreshCwIcon aria-hidden="true" className="size-3.5" />
            </TooltipIconButton>
          </ActionBarPrimitive.Reload>
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

function WelcomeSuggestions({
  emptyTitle,
  emptyDescription,
}: {
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="my-auto flex flex-col justify-center gap-2 py-0">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{emptyDescription}</p>
      </div>
      <div className="flex flex-col gap-2">
        <ThreadPrimitive.Suggestions>
          {() => (
            <SuggestionPrimitive.Trigger
              send
              className="flex w-full flex-col items-start gap-0.5 border border-border bg-background px-3 py-2 text-start transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className="text-xs font-medium text-foreground">
                <SuggestionPrimitive.Title />
              </span>
              <span className="text-xs text-muted-foreground">
                <SuggestionPrimitive.Description />
              </span>
            </SuggestionPrimitive.Trigger>
          )}
        </ThreadPrimitive.Suggestions>
      </div>
    </div>
  );
}

function FollowUpSuggestions() {
  return (
    <AuiIf
      condition={(s) => !s.thread.isEmpty && !s.thread.isRunning && s.thread.suggestions.length > 0}
    >
      <div className="flex flex-wrap gap-1.5 pb-2">
        <ThreadPrimitive.Suggestions>
          {() => (
            <SuggestionPrimitive.Trigger
              send
              className="border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <SuggestionPrimitive.Title />
            </SuggestionPrimitive.Trigger>
          )}
        </ThreadPrimitive.Suggestions>
      </div>
    </AuiIf>
  );
}

export function AssistantThread({
  emptyTitle = "How can I help?",
  emptyDescription = "Ask a question, inspect the current screen, or attach a file to discuss.",
  composerAddon,
  toolFallback = AssistantToolFallback,
}: AssistantThreadProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PreviewableAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const inputHistory = unstable_useComposerInputHistory();

  useAuiEvent("composer.attachmentAddError", ({ message }) => {
    setAttachmentError(message);
  });

  useAuiEvent("composer.send", () => {
    setAttachmentError(null);
  });

  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col bg-popover text-popover-foreground">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3.5 pt-3.5 pb-4">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <WelcomeSuggestions emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === "user") {
              return message.composer.isEditing ? (
                <EditComposer />
              ) : (
                <UserMessage onPreview={setPreviewAttachment} />
              );
            }
            return <AssistantMessage ToolFallback={toolFallback} />;
          }}
        </ThreadPrimitive.Messages>

        <AuiIf condition={(s) => !s.thread.isEmpty}>
          <div className="pointer-events-none sticky bottom-2 z-10 flex justify-center">
            <ThreadPrimitive.ScrollToBottom asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                aria-label="Scroll to bottom"
                className="pointer-events-auto border border-border shadow-sm disabled:pointer-events-none disabled:opacity-0"
              >
                <ArrowDownIcon aria-hidden="true" className="size-3.5" />
              </Button>
            </ThreadPrimitive.ScrollToBottom>
          </div>
        </AuiIf>
      </ThreadPrimitive.Viewport>

      <div className="border-t border-border bg-popover p-3">
        <FollowUpSuggestions />

        {attachmentError && (
          <div
            role="alert"
            className="mb-2 flex items-center justify-between gap-2 border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{attachmentError}</span>
            </span>
            <button
              type="button"
              aria-label="Dismiss attachment error"
              onClick={() => setAttachmentError(null)}
              className="inline-flex size-5 shrink-0 items-center justify-center hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <XIcon aria-hidden="true" className="size-3" />
            </button>
          </div>
        )}

        <ComposerPrimitive.Root className="flex flex-col border border-border bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <ComposerPrimitive.AttachmentDropzone className="group/dropzone relative flex flex-col gap-2 p-2.5 transition-colors data-dragging:bg-accent/40">
            <div
              aria-hidden="true"
              className="pointer-events-none hidden items-center justify-center gap-1.5 border border-dashed border-ring bg-background/85 py-2 text-xs text-foreground group-data-dragging/dropzone:flex"
            >
              <UploadIcon className="size-3.5" />
              <span>Drop files to attach</span>
            </div>

            <AuiIf condition={(s) => s.composer.attachments.length > 0}>
              <div
                data-slot="composer-attachment-grid"
                className="grid grid-cols-[repeat(auto-fill,4.5rem)] gap-2"
              >
                <ComposerPrimitive.Attachments>
                  {() => <AttachmentSquareTile removable onPreview={setPreviewAttachment} />}
                </ComposerPrimitive.Attachments>
              </div>
            </AuiIf>

            <ComposerPrimitive.Input
              aria-label="Message assistant"
              placeholder="Ask anything…"
              rows={1}
              {...inputHistory}
              className="max-h-32 min-h-9 w-full resize-none bg-transparent text-base leading-relaxed text-foreground placeholder:text-muted-foreground outline-none sm:text-sm"
            />

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="flex min-w-0 items-center gap-1">
                <AuiIf condition={(s) => s.thread.capabilities.attachments}>
                  <ComposerPrimitive.AddAttachment asChild>
                    <TooltipIconButton tooltip="Add attachment">
                      <PaperclipIcon aria-hidden="true" className="size-3.5" />
                    </TooltipIconButton>
                  </ComposerPrimitive.AddAttachment>
                </AuiIf>
                {composerAddon}
              </div>

              <div className="flex items-center gap-1">
                <AuiIf condition={(s) => !s.thread.isRunning}>
                  <ComposerPrimitive.Send asChild>
                    <TooltipIconButton
                      type="submit"
                      variant="default"
                      size="icon-xs"
                      tooltip="Send message"
                    >
                      <ArrowUpIcon aria-hidden="true" className="size-3.5" />
                    </TooltipIconButton>
                  </ComposerPrimitive.Send>
                </AuiIf>
                <AuiIf condition={(s) => s.thread.isRunning}>
                  <ComposerPrimitive.Cancel asChild>
                    <TooltipIconButton variant="outline" size="icon-xs" tooltip="Stop generating">
                      <SquareIcon aria-hidden="true" className="size-3 fill-current" />
                    </TooltipIconButton>
                  </ComposerPrimitive.Cancel>
                </AuiIf>
              </div>
            </div>
          </ComposerPrimitive.AttachmentDropzone>
        </ComposerPrimitive.Root>
      </div>

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
      />
    </ThreadPrimitive.Root>
  );
}
