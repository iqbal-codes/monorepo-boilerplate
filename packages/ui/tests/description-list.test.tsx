import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/tooltip", import.meta.dir)));

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
const { DescriptionList } = await import("../src/components/description-list");
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

describe("DescriptionList", () => {
  test("renders semantic dl/dt/dd, empty fallbacks, tabular-nums, and trailing action slot", async () => {
    const view = await renderInDom(
      <DescriptionList
        columns={2}
        items={[
          { id: "company", label: "Company", value: null },
          { id: "phone", label: "Phone", value: "" },
          {
            id: "balance",
            label: "Balance",
            value: "$1,234.50",
            numeric: true,
            action: <button type="button">Adjust</button>,
          },
          { id: "notes", label: "Summary", value: "Primary account", span: "full" },
        ]}
      />,
    );

    try {
      const dl = view.host.querySelector("dl");
      expect(dl).not.toBeNull();

      const terms = [...view.host.querySelectorAll("dt")].map((el) => el.textContent);
      expect(terms).toEqual(["Company", "Phone", "Balance", "Summary"]);

      const details = [...view.host.querySelectorAll("dd")];
      expect(details[0]?.textContent).toBe("—");
      expect(details[1]?.textContent).toBe("—");
      expect(details[2]?.className).toContain("tabular-nums");
      expect(details[2]?.textContent).toContain("$1,234.50");
      expect(details[2]?.textContent).toContain("Adjust");
      expect(details[3]?.closest('[data-slot="description-list-item"]')?.className).toContain(
        "col-span-full",
      );
    } finally {
      await view.cleanup();
    }
  });

  test("copies copyValue via CopyButton and announces copy feedback", async () => {
    const copied: string[] = [];
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
    });

    const view = await renderInDom(
      <DescriptionList
        items={[
          {
            id: "email",
            label: "Email",
            value: "ada@example.com",
            copyValue: "ada@example.com",
            copyLabel: "Copy email",
          },
        ]}
      />,
    );

    try {
      const copyButton = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Copy email"]',
      );
      expect(copyButton).not.toBeNull();

      await act(async () => {
        copyButton?.click();
      });

      expect(copied).toEqual(["ada@example.com"]);
      const live = view.host.querySelector('[data-slot="copy-button-live"]');
      expect(live?.textContent).toContain("Copied");
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
      await view.cleanup();
    }
  });
});
