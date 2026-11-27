import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/popover", import.meta.dir)));

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
const { NotificationCenter } = await import("../src/components/notification-center");

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
  Object.defineProperty(win, "innerWidth", { value: width, configurable: true });
  win.matchMedia = (query: string) =>
    ({
      matches: query.includes("767") ? width < 768 : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

const SAMPLE_ITEMS = [
  {
    id: "n1",
    title: "Customer import finished",
    description: "53 customers processed without errors.",
    timestamp: "2m ago",
    read: false,
    href: "/customers",
  },
  {
    id: "n2",
    title: "Password updated",
    description: "Your account password was changed.",
    timestamp: "1h ago",
    read: true,
  },
] as const;

describe("NotificationCenter", () => {
  test("caps unread badge at 99+ and renders Popover on md+ viewports", async () => {
    setViewportWidth(1280);
    const view = await renderInDom(
      <NotificationCenter items={SAMPLE_ITEMS} unreadCount={140} defaultOpen={false} />,
    );

    try {
      const badge = view.host.querySelector('[data-slot="notification-center-badge"]');
      expect(badge?.textContent).toBe("99+");

      const trigger = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="notification-center-trigger"]',
      );
      expect(trigger?.getAttribute("aria-label")).toContain("140 unread");

      await act(async () => {
        trigger?.click();
      });

      const popover = document.body.querySelector('[data-slot="notification-center-popover"]');
      expect(popover).not.toBeNull();
      expect(document.body.querySelector('[data-slot="notification-center-drawer"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("renders bottom Drawer below md viewports", async () => {
    setViewportWidth(375);
    const view = await renderInDom(<NotificationCenter items={SAMPLE_ITEMS} defaultOpen />);

    try {
      const drawer = document.body.querySelector('[data-slot="notification-center-drawer"]');
      expect(drawer).not.toBeNull();
      expect(document.body.querySelector('[data-slot="notification-center-popover"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("supports All/Unread tabs, mark read, mark all read, and renderLink callbacks", async () => {
    setViewportWidth(1280);
    const readIds: string[] = [];
    let markedAll = 0;
    const navigatedIds: string[] = [];

    const view = await renderInDom(
      <NotificationCenter
        items={SAMPLE_ITEMS}
        defaultOpen
        onMarkRead={(id) => readIds.push(id)}
        onMarkAllRead={() => {
          markedAll += 1;
        }}
        renderLink={({ item, className, children, onNavigate }) => (
          <a
            href={item.href}
            className={className}
            data-testid={`notif-link-${item.id}`}
            onClick={(event) => {
              event.preventDefault();
              navigatedIds.push(item.id);
              onNavigate();
            }}
          >
            {children}
          </a>
        )}
      />,
    );

    try {
      expect(document.body.querySelectorAll('[data-slot="notification-item"]').length).toBe(2);

      const unreadTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find((el) =>
        el.textContent?.includes("Unread"),
      ) as HTMLElement | undefined;
      expect(unreadTab).toBeDefined();

      await act(async () => {
        unreadTab?.click();
      });

      const visibleItems = document.body.querySelectorAll('[data-slot="notification-item"]');
      expect(visibleItems.length).toBe(1);
      expect(visibleItems[0]?.textContent).toContain("Customer import finished");

      const markReadBtn = document.body.querySelector<HTMLButtonElement>(
        '[data-slot="notification-mark-read"]',
      );
      expect(markReadBtn).not.toBeNull();
      await act(async () => {
        markReadBtn?.click();
      });
      expect(readIds).toEqual(["n1"]);

      const markAllBtn = document.body.querySelector<HTMLButtonElement>(
        '[data-slot="notification-mark-all-read"]',
      );
      expect(markAllBtn).not.toBeNull();
      await act(async () => {
        markAllBtn?.click();
      });
      expect(markedAll).toBe(1);

      const customLink = document.body.querySelector<HTMLAnchorElement>(
        '[data-testid="notif-link-n1"]',
      );
      expect(customLink).not.toBeNull();
      await act(async () => {
        customLink?.click();
      });
      expect(navigatedIds).toEqual(["n1"]);
      expect(readIds).toEqual(["n1", "n1"]);
    } finally {
      await view.cleanup();
    }
  });

  test("renders loading skeleton and empty 'You're all caught up' state", async () => {
    setViewportWidth(1280);
    const loadingView = await renderInDom(<NotificationCenter items={[]} isLoading defaultOpen />);
    try {
      expect(
        document.body.querySelector('[data-slot="notification-center-loading"]'),
      ).not.toBeNull();
      expect(document.body.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    } finally {
      await loadingView.cleanup();
    }

    const emptyView = await renderInDom(<NotificationCenter items={[]} defaultOpen />);
    try {
      const empty = document.body.querySelector('[data-slot="notification-center-empty"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain("You're all caught up");
    } finally {
      await emptyView.cleanup();
    }
  });

  test("wraps long linkless notification title and description without clipping classes", async () => {
    setViewportWidth(1280);
    const longTitle =
      "Customer CSV import finished with 14 row-level validation warnings requiring manual review";
    const longDescription =
      "Rows 12, 18, 24, 31, and 44 failed E.164 phone parsing because country dial codes were omitted; re-export the affected rows and correct the phone column before re-importing.";

    const view = await renderInDom(
      <NotificationCenter
        defaultOpen
        items={[
          {
            id: "warn-1",
            title: longTitle,
            description: longDescription,
            timestamp: "Just now",
            read: false,
          },
        ]}
      />,
    );

    try {
      const item = document.body.querySelector('[data-slot="notification-item"]');
      expect(item).not.toBeNull();
      expect(item?.textContent).toContain(longTitle);
      expect(item?.textContent).toContain(longDescription);
      expect(Boolean(item?.querySelector(".truncate"))).toBe(false);
      expect(Boolean(item?.querySelector(".line-clamp-2"))).toBe(false);
    } finally {
      await view.cleanup();
    }
  });
});
