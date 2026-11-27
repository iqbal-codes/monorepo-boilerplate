import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const win = new Window({ url: "http://localhost/" });
const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

const previousGlobals = Object.fromEntries(
  DOM_KEYS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
);

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  HTMLElement: win.HTMLElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { createRoot } = await import("react-dom/client");
const { Button } = await import("../src/components/button");
const { SystemBanner } = await import("../src/components/system-banner");

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

describe("SystemBanner", () => {
  test("renders nothing when open is false", () => {
    const html = renderToStaticMarkup(
      <SystemBanner open={false} tone="info" message="Scheduled maintenance" />,
    );
    expect(html).toBe("");
  });

  test("renders all four semantic tones with action slot and omits dismiss button when non-dismissible", () => {
    for (const tone of ["neutral", "info", "warning", "danger"] as const) {
      const html = renderToStaticMarkup(
        <SystemBanner
          tone={tone}
          message={`Notice (${tone})`}
          action={
            <Button type="button" size="xs" variant="outline">
              Action
            </Button>
          }
        />,
      );
      expect(html).toContain('data-slot="system-banner"');
      expect(html).toContain(`data-tone="${tone}"`);
      expect(html).toContain(`Notice (${tone})`);
      expect(html).toContain("Action");
      expect(html).not.toContain('data-slot="system-banner-dismiss"');
    }
  });

  test("renders sticky non-dismissible impersonation and offline banners", () => {
    const impersonationHtml = renderToStaticMarkup(
      <SystemBanner
        tone="warning"
        message="Viewing as Jane Doe"
        action={
          <Button type="button" size="xs" variant="outline">
            Stop impersonating
          </Button>
        }
      />,
    );
    expect(impersonationHtml).toContain("Viewing as Jane Doe");
    expect(impersonationHtml).toContain("Stop impersonating");
    expect(impersonationHtml).toContain('role="alert"');
    expect(impersonationHtml).not.toContain('data-slot="system-banner-dismiss"');

    const offlineHtml = renderToStaticMarkup(
      <SystemBanner
        tone="danger"
        message="You are offline. Changes may not be saved until your connection returns."
      />,
    );
    expect(offlineHtml).toContain("You are offline.");
    expect(offlineHtml).toContain('role="alert"');
    expect(offlineHtml).not.toContain('data-slot="system-banner-dismiss"');
  });

  test("renders dismiss button and fires onDismiss for dismissible info notice", async () => {
    let dismissed = 0;
    const view = await renderInDom(
      <SystemBanner
        tone="info"
        message="Maintenance scheduled for Sunday at 02:00 UTC."
        onDismiss={() => {
          dismissed += 1;
        }}
      />,
    );

    try {
      const banner = view.host.querySelector('[data-slot="system-banner"]');
      expect(banner?.getAttribute("role")).toBe("status");

      const dismissButton = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="system-banner-dismiss"]',
      );
      expect(dismissButton).not.toBeNull();
      expect(dismissButton?.getAttribute("aria-label")).toBe("Dismiss notice");

      await act(async () => {
        dismissButton?.click();
      });

      expect(dismissed).toBe(1);
    } finally {
      await view.cleanup();
    }
  });
});
