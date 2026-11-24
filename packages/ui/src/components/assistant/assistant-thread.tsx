"use client";

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
  useAuiState,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";

import { AssistantMarkdownText } from "./markdown-text";
import { AssistantToolFallback, AssistantToolGroup } from "./tool-ui";
import { TooltipIconButton } from "./tooltip-icon-button";

export type AssistantThreadProps = {
  emptyTitle?: string;
  emptyDescription?: string;
  composerAddon?: React.ReactNode;
  toolFallback?: ToolCallMessagePartComponent;
};

function ComposerAttachmentTile() {
  const name = useAuiState((s) => s.attachment.name);
  const contentType = useAuiState((s) => s.attachment.contentType);

  return (
    <AttachmentPrimitive.Root className="flex max-w-44 items-center gap-1.5 border border-border bg-muted/60 px-2 py-1 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">
          <AttachmentPrimitive.Name />
        </p>
        {contentType && <p className="truncate text-xs text-muted-foreground">{contentType}</p>}
      </div>
      <AttachmentPrimitive.Remove
        aria-label={`Remove ${name || "attachment"}`}
        className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <XIcon aria-hidden="true" className="size-3.5" />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

function UserMessageAttachmentTile() {
  return (
    <AttachmentPrimitive.Root className="inline-flex max-w-52 items-center gap-1.5 border border-border bg-muted/50 px-2 py-1 text-xs text-foreground">
      <PaperclipIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">
        <AttachmentPrimitive.Name />
      </span>
    </AttachmentPrimitive.Root>
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

function UserMessage() {
  return (
    <MessagePrimitive.Root className="group/message flex w-full flex-col items-end gap-1.5">
      <MessagePrimitive.Attachments>
        {() => (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            <UserMessageAttachmentTile />
          </div>
        )}
      </MessagePrimitive.Attachments>
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
              const isStreaming = part.status.type === "running";
              return (
                <Collapsible className="my-1.5 border border-border bg-muted/30 text-xs">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-start text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
                    <span>{isStreaming ? "Thinking…" : "Reasoning"}</span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-3.5 motion-safe:transition-transform motion-safe:duration-150 in-data-panel-open:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border-t border-border px-2.5 py-2 text-muted-foreground whitespace-pre-wrap wrap-break-word">
                    {children}
                  </CollapsibleContent>
                </Collapsible>
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
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col bg-popover text-popover-foreground">
      <ThreadPrimitive.Viewport className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3.5 pt-3.5 pb-4">
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <WelcomeSuggestions emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === "user") {
              return message.composer.isEditing ? <EditComposer /> : <UserMessage />;
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

        <ComposerPrimitive.Root className="flex flex-col border border-border bg-background transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <ComposerPrimitive.AttachmentDropzone className="flex flex-col gap-2 p-2.5">
            <AuiIf condition={(s) => s.composer.attachments.length > 0}>
              <div className="flex flex-wrap gap-1.5">
                <ComposerPrimitive.Attachments>
                  {() => <ComposerAttachmentTile />}
                </ComposerPrimitive.Attachments>
              </div>
            </AuiIf>

            <ComposerPrimitive.Input
              aria-label="Message assistant"
              placeholder="Ask anything…"
              rows={1}
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
    </ThreadPrimitive.Root>
  );
}
