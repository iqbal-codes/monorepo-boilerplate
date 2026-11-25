"use client";

import { useState, type FC, type PropsWithChildren } from "react";
import {
  useAuiState,
  type MessagePrimitive,
  type PartState,
  type ToolCallMessagePartProps,
  type ToolCallMessagePartStatus,
} from "@assistant-ui/react";

import { ToolCall, ToolCallFrame } from "./tool-call";

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function readStringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function formatPayload(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

export type ToolCallSummaryInput = {
  toolName: string;
  args?: unknown;
  argsText?: string;
  result?: unknown;
  isError?: boolean;
  status: ToolCallMessagePartStatus;
};

export type ToolCallDescriptor = {
  activeLabel: string;
  label: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  failed: boolean;
};

/**
 * Maps a tool call part into props for `ToolCall` (`activeLabel`, `label`, `query`, `request`, `result`).
 */
export function formatToolCallDescriptor({
  toolName,
  args,
  argsText,
  result,
  isError,
  status,
}: ToolCallSummaryInput): ToolCallDescriptor {
  const running = status.type === "running";
  const failed = Boolean(isError) || (status.type === "incomplete" && status.reason === "error");
  const argsRecord = asRecord(args);
  const resultRecord = asRecord(result);
  const requestText = argsText?.trim() ? argsText : formatPayload(args, "{}");
  const resultText =
    result !== undefined
      ? formatPayload(result, "Done")
      : running
        ? "Waiting for result…"
        : failed
          ? "Tool call failed"
          : "Completed";

  switch (toolName) {
    case "get_runtime_info":
      return {
        activeLabel: "Checking",
        label: failed ? "Failed" : "Checked",
        query: "runtime info",
        request: requestText,
        result: resultText,
        running,
        failed,
      };
    case "get_current_screen": {
      const pathname = readStringField(resultRecord, "pathname");
      return {
        activeLabel: "Inspecting",
        label: failed ? "Failed" : "Inspected",
        query: pathname ?? "current screen",
        request: requestText,
        result: resultText,
        running,
        failed,
      };
    }
    case "navigate_screen": {
      const target =
        readStringField(resultRecord, "navigatedTo") ?? readStringField(argsRecord, "path");
      return {
        activeLabel: "Opening",
        label: failed ? "Failed" : "Opened",
        query: target ?? "screen",
        request: requestText,
        result: resultText,
        running,
        failed,
      };
    }
    default: {
      const label = humanizeToolName(toolName) || "tool";
      return {
        activeLabel: "Running",
        label: failed ? "Failed" : "Ran",
        query: label,
        request: requestText,
        result: resultText,
        running,
        failed,
      };
    }
  }
}

/**
 * Formats a concise 1-line summary string for a tool call.
 */
export function formatToolCallSummary(input: ToolCallSummaryInput): string {
  const descriptor = formatToolCallDescriptor(input);
  const verb = descriptor.running ? descriptor.activeLabel : descriptor.label;
  return `${verb} ${descriptor.query}`;
}

export const AssistantToolFallback: FC<ToolCallMessagePartProps> = ({
  toolName,
  args,
  argsText,
  result,
  isError,
  status,
}) => {
  const [open, setOpen] = useState(status.type === "requires-action");
  const descriptor = formatToolCallDescriptor({
    toolName,
    args,
    argsText,
    result,
    isError,
    status,
  });

  return (
    <ToolCall
      label={descriptor.label}
      activeLabel={descriptor.activeLabel}
      query={descriptor.query}
      request={descriptor.request}
      result={descriptor.result}
      running={descriptor.running}
      failed={descriptor.failed}
      open={open}
      onOpenChange={setOpen}
      className="my-0.5"
    />
  );
};

export type AssistantToolGroupPart = MessagePrimitive.GroupedParts.GroupPart;

type ToolCallPartState = Extract<PartState, { type: "tool-call" }>;

function summarizeToolGroup(
  parts: readonly ToolCallPartState[],
  fallbackCount: number,
  isRunning: boolean,
): { activeLabel: string; label: string; query: string; failed: boolean } {
  if (parts.length === 0) {
    return {
      activeLabel: "Running",
      label: "Ran",
      query: `${fallbackCount} ${fallbackCount === 1 ? "tool" : "tools"}`,
      failed: false,
    };
  }

  const failed = parts.some(
    (part) =>
      Boolean(part.isError) ||
      (part.status.type === "incomplete" && part.status.reason === "error"),
  );
  const runningPart = parts.find((part) => part.status.type === "running");
  const errorPart = parts.find(
    (part) =>
      Boolean(part.isError) ||
      (part.status.type === "incomplete" && part.status.reason === "error"),
  );
  const primary = runningPart ?? errorPart ?? parts[parts.length - 1]!;
  const descriptor = formatToolCallDescriptor(primary);

  return {
    activeLabel: descriptor.activeLabel,
    label: failed ? "Failed" : descriptor.label,
    query: parts.length > 1 ? `${descriptor.query} +${parts.length - 1}` : descriptor.query,
    failed: !isRunning && failed,
  };
}

export const AssistantToolGroup: FC<PropsWithChildren<{ group: AssistantToolGroupPart }>> = ({
  group,
  children,
}) => {
  const [open, setOpen] = useState(false);
  const isRunning = group.status.type === "running";
  const messageParts = useAuiState((s) => s.message.parts);

  // Avoid double-wrapping a single tool call since `ToolCall` already provides a 1-line disclosure.
  if (group.indices.length === 1) {
    return <div className="my-0.5">{children}</div>;
  }

  const groupedToolParts = group.indices
    .map((index) => messageParts[index])
    .filter((part): part is ToolCallPartState => Boolean(part && part.type === "tool-call"));

  const summary = summarizeToolGroup(groupedToolParts, group.indices.length, isRunning);

  return (
    <ToolCallFrame
      label={summary.label}
      activeLabel={summary.activeLabel}
      query={summary.query}
      running={isRunning}
      failed={summary.failed}
      open={open}
      onOpenChange={setOpen}
      className="my-0.5"
    >
      <div className="mt-1 space-y-0.5 border-s border-border ps-2.5">{children}</div>
    </ToolCallFrame>
  );
};
