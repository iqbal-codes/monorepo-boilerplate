"use client";

import { useState, type FC, type PropsWithChildren } from "react";
import type { MessagePrimitive, ToolCallMessagePartProps } from "@assistant-ui/react";
import { CheckIcon, ChevronDownIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export const AssistantToolFallback: FC<ToolCallMessagePartProps> = ({
  toolName,
  argsText,
  result,
  isError,
  status,
}) => {
  const [open, setOpen] = useState(status.type === "requires-action");
  const isRunning = status.type === "running";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="my-1.5 border border-border bg-background/70 text-xs"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <Spinner aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : isError ? (
            <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0 text-destructive" />
          ) : (
            <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-mono font-medium text-foreground">{toolName}</span>
          <Badge variant={isError ? "destructive" : "outline"} className="rounded-none text-xs">
            {isRunning ? "Running" : isError ? "Failed" : "Done"}
          </Badge>
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 in-data-panel-open:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-2.5 py-2">
        <div className="flex flex-col gap-2">
          {argsText && (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Input
              </p>
              <pre className="max-h-36 overflow-auto border border-border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap wrap-break-word">
                {argsText}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Output
              </p>
              <pre className="max-h-40 overflow-auto border border-border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap wrap-break-word">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export type AssistantToolGroupPart = MessagePrimitive.GroupedParts.GroupPart;

export const AssistantToolGroup: FC<PropsWithChildren<{ group: AssistantToolGroupPart }>> = ({
  group,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const isRunning = group.status.type === "running";
  const toolCount = group.indices.length;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="my-1.5 border border-border bg-muted/20 text-xs"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-start transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <Spinner aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium text-foreground tabular-nums">
            {isRunning
              ? `Running ${toolCount} ${toolCount === 1 ? "tool" : "tools"}`
              : `Used ${toolCount} ${toolCount === 1 ? "tool" : "tools"}`}
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 in-data-panel-open:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-2 py-1.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
