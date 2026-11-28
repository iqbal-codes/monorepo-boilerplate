import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
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

const win = new Window({ url: "http://localhost/customers" });
win.HTMLElement.prototype.scrollIntoView ??= () => {};
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "MutationObserver",
  "ResizeObserver",
  "location",
  "history",
  "navigator",
  "getComputedStyle",
  "scrollTo",
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
  HTMLButtonElement: win.HTMLButtonElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  PointerEvent: win.PointerEvent,
  KeyboardEvent: win.KeyboardEvent,
  MutationObserver: win.MutationObserver,
  ResizeObserver: MockResizeObserver,
  location: win.location,
  history: win.history,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  scrollTo: win.scrollTo.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

mock.module("@/lib/server-url", () => ({
  serverUrl: "http://localhost:3000",
  getServerUrl: (url: string) => url,
}));

const { QueryClient, QueryClientProvider, keepPreviousData, notifyManager, useQuery } =
  await import("@tanstack/react-query");
const { createRootRoute, createRouter, createMemoryHistory, RouterProvider } =
  await import("@tanstack/react-router");
const { NuqsAdapter } = await import("nuqs/adapters/tanstack-router");
const { MAX_CUSTOMER_FILTER_TAGS } =
  await import("@monorepo-boilerplate/api/customer-filter-limits");
const { customerExportRequest } = await import("../src/lib/customer-export");
const { createRoot } = await import("react-dom/client");
const { useListSearchParams, customerListSearch } =
  await import("../src/lib/use-data-table-search-params");
