import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
win.HTMLElement.prototype.scrollIntoView ??= () => {};

let currentWidth = 1024;
const mediaListeners = new Set<() => void>();

Object.defineProperty(win, "innerWidth", {
  get: () => currentWidth,
  configurable: true,
});

win.matchMedia = ((query: string) => ({
  matches: currentWidth < 768,
  media: query,
  onchange: null,
  addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
  removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof win.matchMedia;

const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "DOMRect",
  "DOMRectReadOnly",
  "HTMLElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "MutationObserver",
  "ResizeObserver",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

const previousGlobals = Object.fromEntries(
  DOM_KEYS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
);

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  ShadowRoot: win.ShadowRoot,
  DOMRect: win.DOMRect,
  DOMRectReadOnly: win.DOMRectReadOnly ?? win.DOMRect,
  HTMLElement: win.HTMLElement,
  HTMLButtonElement: win.HTMLButtonElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  PointerEvent: win.PointerEvent,
  KeyboardEvent: win.KeyboardEvent,
  MutationObserver: win.MutationObserver,
  ResizeObserver: MockResizeObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { createRoot } = await import("react-dom/client");
const { SplitView } = await import("../src/components/split-view");

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
    root.render(node);
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

function setViewportWidth(width: number) {
  currentWidth = width;
  for (const listener of mediaListeners) {
    listener();
  }
}

describe("SplitView & DetailSheet (TC-01, TC-03)", () => {
  test("renders side-by-side Resizable panels on md+ without duplicating detail content", async () => {
    setViewportWidth(1024);
    const view = await renderInDom(
      <SplitView
        master={<div data-testid="master-pane">Master table</div>}
        detail={<div data-testid="detail-marker">Inspector body</div>}
        detailOpen
        detailTitle="Invoice details"
        onDetailOpenChange={() => {}}
      />,
    );

    try {
      expect(view.host.querySelector("[data-slot='resizable-panel-group']")).toBeTruthy();
      expect(view.host.querySelector("[role='separator']")).toBeTruthy();
      expect(document.body.querySelectorAll("[data-testid='detail-marker']")).toHaveLength(1);
      expect(document.body.querySelector("[data-slot='sheet-content']")).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("collapses to DetailSheet below md (320px) without duplicating detail content and supports controlled close", async () => {
    setViewportWidth(320);
    const openChanges: boolean[] = [];

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <SplitView
          master={<div data-testid="master-pane">Master list</div>}
          detail={<div data-testid="detail-marker">Mobile inspector body</div>}
          detailOpen={open}
          detailTitle="Invoice INV-1001"
          detailDescription="Line items and timeline"
          onDetailOpenChange={(next) => {
            openChanges.push(next);
            setOpen(next);
          }}
        />
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      expect(view.host.querySelector("[data-slot='resizable-panel-group']")).toBeNull();
      const sheet = document.body.querySelector("[data-slot='sheet-content']")!;
      expect(sheet).toBeTruthy();
      expect(sheet.textContent).toContain("Invoice INV-1001");
      expect(document.body.querySelectorAll("[data-testid='detail-marker']")).toHaveLength(1);

      const closeBtn = sheet.querySelector<HTMLButtonElement>("[data-slot='sheet-close']")!;
      await act(async () => {
        closeBtn.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      expect(openChanges).toEqual([false]);
      expect(document.body.querySelector("[data-testid='detail-marker']")).toBeNull();
    } finally {
      await view.cleanup();
      setViewportWidth(1024);
    }
  });
});
