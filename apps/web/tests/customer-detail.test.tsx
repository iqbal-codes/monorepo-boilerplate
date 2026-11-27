import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname, resolve } from "node:path";
import * as React from "react";
import { act } from "react";

const uiPkgPath = resolve(import.meta.dir, "../../../packages/ui/package.json");
const { Window } = (await import(
  Bun.resolveSync("happy-dom", uiPkgPath)
)) as typeof import("happy-dom");
const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", uiPkgPath)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/customers/cust-1" });
const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "HTMLInputElement",
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
  HTMLInputElement: win.HTMLInputElement,
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

mock.module("@/lib/server-url", () => ({
  serverUrl: "http://localhost:3000",
  getServerUrl: (url: string) => url,
}));

const { createRoot } = await import("react-dom/client");
const { TooltipProvider } = await import("@monorepo-boilerplate/ui/components/tooltip");
const { CustomerDetailView, toTimelineItems } =
  await import("../src/components/customers/customer-detail");
const { assetUrl } = await import("../src/lib/asset-url");

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
    rerender: async (next: React.ReactNode) => {
      await act(async () => {
        root.render(<TooltipProvider delay={0}>{next}</TooltipProvider>);
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

const SAMPLE_CUSTOMER = {
  id: "cust-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+15550100",
  company: "Analytical Engines",
  status: "active" as const,
  balanceMinor: 123450,
  currency: "USD",
  avatarUrl: null,
  tags: ["vip", "enterprise"],
  notes: "Line 1\nLine 2",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T12:00:00.000Z",
};

const SAMPLE_EVENTS = [
  {
    id: "evt-1",
    customerId: "cust-1",
    type: "created" as const,
    actorId: "staff-1",
    actorName: "Grace Hopper",
    actorAvatarUrl: null,
    summary: "Created customer",
    body: null,
    metadata: { status: "active" },
    seq: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "evt-2",
    customerId: "cust-1",
    type: "note" as const,
    actorId: "staff-1",
    actorName: "Grace Hopper",
    actorAvatarUrl: null,
    summary: "Added a note",
    body: "Initial onboarding call complete.",
    metadata: null,
    seq: 2,
    createdAt: "2026-01-02T10:00:00.000Z",
  },
];

function noopAsync() {
  return Promise.resolve();
}

function renderBackLink({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <a href="/customers" className={className}>
      {children}
    </a>
  );
}

describe("CustomerDetailView", () => {
  test("TC-01: renders Identity Header with 48px Avatar initials, StatusBadge, copyable email, tags, DescriptionList, Notes, and ActivityTimeline", async () => {
    const view = await renderInDom(
      <CustomerDetailView
        customer={SAMPLE_CUSTOMER}
        isLoading={false}
        events={SAMPLE_EVENTS}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      const avatar = view.host.querySelector('[data-slot="avatar"]');
      expect(avatar?.getAttribute("data-size")).toBe("xl");
      expect(avatar?.textContent).toContain("AL");

      const statusBadges = view.host.querySelectorAll('[data-slot="status-badge"]');
      expect(statusBadges.length).toBeGreaterThanOrEqual(1);
      expect(statusBadges[0]?.textContent).toContain("Active");

      expect(view.host.querySelector('button[aria-label="Copy email"]')).not.toBeNull();
      const tags = view.host.querySelector('[data-slot="customer-tags"]');
      expect(tags?.textContent).toContain("vip");
      expect(tags?.textContent).toContain("enterprise");

      expect(view.host.querySelector('[data-slot="description-list"]')).not.toBeNull();
      expect(view.host.textContent).toContain("$1,234.50");
      expect(view.host.textContent).toContain("Line 1\nLine 2");
      expect(view.host.textContent).toContain("Initial onboarding call complete.");
    } finally {
      await view.cleanup();
    }
  });

  test("TC-02: renders loading skeletons for header, details, notes, and timeline rows", async () => {
    const view = await renderInDom(
      <CustomerDetailView
        customer={undefined}
        isLoading
        events={[]}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      expect(view.host.querySelector('[data-slot="customer-detail-skeleton"]')).not.toBeNull();
      expect(view.host.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(5);
      expect(view.host.querySelectorAll('[data-slot="activity-timeline-skeleton"]').length).toBe(3);
    } finally {
      await view.cleanup();
    }
  });

  test("TC-03: renders empty notes, empty timeline with composer visible, and omits empty tags strip", async () => {
    const view = await renderInDom(
      <CustomerDetailView
        customer={{ ...SAMPLE_CUSTOMER, notes: null, tags: [] }}
        isLoading={false}
        events={[]}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      expect(view.host.querySelector('[data-slot="customer-tags"]')).toBeNull();
      expect(view.host.textContent).toContain("No notes.");
      expect(view.host.textContent).toContain("No activity yet.");
      expect(
        view.host.querySelector('[data-slot="activity-timeline-composer"] textarea'),
      ).not.toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("TC-04: renders 404 StatusScreen with Back to customers for missing ID and inline Retry when timeline fails", async () => {
    const missingView = await renderInDom(
      <CustomerDetailView
        customer={null}
        isLoading={false}
        events={[]}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );
    try {
      const statusScreen = missingView.host.querySelector('[data-slot="status-screen"]');
      expect(statusScreen?.getAttribute("data-status")).toBe("404");
      const backLink = missingView.host.querySelector('a[href="/customers"]');
      expect(backLink?.textContent).toContain("Back to customers");
    } finally {
      await missingView.cleanup();
    }

    let retried = 0;
    const timelineErrorView = await renderInDom(
      <CustomerDetailView
        customer={SAMPLE_CUSTOMER}
        isLoading={false}
        events={[]}
        eventsError="Timeline unavailable"
        onRetryEvents={() => {
          retried += 1;
        }}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );
    try {
      // Details remain intact while Activity shows inline Retry.
      expect(timelineErrorView.host.querySelector('[data-slot="description-list"]')).not.toBeNull();
      expect(timelineErrorView.host.textContent).toContain("Analytical Engines");
      const alert = timelineErrorView.host.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("Timeline unavailable");
      const retryBtn = Array.from(timelineErrorView.host.querySelectorAll("button")).find(
        (btn) => btn.textContent?.trim() === "Retry",
      );
      expect(retryBtn).not.toBeUndefined();
      await act(async () => {
        retryBtn?.click();
      });
      expect(retried).toBe(1);
    } finally {
      await timelineErrorView.cleanup();
    }
  });

  test("TC-05: archived customer surfaces Archived StatusBadge and Restore with explicit Active or Inactive choice", async () => {
    const restoredStatuses: Array<"active" | "inactive"> = [];
    const view = await renderInDom(
      <CustomerDetailView
        customer={{ ...SAMPLE_CUSTOMER, status: "archived" }}
        isLoading={false}
        events={SAMPLE_EVENTS}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={async (status) => {
          restoredStatuses.push(status);
        }}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      const badge = view.host.querySelector('[data-slot="status-badge"]');
      expect(badge?.getAttribute("data-tone")).toBe("warning");
      expect(badge?.textContent).toContain("Archived");

      const restoreTrigger = Array.from(view.host.querySelectorAll("button")).find(
        (btn) => btn.textContent?.trim() === "Restore",
      );
      expect(restoreTrigger).not.toBeUndefined();

      await act(async () => {
        restoreTrigger?.click();
      });

      const dialog = document.body.querySelector('[data-slot="dialog-content"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("Restore customer");

      // Confirm button must stay disabled until an explicit Active or Inactive choice is made.
      const confirmBtn = Array.from(dialog?.querySelectorAll("button") ?? []).find(
        (btn) => btn.textContent?.trim() === "Restore customer",
      ) as HTMLButtonElement | undefined;
      expect(confirmBtn?.disabled).toBe(true);

      const inactiveRadio = document.body.querySelector<HTMLElement>("#restore-status-inactive");
      await act(async () => {
        inactiveRadio?.click();
      });
      expect(confirmBtn?.disabled).toBe(false);

      await act(async () => {
        confirmBtn?.click();
      });

      expect(restoredStatuses).toEqual(["inactive"]);
    } finally {
      await view.cleanup();
    }
  });

  test("TC-08: gates permanent Delete to administrators behind ConfirmationDialog", async () => {
    const staffView = await renderInDom(
      <CustomerDetailView
        customer={SAMPLE_CUSTOMER}
        isLoading={false}
        events={[]}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        canDelete={false}
        onDelete={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      const moreBtn = staffView.host.querySelector<HTMLButtonElement>(
        'button[aria-label="More customer actions"]',
      );
      await act(async () => {
        moreBtn?.click();
      });
      const menuItems = [...document.body.querySelectorAll('[role="menuitem"]')].map((el) =>
        el.textContent?.trim(),
      );
      expect(menuItems).toContain("Archive");
      expect(menuItems).not.toContain("Delete");
    } finally {
      await staffView.cleanup();
    }

    let deleteCalls = 0;
    const adminView = await renderInDom(
      <CustomerDetailView
        customer={SAMPLE_CUSTOMER}
        isLoading={false}
        events={[]}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        canDelete
        onDelete={async () => {
          deleteCalls += 1;
        }}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      const moreBtn = adminView.host.querySelector<HTMLButtonElement>(
        'button[aria-label="More customer actions"]',
      );
      await act(async () => {
        moreBtn?.click();
      });
      const deleteItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
        (el) => el.textContent?.trim() === "Delete",
      ) as HTMLElement | undefined;
      expect(deleteItem).not.toBeUndefined();

      await act(async () => {
        deleteItem?.click();
      });

      const alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog?.textContent).toContain("Delete customer permanently?");
      const confirmDelete = Array.from(alertDialog?.querySelectorAll("button") ?? []).find(
        (btn) => btn.textContent?.trim() === "Delete customer",
      );
      await act(async () => {
        confirmDelete?.click();
      });
      expect(deleteCalls).toBe(1);
    } finally {
      await adminView.cleanup();
    }
  });

  test("SEAM-02: closes Delete confirmation when navigating Back from customer B to cached customer A", async () => {
    const deletedIds: string[] = [];
    const customerA = { ...SAMPLE_CUSTOMER, id: "cust-a", name: "Customer A" };
    const customerB = { ...SAMPLE_CUSTOMER, id: "cust-b", name: "Customer B" };

    function renderForId(active: typeof customerA) {
      return (
        <CustomerDetailView
          key={active.id}
          customer={active}
          isLoading={false}
          events={[]}
          onAddNote={noopAsync}
          onEdit={() => {}}
          onArchive={noopAsync}
          onRestore={noopAsync}
          canDelete
          onDelete={async () => {
            deletedIds.push(active.id);
          }}
          renderBackLink={renderBackLink}
        />
      );
    }

    const view = await renderInDom(renderForId(customerB));
    try {
      const moreBtn = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="More customer actions"]',
      );
      await act(async () => {
        moreBtn?.click();
      });
      const deleteItem = Array.from(document.body.querySelectorAll('[role="menuitem"]')).find(
        (el) => el.textContent?.trim() === "Delete",
      ) as HTMLElement | undefined;
      await act(async () => {
        deleteItem?.click();
      });
      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).not.toBeNull();

      // Navigate Back to cached customer A before confirming Delete.
      await view.rerender(renderForId(customerA));

      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
      expect(view.host.textContent).toContain("Customer A");
      expect(deletedIds).toEqual([]);
    } finally {
      await view.cleanup();
    }
  });

  test("SEAM-03 & SEAM-06: falls back to initials for malformed legacy avatarUrl and passes exhaustive event icons", async () => {
    expect(assetUrl("//bad authority")).toBeNull();
    expect(assetUrl("http://[invalid")).toBeNull();
    expect(assetUrl("javascript:alert(1)")).toBeNull();
    expect(assetUrl("/uploads/ok.png")).toBe("http://localhost:3000/uploads/ok.png");

    const timelineItems = toTimelineItems(SAMPLE_EVENTS);
    expect(timelineItems.every((item) => Boolean(item.icon && item.iconClassName))).toBe(true);

    const view = await renderInDom(
      <CustomerDetailView
        customer={{ ...SAMPLE_CUSTOMER, avatarUrl: "http://[invalid" }}
        isLoading={false}
        events={[{ ...SAMPLE_EVENTS[0]!, actorAvatarUrl: "//bad authority" }]}
        onAddNote={noopAsync}
        onEdit={() => {}}
        onArchive={noopAsync}
        onRestore={noopAsync}
        renderBackLink={renderBackLink}
      />,
    );

    try {
      expect(view.host.querySelector("img")).toBeNull();
      expect(view.host.querySelector('[data-slot="avatar"]')?.textContent).toContain("AL");
    } finally {
      await view.cleanup();
    }
  });
});
