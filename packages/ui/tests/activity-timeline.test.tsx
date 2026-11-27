import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/collapsible", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "MutationObserver",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

const previousGlobals = Object.fromEntries(
  DOM_KEYS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
);

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  ShadowRoot: win.ShadowRoot,
  HTMLElement: win.HTMLElement,
  HTMLTextAreaElement: win.HTMLTextAreaElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  PointerEvent: win.PointerEvent,
  KeyboardEvent: win.KeyboardEvent,
  MutationObserver: win.MutationObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { createRoot } = await import("react-dom/client");
const { ActivityTimeline, ActivityTimelineComposer } =
  await import("../src/components/activity-timeline");
const { TooltipProvider } = await import("../src/components/tooltip");

afterAll(() => {
  for (const key of DOM_KEYS) {
    (globalThis as Record<string, unknown>)[key] = previousGlobals[key];
  }
  win.close();
});

async function renderInDom(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<TooltipProvider delay={0}>{node}</TooltipProvider>);
  });
  return {
    host,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new win.Event("input", { bubbles: true }));
  textarea.dispatchEvent(new win.Event("change", { bubbles: true }));
}

describe("ActivityTimeline", () => {
  test("renders events with actor initials, relative timestamp, typed icon, and expandable metadata", async () => {
    const view = await renderInDom(
      <ActivityTimeline
        items={[
          {
            id: "evt-1",
            type: "created",
            title: "Created customer",
            actor: { name: "Ada Lovelace" },
            timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
          },
          {
            id: "evt-2",
            type: "updated",
            title: "Updated customer",
            actor: { name: "Grace Hopper" },
            timestamp: "2026-11-27T10:30:00.000Z",
            metadata: { changes: { company: { from: "Old Co", to: "Northwind" } } },
          },
        ]}
      />,
    );

    try {
      const items = view.host.querySelectorAll('[data-slot="activity-timeline-item"]');
      expect(items.length).toBe(2);
      expect(view.host.textContent).toContain("AL");
      expect(view.host.textContent).toContain("GH");
      expect(view.host.textContent).toContain("Created customer");
      expect(view.host.textContent).toContain("Updated customer");

      const times = view.host.querySelectorAll("time");
      expect(times.length).toBe(2);
      expect(times[1]?.getAttribute("dateTime")).toBe("2026-11-27T10:30:00.000Z");

      const toggle = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="activity-timeline-metadata-trigger"]',
      );
      expect(toggle).not.toBeNull();
      expect(toggle?.getAttribute("aria-expanded")).toBe("false");

      await act(async () => {
        toggle?.click();
      });

      expect(toggle?.getAttribute("aria-expanded")).toBe("true");
      expect(view.host.textContent).toContain("Northwind");
    } finally {
      await view.cleanup();
    }
  });

  test("renders loading, error with Retry, and empty state while keeping composer visible", async () => {
    let retried = 0;
    const loadingView = await renderInDom(<ActivityTimeline items={[]} isLoading />);
    try {
      expect(
        loadingView.host.querySelectorAll('[data-slot="activity-timeline-skeleton"]').length,
      ).toBeGreaterThan(0);
    } finally {
      await loadingView.cleanup();
    }

    const errorView = await renderInDom(
      <ActivityTimeline
        items={[]}
        error="Failed to load activity"
        onRetry={() => {
          retried += 1;
        }}
      />,
    );
    try {
      expect(errorView.host.querySelector('[role="alert"]')?.textContent).toContain(
        "Failed to load activity",
      );
      const retryBtn = errorView.host.querySelector<HTMLButtonElement>("button");
      expect(retryBtn?.textContent).toContain("Retry");
      await act(async () => {
        retryBtn?.click();
      });
      expect(retried).toBe(1);
    } finally {
      await errorView.cleanup();
    }

    const emptyView = await renderInDom(
      <ActivityTimeline
        items={[]}
        composer={<ActivityTimelineComposer onSubmit={async () => {}} />}
      />,
    );
    try {
      expect(emptyView.host.textContent).toContain("No activity yet.");
      expect(emptyView.host.querySelector("textarea")).not.toBeNull();
    } finally {
      await emptyView.cleanup();
    }
  });

  test("ActivityTimelineComposer submits on button click or Cmd/Ctrl+Enter, respects IME, and clears on success", async () => {
    const submitted: string[] = [];
    const view = await renderInDom(
      <ActivityTimelineComposer
        onSubmit={async (body) => {
          submitted.push(body);
        }}
      />,
    );

    try {
      const textarea = view.host.querySelector<HTMLTextAreaElement>("textarea")!;
      const submitBtn = view.host.querySelector<HTMLButtonElement>('button[type="submit"]')!;

      await act(async () => {
        setTextAreaValue(textarea, "Called about renewal");
      });

      // Composing Ctrl+Enter should not submit if isComposing is true.
      await act(async () => {
        textarea.dispatchEvent(
          new win.KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            isComposing: true,
            bubbles: true,
          }),
        );
      });
      expect(submitted).toEqual([]);

      await act(async () => {
        textarea.dispatchEvent(
          new win.KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            bubbles: true,
          }),
        );
      });
      expect(submitted).toEqual(["Called about renewal"]);
      expect(textarea.value).toBe("");

      await act(async () => {
        setTextAreaValue(textarea, "Second note");
      });
      await act(async () => {
        submitBtn.click();
      });
      expect(submitted).toEqual(["Called about renewal", "Second note"]);
    } finally {
      await view.cleanup();
    }
  });

  test("renders caller-supplied event icon and iconClassName without domain coupling", async () => {
    const view = await renderInDom(
      <ActivityTimeline
        items={[
          {
            id: "evt-custom",
            type: "custom_audit",
            title: "Custom audit",
            icon: <span data-testid="custom-icon">*</span>,
            iconClassName: "border-warning/25 bg-warning-subtle",
            timestamp: "2026-11-27T10:30:00.000Z",
          },
        ]}
      />,
    );

    try {
      const iconSlot = view.host.querySelector('[data-slot="activity-timeline-icon"]');
      expect(iconSlot?.querySelector('[data-testid="custom-icon"]')).not.toBeNull();
      expect(iconSlot?.className).toContain("bg-warning-subtle");
    } finally {
      await view.cleanup();
    }
  });
});
