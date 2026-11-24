import { describe, expect, test } from "bun:test";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "../src/components/tooltip";
import {
  AssistantModal,
  AssistantThread,
  AssistantToolFallback,
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

  test("renders tool fallback status badge cleanly", () => {
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
    expect(html).toContain("get_runtime_info");
    expect(html).toContain("Done");
  });
});
