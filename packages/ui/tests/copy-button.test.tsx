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
const { CopyButton } = await import("../src/components/copy-button");
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

describe("CopyButton", () => {
  test("copies value, swaps icon state, announces Copied via polite live region, and resets", async () => {
    const written: string[] = [];
    const copiedEvents: string[] = [];
    const originalClipboard = navigator.clipboard;

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          written.push(text);
        },
      },
    });

    const view = await renderInDom(
      <CopyButton
        value="cust_01JXYZ"
        label="Copy customer ID"
        resetAfterMs={40}
        onCopied={(val) => copiedEvents.push(val)}
      />,
    );

    try {
      const button = view.host.querySelector<HTMLButtonElement>('[data-slot="copy-button"]');
      const live = view.host.querySelector<HTMLElement>('[data-slot="copy-button-live"]');

      expect(button).not.toBeNull();
      expect(button?.type).toBe("button");
      expect(button?.getAttribute("aria-label")).toBe("Copy customer ID");
      expect(button?.getAttribute("data-status")).toBe("idle");
      expect(button?.disabled).toBe(false);
      expect(button?.querySelector('[data-slot="copy-button-icon-idle"]')).not.toBeNull();

      expect(live).not.toBeNull();
      expect(live?.getAttribute("aria-live")).toBe("polite");
      expect(button?.contains(live!)).toBe(false);
      expect(live?.textContent).toBe("");

      await act(async () => {
        button?.click();
      });

      expect(written).toEqual(["cust_01JXYZ"]);
      expect(copiedEvents).toEqual(["cust_01JXYZ"]);
      expect(button?.getAttribute("data-status")).toBe("copied");
      expect(button?.disabled).toBe(false);
      expect(button?.querySelector('[data-slot="copy-button-icon-copied"]')).not.toBeNull();
      expect(live?.textContent).toContain("Copied");

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      expect(button?.getAttribute("data-status")).toBe("idle");
      expect(button?.querySelector('[data-slot="copy-button-icon-idle"]')).not.toBeNull();
      expect(live?.textContent).toBe("");
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
      await view.cleanup();
    }
  });

  test("handles unavailable or rejecting clipboard with failed state and live announcement", async () => {
    const errors: unknown[] = [];
    const originalClipboard = navigator.clipboard;

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    const view = await renderInDom(
      <CopyButton
        value="secret-token"
        label="Copy token"
        resetAfterMs={500}
        onCopyError={(err) => errors.push(err)}
      />,
    );

    try {
      const button = view.host.querySelector<HTMLButtonElement>('[data-slot="copy-button"]');
      const live = view.host.querySelector<HTMLElement>('[data-slot="copy-button-live"]');

      await act(async () => {
        button?.click();
      });

      expect(errors.length).toBe(1);
      expect(button?.getAttribute("data-status")).toBe("failed");
      expect(button?.disabled).toBe(false);
      expect(button?.querySelector('[data-slot="copy-button-icon-failed"]')).not.toBeNull();
      expect(live?.textContent).toContain("Copy failed");
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
      await view.cleanup();
    }
  });

  test("supports visible label children without overriding accessible text", async () => {
    const view = await renderInDom(<CopyButton value="hello">Copy value</CopyButton>);
    try {
      const button = view.host.querySelector<HTMLButtonElement>('[data-slot="copy-button"]');
      expect(button?.textContent).toContain("Copy value");
      expect(button?.getAttribute("aria-label")).toBeNull();
    } finally {
      await view.cleanup();
    }
  });
});
