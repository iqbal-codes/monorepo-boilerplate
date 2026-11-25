"use client";

import type { ReactNode } from "react";
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";

import { collapsePanel, field, mono, ShimmerLabel, SwapLabel } from "./surfaces";

export type ToolCallFrameProps = {
  label: string;
  activeLabel: string;
  query: string;
  running: boolean;
  failed?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
};

/**
 * Shared 1-line tool disclosure shell (`SwapLabel` + `ShimmerLabel` + status indicator)
 * used by both individual `ToolCall` items and multi-tool `AssistantToolGroup` summaries.
 */
export function ToolCallFrame({
  label,
  activeLabel,
  query,
  running,
  failed = false,
  open,
  onOpenChange,
  className,
  children,
}: ToolCallFrameProps) {
  return (
    <Collapsible
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full", className)}
    >
      <CollapsibleTrigger className="group/trigger flex w-full min-w-0 items-center gap-2 py-1 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground/90 focus-visible:ring-2 focus-visible:ring-ring/30">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-open/trigger:rotate-90 group-data-panel-open/trigger:rotate-90 motion-reduce:transition-none"
        />
        <SwapLabel active={running ? 0 : 1} className="shrink-0 text-start whitespace-nowrap">
          <ShimmerLabel active={running} className="relative inline-block leading-none">
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        <span
          className={cn(
            mono,
            "min-w-0 truncate bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/70",
          )}
        >
          {query}
        </span>
        <span className="ms-auto flex w-4 shrink-0 items-center justify-end">
          {running ? null : failed ? (
            <XIcon
              role="img"
              aria-label="Failed"
              className="size-3.5 text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-200"
            />
          ) : (
            <CheckIcon
              aria-hidden="true"
              className="size-3.5 text-emerald-500 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-90 motion-safe:duration-200"
            />
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, "outline-none")}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export interface ToolCallProps {
  label: string;
  activeLabel: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  failed?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

/**
 * Single tool invocation with a compact 1-line summary trigger (`SwapLabel` + `ShimmerLabel`)
 * and request/result payload tucked behind a collapsible disclosure, modeled after
 * assistant-ui's `elements-tool-call`.
 */
export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  running,
  failed = false,
  open,
  onOpenChange,
  className,
}: ToolCallProps) {
  return (
    <ToolCallFrame
      label={label}
      activeLabel={activeLabel}
      query={query}
      running={running}
      failed={failed}
      open={open}
      onOpenChange={onOpenChange}
      className={className}
    >
      <div className={cn(field, "mt-1.5 overflow-hidden border border-border/60 text-xs")}>
        <div className="px-3 pt-2 pb-2">
          <p className={cn(mono, "mb-1 text-muted-foreground")}>Request</p>
          <p className="font-mono text-[11px] text-muted-foreground wrap-break-word whitespace-pre-wrap">
            {request}
          </p>
        </div>
        <div className="mx-3 h-px bg-foreground/[0.06]" />
        <div className="px-3 pt-2 pb-2.5">
          <p className={cn(mono, "mb-1 text-muted-foreground")}>Result</p>
          <p className="font-mono text-[11px] text-foreground/90 wrap-break-word whitespace-pre-wrap">
            {result}
          </p>
        </div>
      </div>
    </ToolCallFrame>
  );
}
