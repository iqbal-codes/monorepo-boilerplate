import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/checkbox", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
win.HTMLElement.prototype.scrollIntoView ??= () => {};

const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
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
  static instances = new Set<MockResizeObserver>();
  targets = new Set<Element>();

  constructor(private callback: () => void) {
    MockResizeObserver.instances.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    MockResizeObserver.instances.delete(this);
  }

  static resize(target: Element) {
    for (const observer of this.instances) {
      if (observer.targets.has(target)) observer.callback();
    }
  }
}

const originalWinResizeObserver = win.ResizeObserver;
win.ResizeObserver = MockResizeObserver as unknown as typeof win.ResizeObserver;

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  ShadowRoot: win.ShadowRoot,
  HTMLElement: win.HTMLElement,
  HTMLButtonElement: win.HTMLButtonElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  KeyboardEvent: win.KeyboardEvent,
  MutationObserver: win.MutationObserver,
  ResizeObserver: MockResizeObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

import type { ExpandedState, SortingState } from "../src/components/data-table";

const { createRoot } = await import("react-dom/client");
const { columnsFor, DataTable } = await import("../src/components/data-table");

afterAll(() => {
  win.ResizeObserver = originalWinResizeObserver;
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

type InvoiceRow = {
  id: string;
  number: string;
  customer: string;
  notes: string;
};

const helper = columnsFor<InvoiceRow>();
const columns = helper.columns([
  helper.accessor("number", { header: "Invoice" }),
  helper.accessor("customer", { header: "Customer" }),
]);

const SAMPLE_ROWS: InvoiceRow[] = [
  { id: "inv-1", number: "INV-1001", customer: "Ada Lovelace", notes: "Priority audit details" },
  { id: "inv-2", number: "INV-1002", customer: "Grace Hopper", notes: "Standard renewal" },
];

describe("DataTable controlled expandable rows (TC-01, TC-02)", () => {
  test("does not mutate controlled expanded state directly and invokes onExpandedChange with row id", async () => {
    const changes: ExpandedState[] = [];
    const rowClicks: string[] = [];

    const view = await renderInDom(
      <DataTable
        data={SAMPLE_ROWS}
        columns={columns}
        getRowId={(row) => row.id}
        expanded={{}}
        onExpandedChange={(next) => changes.push(next)}
        onRowClick={(row) => rowClicks.push(row.id)}
        renderSubRow={(row) => <div data-testid={`subrow-${row.id}`}>{row.notes}</div>}
      />,
    );

    try {
      const expandButtons = [
        ...view.host.querySelectorAll<HTMLButtonElement>(
          "button[data-slot='data-table-expand-toggle']",
        ),
      ];
      expect(expandButtons.length).toBeGreaterThanOrEqual(2);
      expect(expandButtons[0]!.getAttribute("aria-expanded")).toBe("false");
      expect(view.host.querySelector("[data-testid='subrow-inv-1']")).toBeNull();

      await act(async () => {
        click(expandButtons[0]!);
      });

      // Controlled state remains empty until parent updates `expanded`; row click did not fire
      expect(changes).toEqual([{ "inv-1": true }]);
      expect(rowClicks).toEqual([]);
      expect(view.host.querySelector("[data-testid='subrow-inv-1']")).toBeNull();

      await view.rerender(
        <DataTable
          data={SAMPLE_ROWS}
          columns={columns}
          getRowId={(row) => row.id}
          expanded={{ "inv-1": true }}
          onExpandedChange={(next) => changes.push(next)}
          renderSubRow={(row) => <div data-testid={`subrow-${row.id}`}>{row.notes}</div>}
        />,
      );

      expect(view.host.querySelector("[data-testid='subrow-inv-1']")?.textContent).toBe(
        "Priority audit details",
      );
      expect(view.host.querySelector("[data-testid='subrow-inv-2']")).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("keeps expanded controls mounted but inert during refetch and explicit row disabling", async () => {
    const table = (isFetching = false, disableRows = false) => (
      <DataTable
        data={SAMPLE_ROWS}
        columns={columns}
        getRowId={(row) => row.id}
        expanded={{ "inv-1": true }}
        renderSubRow={() => (
          <button type="button" data-testid="detail-action">
            Copy details
          </button>
        )}
        isFetching={isFetching}
        disableRows={disableRows}
      />
    );
    const view = await renderInDom(table());
    try {
      const actions = [...view.host.querySelectorAll('[data-testid="detail-action"]')];
      expect(actions).toHaveLength(2);
      for (const action of actions) expect(action.closest("[inert]")).toBeNull();
      await view.rerender(table(true));
      expect([...view.host.querySelectorAll('[data-testid="detail-action"]')]).toEqual(actions);
      for (const action of actions) expect(action.closest("[inert]")).not.toBeNull();
      await view.rerender(table(false, true));
      for (const action of actions) expect(action.closest("[inert]")).not.toBeNull();
      await view.rerender(table());
      for (const action of actions) expect(action.closest("[inert]")).toBeNull();
    } finally {
      await view.cleanup();
    }
  });
});

describe("DataTable virtualized 10,000-row mode (TC-01, TC-02)", () => {
  const rows10k: InvoiceRow[] = Array.from({ length: 10_000 }, (_, index) => ({
    id: `inv-${index + 1}`,
    number: `INV-${index + 1}`,
    customer: `Customer ${index + 1}`,
    notes: `Detail ${index + 1}`,
  }));

  test("renders only a bounded window of rows for 10,000 items without pagination truncation", () => {
    const html = renderToStaticMarkup(
      <DataTable
        data={rows10k}
        columns={columns}
        getRowId={(row) => row.id}
        regionLabel="10k virtualized invoices"
        virtualized={{ estimateRowHeight: 44, height: 360, overscan: 4 }}
      />,
    );

    expect(html).toContain('data-virtualized="true"');
    expect(html).toContain("INV-1");
    expect(html).not.toContain("INV-5000");
    expect(html).not.toContain("INV-10000");
  });

  test("mounts bounded DOM rows in virtualized table viewport and preserves selection + sub-row colSpan", async () => {
    const view = await renderInDom(
      <DataTable
        data={rows10k}
        columns={columns}
        getRowId={(row) => row.id}
        regionLabel="10k DOM virtualized invoices"
        virtualized={{ estimateRowHeight: 40, height: 320, overscan: 2 }}
      />,
    );

    try {
      const container = view.host.querySelector<HTMLElement>("[data-slot='table-container']")!;
      Object.defineProperty(container, "clientHeight", { value: 320, configurable: true });
      Object.defineProperty(container, "clientWidth", { value: 800, configurable: true });
      await act(async () => {
        MockResizeObserver.resize(container);
      });

      const renderedRows = view.host.querySelectorAll("tbody tr[data-slot='table-row']");
      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThan(30);
      expect(view.host.textContent).toContain("INV-1");
      expect(view.host.textContent).not.toContain("INV-5000");

      Object.defineProperty(container, "scrollTop", {
        value: 40_000,
        writable: true,
        configurable: true,
      });
      await act(async () => {
        container.dispatchEvent(new win.Event("scroll"));
      });
      expect(view.host.textContent).toContain("INV-1001");
      expect(view.host.textContent).not.toContain("INV-1\n");
    } finally {
      await view.cleanup();
    }

    const selectionView = await renderInDom(
      <DataTable
        data={SAMPLE_ROWS}
        columns={columns}
        getRowId={(row) => row.id}
        expanded={{ "inv-1": true }}
        onExpandedChange={() => {}}
        selection={{
          ids: new Set(),
          getId: (row) => row.id,
          getLabel: (row) => row.number,
          pageLabel: "Select all",
          onChange: () => {},
        }}
        renderSubRow={(row) => <div>{row.notes}</div>}
      />,
    );

    try {
      const subRowCell = selectionView.host.querySelector<HTMLTableCellElement>(
        "tr[data-slot='data-table-subrow'] td",
      )!;
      expect(subRowCell.getAttribute("colspan")).toBe("4");
    } finally {
      await selectionView.cleanup();
    }
  });

  test("recovers a hidden card viewport when resizing from wide to narrow", async () => {
    const view = await renderInDom(
      <DataTable data={rows10k} columns={columns} virtualized={{ height: 320, overscan: 2 }} />,
    );
    try {
      const cards = view.host.querySelector<HTMLElement>('[data-slot="data-table-card-scroll"]')!;
      const desktop = view.host.querySelector<HTMLElement>('[data-slot="table-container"]')!;
      Object.defineProperty(desktop, "clientHeight", { value: 320, configurable: true });
      Object.defineProperty(cards, "clientHeight", {
        configurable: true,
        // Mimic the actual max-height layout: a hidden or empty viewport is 0px.
        get: () => (desktop.clientHeight === 0 && cards.childElementCount > 0 ? 320 : 0),
      });
      await act(async () => MockResizeObserver.resize(desktop));
      expect(desktop.querySelectorAll("tbody tr[data-index]").length).toBeGreaterThan(0);
      expect(cards.querySelectorAll('[data-slot="data-table-card-row"]')).toHaveLength(0);

      Object.defineProperty(desktop, "clientHeight", { value: 0, configurable: true });
      await act(async () => {
        MockResizeObserver.resize(desktop);
        MockResizeObserver.resize(cards);
      });
      const cardRows = cards.querySelectorAll('[data-slot="data-table-card-row"]');
      expect(cardRows.length).toBeGreaterThan(0);
      expect(cardRows.length).toBeLessThan(20);
      expect(cardRows[0]?.textContent).toContain("INV-1");
    } finally {
      await view.cleanup();
    }
  });

  test("does not offer sorting controls if the caller has no change handler", () => {
    const html = renderToStaticMarkup(
      <DataTable data={SAMPLE_ROWS} columns={columns} virtualized />,
    );
    expect(html).toContain("Invoice");
    expect(html).not.toContain('aria-label="Sort by');
  });

  test("reorders virtual rows and exposes the controlled sort direction", async () => {
    function Harness() {
      const [sorting, setSorting] = React.useState<SortingState>([]);
      return (
        <DataTable
          data={rows10k}
          columns={columns}
          sorting={sorting}
          onSortingChange={setSorting}
          virtualized={{ height: 320, overscan: 2 }}
        />
      );
    }
    const view = await renderInDom(<Harness />);
    try {
      const desktop = view.host.querySelector<HTMLElement>('[data-slot="table-container"]')!;
      Object.defineProperty(desktop, "clientHeight", { value: 320, configurable: true });
      await act(async () => MockResizeObserver.resize(desktop));
      const header = view.host.querySelector<HTMLElement>('[aria-label="Sort by Invoice"]')!;
      expect(desktop.querySelector("tbody tr[data-index]")?.textContent).toContain(
        "INV-1Customer 1",
      );
      await act(async () => click(header));
      expect(header.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
      await act(async () => click(header));
      expect(header.closest("th")?.getAttribute("aria-sort")).toBe("descending");
      expect(desktop.querySelector("tbody tr[data-index]")?.textContent).toContain(
        "INV-10000Customer 10000",
      );
    } finally {
      await view.cleanup();
    }
  });
});
