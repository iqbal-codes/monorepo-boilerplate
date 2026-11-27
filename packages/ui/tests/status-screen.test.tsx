import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
const { Button } = await import("../src/components/button");
const { StatusScreen } = await import("../src/components/status-screen");

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

describe("StatusScreen", () => {
  test("renders 404, 403, 500, and generic error modes with heading, badge, and actions", () => {
    for (const status of ["404", "403", "500", "error"] as const) {
      const html = renderToStaticMarkup(
        <StatusScreen
          status={status}
          primaryAction={<Button>Retry</Button>}
          secondaryAction={<Button variant="outline">Go home</Button>}
        />,
      );
      expect(html).toContain('data-slot="status-screen"');
      expect(html).toContain(`data-status="${status}"`);
      expect(html).toContain("<h1");
      expect(html).toContain('data-slot="status-badge"');
      expect(html).toContain("Retry");
      expect(html).toContain("Go home");
      expect(html).not.toContain('data-slot="status-screen-details"');
    }
  });

  test("toggles optional collapsible technical details cleanly", async () => {
    const view = await renderInDom(
      <StatusScreen
        status="500"
        details="TypeError: Cannot read properties of undefined (reading 'id')"
        primaryAction={<Button>Try again</Button>}
      />,
    );

    try {
      const trigger = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="status-screen-details-trigger"]',
      );
      expect(trigger).not.toBeNull();
      expect(trigger?.getAttribute("aria-expanded")).toBe("false");

      await act(async () => {
        trigger?.click();
      });

      expect(trigger?.getAttribute("aria-expanded")).toBe("true");
      const content = view.host.querySelector<HTMLElement>(
        '[data-slot="status-screen-details-content"]',
      );
      expect(content?.textContent).toContain("TypeError: Cannot read properties of undefined");
    } finally {
      await view.cleanup();
    }
  });
});
