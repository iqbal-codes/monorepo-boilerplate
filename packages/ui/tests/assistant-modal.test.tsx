import { describe, expect, test } from "bun:test";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useLocalRuntime,
  type ThreadMessage,
} from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "../src/components/tooltip";
import {
  AssistantModal,
  AssistantThread,
  AssistantToolFallback,
  ShimmerLabel,
  ThinkingIndicator,
  ToolCall,
  formatToolCallSummary,
} from "../src/components/assistant";

function TestAssistantModalHarness() {
  const runtime = useLocalRuntime({
    async run() {
      return { content: [{ type: "text", text: "ok" }] };
    },
  });

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <AssistantModal
          models={[{ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" }]}
          defaultModelId="gemini-3.8-flash"
        />
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}

function TestAssistantThreadHarness() {
  const runtime = useLocalRuntime({
    async run() {
      return { content: [{ type: "text", text: "ok" }] };
    },
  });

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <AssistantThread />
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}

function TestInteractiveStreamHarness() {
  const messages: ThreadMessage[] = [
    {
      id: "msg-user-1",
      role: "user",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      content: [{ type: "text", text: "Check these files" }],
      attachments: [
        {
          id: "att-1",
          type: "image",
          name: "screenshot.png",
          contentType: "image/png",
          status: { type: "complete" },
          content: [{ type: "image", image: "data:image/png;base64,iVBORw0KGgo=" }],
        },
        {
          id: "att-2",
          type: "document",
          name: "invoice.pdf",
          contentType: "application/pdf",
          status: { type: "complete" },
          content: [
            {
              type: "file",
              mimeType: "application/pdf",
              filename: "invoice.pdf",
              data: "data:application/pdf;base64,JVBERi0=",
            },
          ],
        },
      ],
      metadata: { custom: {} },
    },
    {
      id: "msg-assistant-1",
      role: "assistant",
      createdAt: new Date("2026-01-01T00:00:01Z"),
      status: { type: "running" },
      content: [
        {
          type: "tool-call",
          toolCallId: "tc-1",
          toolName: "get_runtime_info",
          args: {},
          argsText: "{}",
          result: { environment: "development" },
        },
      ],
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {},
      },
    },
  ];

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: true,
    onNew: async () => {},
  });

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <AssistantThread />
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}

describe("AssistantModal & AssistantThread", () => {
  test("renders floating bottom-right trigger with accessible label and closed state", () => {
    const html = renderToStaticMarkup(<TestAssistantModalHarness />);
    expect(html).toContain('aria-label="Open assistant"');
    expect(html).toContain("fixed end-4 bottom-4");
  });

  test("renders thread composer with accessible label, mobile 16px input class, and send control", () => {
    const html = renderToStaticMarkup(<TestAssistantThreadHarness />);
    expect(html).toContain('aria-label="Message assistant"');
    expect(html).toContain("text-base");
    expect(html).toContain('aria-label="Send message"');
    expect(html).toContain('placeholder="Ask anything…"');
  });

  test("renders ThinkingIndicator with tw-shimmer class and optional elapsed time", () => {
    const html = renderToStaticMarkup(<ThinkingIndicator label="Thinking…" elapsed="3s" />);
    expect(html).toContain('data-slot="thinking-indicator"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain("shimmer");
    expect(html).toContain("Thinking…");
    expect(html).toContain("3s");

    const idleHtml = renderToStaticMarkup(<ShimmerLabel active={false}>Idle</ShimmerLabel>);
    expect(idleHtml).toContain('data-active="false"');
    expect(idleHtml).toContain('class=""');
  });

  test("formats concise 1-line tool call summaries for running, complete, and error states", () => {
    expect(
      formatToolCallSummary({
        toolName: "get_runtime_info",
        status: { type: "running" },
      }),
    ).toBe("Checking runtime info");

    expect(
      formatToolCallSummary({
        toolName: "get_current_screen",
        result: { pathname: "/customers" },
        status: { type: "complete" },
      }),
    ).toBe("Inspected /customers");

    expect(
      formatToolCallSummary({
        toolName: "navigate_screen",
        args: { path: "/settings" },
        status: { type: "running" },
      }),
    ).toBe("Opening /settings");

    expect(
      formatToolCallSummary({
        toolName: "search_customers",
        isError: true,
        status: { type: "incomplete", reason: "error" },
      }),
    ).toBe("Failed search customers");
  });

  test("renders ToolCall disclosure with SwapLabel, ShimmerLabel, query pill, and status icon", () => {
    const html = renderToStaticMarkup(
      <ToolCall
        label="Checked"
        activeLabel="Checking"
        query="runtime info"
        request="{}"
        result='{"environment":"development"}'
        running={false}
        open={false}
        onOpenChange={() => {}}
      />,
    );
    expect(html).toContain('data-slot="tool-call"');
    expect(html).toContain("Checking");
    expect(html).toContain("Checked");
    expect(html).toContain("runtime info");
  });

  test("renders AssistantToolFallback via ToolCall cleanly", () => {
    const html = renderToStaticMarkup(
      <AssistantToolFallback
        type="tool-call"
        toolCallId="tc-1"
        toolName="get_runtime_info"
        args={{}}
        argsText="{}"
        result={{ environment: "development" }}
        status={{ type: "complete" }}
        addResult={() => {}}
        resume={() => {}}
        isError={false}
        artifact={undefined}
      />,
    );
    expect(html).toContain('data-slot="tool-call"');
    expect(html).toContain("Checked");
    expect(html).toContain("runtime info");
  });

  test("renders square thumbnail attachment grid, ToolCall 1-line summary, and tail Thinking indicator", () => {
    const html = renderToStaticMarkup(<TestInteractiveStreamHarness />);
    expect(html).toContain('data-slot="user-attachment-grid"');
    expect(html).toContain('data-slot="attachment-square-tile"');
    expect(html).toContain("aspect-square");
    expect(html).toContain('aria-label="Preview screenshot.png"');
    expect(html).toContain('aria-label="Inspect invoice.pdf"');
    expect(html).toContain('data-slot="tool-call"');
    expect(html).toContain("Checked");
    expect(html).toContain("runtime info");
    expect(html).toContain('data-slot="thinking-indicator"');
    expect(html).toContain("Thinking…");
  });
});