const { CustomersTableView } = await import("../src/components/customers/customers-table-view");

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
    rerender: async (next: React.ReactNode) => {
      await act(async () => {
        root.render(next);
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

function click(el: Element) {
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}

const SAMPLE_ROWS = [
  {
    id: "cust-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+15550100",
    company: "Analytical Engines",
    status: "active" as const,
    balanceMinor: 123450,
    currency: "USD",
    avatarUrl: "/uploads/ada.png",
    tags: ["vip", "enterprise"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "cust-2",
    name: "Grace Hopper",
    email: "grace@example.com",
    phone: null,
    company: null,
    status: "archived" as const,
    balanceMinor: -500,
    currency: "USD",
    avatarUrl: null,
    tags: ["onboarding"],
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

describe("useListSearchParams with nuqs (TC-05)", () => {
  test("reads and updates multi-value statuses and tags cleanly via nuqs", async () => {
    const updates: Array<{ queryString: string }> = [];
    let resolveNextUpdate: ((queryString: string) => void) | null = null;
    const waitForUrlUpdate = () =>
      new Promise<string>((resolve) => {
        resolveNextUpdate = resolve;
      });
    let latest!: ReturnType<typeof useListSearchParams>;

    function Probe() {
      latest = useListSearchParams({
        sortKeys: ["name", "createdAt"] as const,
        defaultSortKey: "createdAt",
      });
      return <output>{JSON.stringify({ statuses: latest.statuses, tags: latest.tags })}</output>;
    }

    const Wrapper = withNuqsTestingAdapter({
      searchParams: "?statuses=active,inactive&tags=vip,onboarding&page=2",
      hasMemory: true,
      onUrlUpdate: (event) => {
        updates.push({ queryString: event.queryString });
        resolveNextUpdate?.(event.queryString);
        resolveNextUpdate = null;
      },
    });

    const view = await renderInDom(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );

    try {
      expect(latest.statuses).toEqual(["active", "inactive"]);
      expect(latest.tags).toEqual(["vip", "onboarding"]);
      expect(latest.pagination.pageIndex).toBe(2);

      const p1 = waitForUrlUpdate();
      await act(async () => {
        latest.setStatuses(["archived"]);
        expect(await p1).toContain("statuses=archived");
      });
      expect(latest.statuses).toEqual(["archived"]);
      expect(latest.pagination.pageIndex).toBe(0);

      const p2 = waitForUrlUpdate();
      await act(async () => {
        latest.setTags(["enterprise"]);
        expect(await p2).toContain("tags=enterprise");
      });
      expect(latest.tags).toEqual(["enterprise"]);

      const p3 = waitForUrlUpdate();
      await act(async () => {
        latest.clearFilters();
        expect(await p3).toBe("");
      });
      expect(latest.statuses).toEqual([]);
      expect(latest.tags).toEqual([]);
      expect(latest.search).toBe("");
    } finally {
      await view.cleanup();
    }
  });

  test("retains numeric-looking, literal %2C and comma tags after routing and reloading", async () => {
    async function assertReloadedTags(expected: string[]) {
      const search = customerListSearch({ tags: expected });
      function Probe() {
        const { tags } = useListSearchParams({
          sortKeys: ["createdAt"],
          defaultSortKey: "createdAt",
        });
        return <output>{JSON.stringify(tags)}</output>;
      }
      const router = createRouter({
        routeTree: createRootRoute({
          component: () => (
            <NuqsAdapter>
              <Probe />
            </NuqsAdapter>
          ),
        }),
        history: createMemoryHistory({ initialEntries: [`/${search}`] }),
      });
      await router.load();
      const view = await renderInDom(<RouterProvider router={router} />);
      try {
        expect(view.host.querySelector("output")?.textContent).toBe(JSON.stringify(expected));
      } finally {
        await view.cleanup();
      }
    }
    await assertReloadedTags(["1e2"]);
    await assertReloadedTags(["%2C"]);
    await assertReloadedTags([",", "%2C", "1e2", "true", "null", "x & + # café", "~1", "a,b"]);
  });

  test("bounds both incoming URL tags and writes to the shared API limit", async () => {
    const tags = Array.from({ length: MAX_CUSTOMER_FILTER_TAGS + 1 }, (_, i) => `tag-${i}`);
    let latest!: ReturnType<typeof useListSearchParams>;
    function Probe() {
      latest = useListSearchParams({ sortKeys: ["createdAt"], defaultSortKey: "createdAt" });
      return null;
    }
    const { promise, resolve } = Promise.withResolvers<string>();
    const Wrapper = withNuqsTestingAdapter({
      searchParams: `?tags=${[tags[0], ...tags].join(",")}&page=2`,
      hasMemory: true,
      onUrlUpdate: (event) => resolve(event.queryString),
    });
    const view = await renderInDom(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
    try {
      expect(latest.tags).toEqual(tags.slice(0, MAX_CUSTOMER_FILTER_TAGS));
      const reversed = tags.toReversed();
      await act(async () => {
        latest.setTags(reversed);
        const url = new URLSearchParams(await promise);
        expect(url.get("tags")?.split(",")).toEqual(reversed.slice(0, MAX_CUSTOMER_FILTER_TAGS));
      });
      expect(latest.tags).toEqual(reversed.slice(0, MAX_CUSTOMER_FILTER_TAGS));
      expect(latest.pagination.pageIndex).toBe(0);
    } finally {
      await view.cleanup();
    }
  });

  test("decodes both filter arrays from the download request", async () => {
    const filters = { statuses: ["active", "inactive"] as const, tags: ["a,b", "%2C"] };
    const request = await customerExportRequest({
      ...filters,
      statuses: [...filters.statuses],
      status: "all",
      sortBy: "createdAt",
      sortDir: "desc",
    })();
    const url = new URL(request.url);
    expect(url.pathname).toBe("/trpc/customers.export");
    expect(url.search).toBe("");
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(request.body!)).toMatchObject(filters);
  });

  test("customerListSearch keeps Command Center link serialization working", () => {
    expect(customerListSearch({ q: "ada", page: 0, status: "all" })).toBe("?q=ada");
  });
});

describe("CustomersTableView states & RowActions (TC-01, TC-04, TC-05)", () => {
  let lastViewId = "";
  let lastEditId = "";
  let lastArchiveIds: string[] = [];
  let lastRestore: { id: string; status: "active" | "inactive" } | null = null;
  let lastDeleteId = "";

  beforeEach(() => {
    lastViewId = "";
    lastEditId = "";
    lastArchiveIds = [];
    lastRestore = null;
    lastDeleteId = "";
  });

  function makeProps(overrides: Record<string, unknown> = {}) {
    return {
      rows: SAMPLE_ROWS,
      rowCount: 2,
      facets: {
        status: { active: 1, inactive: 0, archived: 1 },
        tags: [
          { value: "vip", count: 1 },
          { value: "enterprise", count: 1 },
          { value: "onboarding", count: 1 },
        ],
      },
      search: "",
      searchInput: "",
      onSearchInputChange: () => {},
      statuses: [] as Array<"active" | "inactive" | "archived">,
      onStatusesChange: () => {},
      tags: [] as string[],
      onTagsChange: () => {},
      onClearFilters: () => {},
      onResetFilters: () => {},
      pagination: { pageIndex: 0, pageSize: 20 },
      onPaginationChange: () => {},
      sorting: [{ id: "createdAt", desc: true }],
      onSortingChange: () => {},
      density: "comfortable" as const,
      onDensityChange: () => {},
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: undefined,
      onRetry: () => {},
      hasCurrentResults: true,
      canDelete: false,
      onNewCustomer: () => {},
      onViewCustomer: (id: string) => {
        lastViewId = id;
      },
      onEditCustomer: (id: string) => {
        lastEditId = id;
      },
      onArchiveCustomers: async (ids: string[]) => {
        lastArchiveIds = ids;
      },
      archiving: false,
      onRestoreCustomer: async (id: string, status: "active" | "inactive") => {
        lastRestore = { id, status };
      },
      restoring: false,
      onDeleteCustomer: async (id: string) => {
        lastDeleteId = id;
      },
      deleting: false,
      renderCustomerLink: ({ customerId, children, className }: any) => (
        <a href={`/customers/${customerId}`} className={className}>
          {children}
        </a>
      ),
      ...overrides,
    };
  }

  test("renders populated default (no Row 2 chips, no active BulkActionBar, Avatar + StatusBadge)", async () => {
    const view = await renderInDom(<CustomersTableView {...makeProps()} />);
    try {
      expect(view.host.querySelector("[data-slot='active-filter-chips']")).toBeNull();
      const bulkBar = view.host.querySelector("[data-slot='bulk-action-bar']");
      expect(bulkBar?.className).toContain("sr-only");
      expect(bulkBar?.querySelector("button")).toBeNull();
      expect(view.host.querySelectorAll("[data-slot='avatar']").length).toBeGreaterThanOrEqual(2);
      expect(view.host.textContent).toContain("GH");
      expect(
        view.host.querySelectorAll("[data-slot='status-badge']").length,
      ).toBeGreaterThanOrEqual(2);
      expect(view.host.textContent).toContain("Active");
      expect(view.host.textContent).toContain("Archived");
      expect(view.host.querySelector('[data-slot="status-badge-dot"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("omits redundant Row 2 chips, shows filtered field count on mobile button, skeletons when loading, rail when fetching, error with Retry, and disables bulk selection in Archived view", async () => {
    let retried = 0;
    const view = await renderInDom(
      <CustomersTableView
        {...makeProps({
          statuses: ["active", "inactive"],
          tags: ["vip"],
          isFetching: true,
        })}
      />,
    );

    try {
      expect(Boolean(view.host.querySelector("[data-slot='active-filter-chips']"))).toBe(false);
      const toolbarText = view.host.querySelector("[data-slot='list-toolbar']")?.textContent ?? "";
      expect(toolbarText).toContain("Active");
      expect(toolbarText).toContain("vip");
      const mobileFilterBtn = [
        ...view.host.querySelectorAll('button[aria-haspopup="dialog"]'),
      ].find((button) => button.textContent?.startsWith("Filters"))!;
      expect(mobileFilterBtn.getAttribute("aria-label")).toBe("Filters (2 active)");
      expect(mobileFilterBtn.textContent).toContain("2");
      expect(view.host.querySelector("[data-slot='data-table']")?.getAttribute("aria-busy")).toBe(
        "true",
      );

      // Archived view disables bulk archive selection checkboxes
      await view.rerender(
        <CustomersTableView
          {...makeProps({
            statuses: ["archived"],
            rows: [SAMPLE_ROWS[1]!],
            rowCount: 1,
          })}
        />,
      );
      expect(
        view.host.querySelector('input[aria-label="Select all customers on this page"]'),
      ).toBeNull();
      expect(
        view.host.querySelector('[aria-label="Select all customers on this page"]'),
      ).toBeNull();

      // Loading skeletons
      await view.rerender(
        <CustomersTableView
          {...makeProps({
            rows: [],
            rowCount: 0,
            isLoading: true,
          })}
        />,
      );
      expect(view.host.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);

      // Error state with Retry
      await view.rerender(
        <CustomersTableView
          {...makeProps({
            isError: true,
            errorMessage: "Network down",
            onRetry: () => {
              retried += 1;
            },
          })}
        />,
      );
      expect(view.host.textContent).toContain("Could not load customers");
      const retryBtn = [...view.host.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Retry",
      )!;
      await act(async () => {
        click(retryBtn);
      });
      expect(retried).toBe(1);
    } finally {
      await view.cleanup();
    }
  });

  test("wires RowActions (View, Edit, Archive, explicit Restore, admin-gated Delete) without triggering row Edit", async () => {
    const view = await renderInDom(<CustomersTableView {...makeProps({ canDelete: false })} />);

    try {
      // Non-admin: Delete must not be rendered
      const adaTrigger = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Actions for Ada Lovelace"]',
      )!;
      await act(async () => {
        click(adaTrigger);
      });
      const menuLabels = [...document.body.querySelectorAll("[role='menuitem']")].map((m) =>
        m.textContent?.trim(),
      );
      expect(menuLabels).toContain("View");
      expect(menuLabels).toContain("Edit");
      expect(menuLabels).toContain("Archive");
      expect(menuLabels).not.toContain("Delete");

      // Click View -> invokes onViewCustomer, NOT onEditCustomer
      const viewItem = [...document.body.querySelectorAll("[role='menuitem']")].find(
        (m) => m.textContent?.trim() === "View",
      )!;
      await act(async () => {
        click(viewItem);
      });
      expect(lastViewId).toBe("cust-1");
      expect(lastEditId).toBe("");

      // Click Archive -> opens Archive dialog and confirms onArchiveCustomers(["cust-1"])
      await act(async () => {
        click(adaTrigger);
      });
      const archiveItem = [...document.body.querySelectorAll("[role='menuitem']")].find(
        (m) => m.textContent?.trim() === "Archive",
      )!;
      await act(async () => {
        click(archiveItem);
      });
      const archiveDialog = document.body.querySelector("[role='alertdialog']")!;
      expect(archiveDialog.textContent).toContain("Archive customer?");
      const archiveConfirmBtn = [...archiveDialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Archive customer",
      )!;
      await act(async () => {
        click(archiveConfirmBtn);
      });
      expect(lastArchiveIds).toEqual(["cust-1"]);
      expect(lastEditId).toBe("");

      // Admin user sees Delete on archived row + Restore with explicit Active/Inactive dialog
      await view.rerender(<CustomersTableView {...makeProps({ canDelete: true })} />);
      const graceTrigger = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Actions for Grace Hopper"]',
      )!;
      await act(async () => {
        click(graceTrigger);
      });
      const archivedLabels = [...document.body.querySelectorAll("[role='menuitem']")].map((m) =>
        m.textContent?.trim(),
      );
      expect(archivedLabels).toContain("Restore");
      expect(archivedLabels).toContain("Delete");

      const restoreItem = [...document.body.querySelectorAll("[role='menuitem']")].find(
        (m) => m.textContent?.trim() === "Restore",
      )!;
      await act(async () => {
        click(restoreItem);
      });
      const restoreDialog = document.body.querySelector("[role='dialog']")!;
      expect(restoreDialog.textContent).toContain("Restore customer");
      const inactiveRadio = restoreDialog.querySelector<HTMLElement>("#restore-status-inactive")!;
      await act(async () => {
        click(inactiveRadio);
      });
      const restoreConfirmBtn = [...restoreDialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Restore customer",
      )!;
      await act(async () => {
        click(restoreConfirmBtn);
      });
      expect(lastRestore).toEqual({ id: "cust-2", status: "inactive" });

      // Admin Delete confirmation
      await act(async () => {
        click(graceTrigger);
      });
      const deleteItem = [...document.body.querySelectorAll("[role='menuitem']")].find(
        (m) => m.textContent?.trim() === "Delete",
      )!;
      await act(async () => {
        click(deleteItem);
      });
      const deleteDialog = document.body.querySelector("[role='alertdialog']")!;
      const deleteConfirmBtn = [...deleteDialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Delete customer",
      )!;
      await act(async () => {
        click(deleteConfirmBtn);
      });
      expect(lastDeleteId).toBe("cust-2");
    } finally {
      await view.cleanup();
    }
  });

  test("blocks Delete on retained rows during a deferred filter and discards staged confirmations", async () => {
    const response = Promise.withResolvers<typeof SAMPLE_ROWS>();
    const started = Promise.withResolvers<void>();
    const nextQueryNotification = Promise.withResolvers<() => void>();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["customers-test", "all"], SAMPLE_ROWS);
    let setStatus!: (status: "all" | "archived") => void;
    function Harness() {
      const [status, selectStatus] = React.useState<"all" | "archived">("all");
      setStatus = selectStatus;
      const list = useQuery({
        queryKey: ["customers-test", status],
        queryFn: () => {
          if (status === "all") return Promise.resolve(SAMPLE_ROWS);
          started.resolve();
          return response.promise;
        },
        placeholderData: keepPreviousData,
        staleTime: Infinity,
      });
      return (
        <CustomersTableView
          {...makeProps({
            canDelete: true,
            rows: list.data ?? [],
            statuses: status === "all" ? [] : [status],
            hasCurrentResults: list.isSuccess && !list.isPlaceholderData,
            isFetching: list.isFetching,
          })}
        />
      );
    }
    const view = await renderInDom(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
    const ada = () =>
      view.host.querySelector<HTMLButtonElement>('button[aria-label="Actions for Ada Lovelace"]')!;
    const deleteItem = () =>
      [...document.querySelectorAll('[role="menuitem"]')].find(
        (item) => item.textContent?.trim() === "Delete",
      )!;
    try {
      await act(async () => click(ada()));
      await act(async () => click(deleteItem()));
      expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
        "Delete customer permanently?",
      );
      // Keep the new request pending, so the previous rows really are still on screen.
      await act(async () => setStatus("archived"));
      await started.promise;
      expect(view.host.textContent).toContain("Ada Lovelace");
      expect(view.host.querySelector('[data-slot="data-table"]')?.getAttribute("aria-busy")).toBe(
        "true",
      );
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      expect(ada().disabled).toBe(true);
      expect(ada().closest("[inert]")).not.toBeNull();
      await act(async () => click(ada()));
      expect(deleteItem()).toBeUndefined();
      expect(lastDeleteId).toBe("");

      notifyManager.setNotifyFunction(nextQueryNotification.resolve);
      try {
        await act(async () => {
          response.resolve([SAMPLE_ROWS[1]!]);
          const notify = await nextQueryNotification.promise;
          notify();
        });
      } finally {
        notifyManager.setNotifyFunction((notify) => notify());
      }
      expect(ada()).toBeNull();
      expect(
        view.host.querySelector<HTMLButtonElement>('button[aria-label="Actions for Grace Hopper"]')
          ?.disabled,
      ).toBe(false);
      // Returning to a cached scope must not resurrect its staged confirmation.
      await act(async () => setStatus("all"));
      expect(ada().disabled).toBe(false);
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
      await act(async () => click(ada()));
      expect(deleteItem()?.textContent).toBe("Delete");
      expect(lastDeleteId).toBe("");
    } finally {
      response.resolve([]);
      await view.cleanup();
      client.clear();
    }
  });

  test("prevents a 51st tag in both pickers and permits replacing a selection", async () => {
    const available = Array.from(
      { length: MAX_CUSTOMER_FILTER_TAGS + 1 },
      (_, i) => `tag-${String(i).padStart(2, "0")}`,
    );
    const initial = available.slice(0, -1);
    const extra = available.at(-1)!;
    const changes = mock<(tags: readonly string[]) => void>();
    function Harness() {
      const [tags, setTags] = React.useState<readonly string[]>(initial);
      return (
        <CustomersTableView
          {...makeProps({
            facets: {
              status: { active: 1, inactive: 0, archived: 1 },
              tags: available.map((value) => ({ value, count: 1 })),
            },
            tags,
            onTagsChange: (next: readonly string[]) => {
              changes(next);
              setTags(next);
            },
          })}
        />
      );
    }
    const view = await renderInDom(<Harness />);
    try {
      const tagTrigger = [
        ...view.host.querySelectorAll('[data-slot="faceted-filter-trigger"]'),
      ].find((button) => button.textContent?.includes("Tags"))!;
      await act(async () => click(tagTrigger));
      const option = (tag: string) =>
        [...document.querySelectorAll('[data-slot="command-item"]')].find((el) =>
          el.textContent?.startsWith(tag),
        )!;
      expect(option(extra).getAttribute("aria-disabled")).toBe("true");
      await act(async () => click(option(extra)));
      expect(changes).not.toHaveBeenCalled();
      await act(async () => click(option(initial[0]!)));
      expect(option(extra).getAttribute("aria-disabled")).toBe("false");
      await act(async () => click(option(extra)));
      expect(changes).toHaveBeenLastCalledWith([...initial.slice(1), extra]);
      await act(async () => click(tagTrigger));

      const filterButton = [...view.host.querySelectorAll('button[aria-haspopup="dialog"]')].find(
        (button) => button.textContent?.startsWith("Filters"),
      )!;
      await act(async () => click(filterButton));
      const checkbox = (tag: string) =>
        [...document.querySelectorAll('[data-slot="drawer-content"] label')]
          .find((label) => label.textContent?.startsWith(tag))!
          .querySelector('[role="checkbox"]')!;
      expect(checkbox(initial[0]!).getAttribute("aria-disabled")).toBe("true");
      const toggle = (tag: string) =>
        checkbox(tag)
          .parentElement!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
          .click();
      await act(async () => toggle(initial[0]!));
      expect(changes).toHaveBeenCalledTimes(2);
      await act(async () => toggle(extra));
      expect(checkbox(initial[0]!).getAttribute("aria-disabled")).not.toBe("true");
      await act(async () => toggle(initial[0]!));
      expect(changes).toHaveBeenLastCalledWith([...initial.slice(1), initial[0]]);
    } finally {
      await view.cleanup();
    }
  });

  test("renders filtered empty vs org empty and clears selection when filters change (TC-01, TC-05)", async () => {
    let resetCalls = 0;
    let newCustomerCalls = 0;
    let densityChanges: Array<"comfortable" | "compact"> = [];

    const view = await renderInDom(
      <CustomersTableView
        {...makeProps({
          onResetFilters: () => {
            resetCalls += 1;
          },
          onNewCustomer: () => {
            newCustomerCalls += 1;
          },
          onDensityChange: (next: "comfortable" | "compact") => {
            densityChanges.push(next);
          },
        })}
      />,
    );

    try {
      // Select the active row (Ada Lovelace)
      const adaCheckbox = view.host.querySelector<HTMLElement>(
        '[role="checkbox"][aria-label*="Ada Lovelace"]',
      )!;
      const adaInput = adaCheckbox
        .closest("td, div")!
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      await act(async () => {
        adaInput.click();
      });
      expect(view.host.querySelector("[data-slot='bulk-action-bar']")?.textContent).toContain(
        "1 selected",
      );

      // Change filters -> row selection must clear immediately
      await view.rerender(
        <CustomersTableView
          {...makeProps({
            statuses: ["active"],
            onDensityChange: (next: "comfortable" | "compact") => {
              densityChanges.push(next);
            },
          })}
        />,
      );
      expect(view.host.querySelector("[data-slot='bulk-action-bar']")?.className).toContain(
        "sr-only",
      );

      // View options: switch density to compact inside CustomersTableView
      const viewBtn = view.host.querySelector<HTMLButtonElement>(
        "[data-slot='data-table-view-options-trigger']",
      )!;
      await act(async () => {
        click(viewBtn);
      });
      const compactBtn = [...document.body.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Compact",
      )!;
      await act(async () => {
        click(compactBtn);
      });
      expect(densityChanges).toContain("compact");

      // Filtered empty state
      await view.rerender(
        <CustomersTableView
          {...makeProps({
            rows: [],
            rowCount: 0,
            statuses: ["inactive"],
            onResetFilters: () => {
              resetCalls += 1;
            },
          })}
        />,
      );
      expect(view.host.textContent).toContain("No customers found");
      expect(view.host.textContent).toContain("Nothing matches these filters.");
      const clearEmptyBtn = [...view.host.querySelectorAll("[data-slot='empty'] button")].find(
        (b) => b.textContent?.trim() === "Clear filters",
      )!;
      await act(async () => {
        click(clearEmptyBtn);
      });
      expect(resetCalls).toBe(1);

      // Org empty state (no active filters)
      await view.rerender(
        <CustomersTableView
          {...makeProps({
            rows: [],
            rowCount: 0,
            onNewCustomer: () => {
              newCustomerCalls += 1;
            },
          })}
        />,
      );
      expect(view.host.textContent).toContain(
        "Create the first customer to populate the reference flow.",
      );
      const newCustomerBtn = [...view.host.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "New customer",
      )!;
      await act(async () => {
        click(newCustomerBtn);
      });
      expect(newCustomerCalls).toBe(1);
    } finally {
      await view.cleanup();
    }
  });

  test("wires mobile sort drawer and infinite footer in CustomersTableView", async () => {
    let sortChanges = 0;
    let loadMoreCalls = 0;
    const view = await renderInDom(
      <CustomersTableView
        {...makeProps({
          onSortingChange: () => {
            sortChanges += 1;
          },
          mobileInfinite: {
            hasMore: true,
            isLoadingMore: false,
            totalCount: 10,
            onLoadMore: () => {
              loadMoreCalls += 1;
            },
          },
        })}
      />,
    );
    try {
      const viewTrigger = view.host.querySelector<HTMLButtonElement>(
        "[data-slot='data-table-view-options-trigger']",
      )!;
      expect(viewTrigger.className).toContain("hidden sm:inline-flex");

      const sortTrigger = view.host.querySelector<HTMLButtonElement>(
        "[data-slot='list-toolbar-sort-trigger']",
      )!;
      expect(sortTrigger).toBeTruthy();
      await act(async () => {
        click(sortTrigger);
      });
      const companyRadio = [...document.body.querySelectorAll("[data-slot='drawer-content'] label")]
        .find((el) => el.textContent?.includes("Company"))!
        .querySelector<HTMLInputElement>('input[type="radio"]')!;
      await act(async () => {
        companyRadio.click();
      });
      expect(sortChanges).toBe(1);

      const loadMoreBtn = [
        ...view.host.querySelectorAll("[data-slot='data-table-infinite-footer'] button"),
      ].find((btn) => btn.textContent?.includes("Load more"))!;
      await act(async () => {
        click(loadMoreBtn);
      });
      expect(loadMoreCalls).toBe(1);
    } finally {
      await view.cleanup();
    }
  });
});
