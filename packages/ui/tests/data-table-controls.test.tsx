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
const { FacetedFilter } = await import("../src/components/faceted-filter");
const { ActiveFilterChips } = await import("../src/components/active-filter-chips");
const { DataTableViewOptions } = await import("../src/components/data-table-view-options");
const { RowActions } = await import("../src/components/row-actions");
const { ListToolbar } = await import("../src/components/list-toolbar");
const { DataTable, columnsFor } = await import("../src/components/data-table");

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
}

function click(el: Element) {
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("FacetedFilter (TC-02)", () => {
  const options = [
    { label: "Active", value: "active", count: 14 },
    { label: "Inactive", value: "inactive", count: 5 },
    { label: "Archived", value: "archived", count: 3 },
  ];

  test("opens searchable popover, filters options, toggles multi-select, and clears", async () => {
    function Harness() {
      const [selected, setSelected] = React.useState<string[]>([]);
      return (
        <FacetedFilter
          title="Status"
          options={options}
          value={selected}
          onValueChange={setSelected}
        />
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const trigger = view.host.querySelector<HTMLButtonElement>("button")!;
      expect(trigger.textContent).toContain("Status");

      await act(async () => {
        click(trigger);
      });

      const searchInput = document.body.querySelector<HTMLInputElement>(
        "[data-slot='command-input']",
      )!;
      expect(searchInput).toBeTruthy();

      const items = [...document.body.querySelectorAll("[data-slot='command-item']")];
      expect(items.map((el) => el.textContent)).toEqual([
        expect.stringContaining("Active"),
        expect.stringContaining("Inactive"),
        expect.stringContaining("Archived"),
      ]);
      expect(document.body.textContent).toContain("14");
      expect(document.body.textContent).toContain("5");

      // Search narrows visible options
      await act(async () => {
        setInputValue(searchInput, "arch");
      });
      const filteredItems = [...document.body.querySelectorAll("[data-slot='command-item']")];
      expect(filteredItems).toHaveLength(1);
      expect(filteredItems[0]!.textContent).toContain("Archived");

      // Clear search and select two options via keyboard/click
      await act(async () => {
        setInputValue(searchInput, "");
      });

      const activeItem = [...document.body.querySelectorAll("[data-slot='command-item']")].find(
        (el) => el.textContent?.includes("Active"),
      )!;
      const inactiveItem = [...document.body.querySelectorAll("[data-slot='command-item']")].find(
        (el) => el.textContent?.includes("Inactive"),
      )!;

      await act(async () => {
        click(activeItem);
      });
      await act(async () => {
        click(inactiveItem);
      });
      expect(trigger.textContent).toContain("Active");
      expect(trigger.textContent).toContain("Inactive");

      // Select third to collapse summary to "3 selected"
      const archivedItem = [...document.body.querySelectorAll("[data-slot='command-item']")].find(
        (el) => el.textContent?.includes("Archived"),
      )!;
      await act(async () => {
        click(archivedItem);
      });
      expect(trigger.textContent).toContain("3 selected");

      // Keyboard Escape closes popover
      await act(async () => {
        searchInput.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });

      // Reopen and test keyboard ArrowDown + Enter toggles option off and back on
      await act(async () => {
        click(trigger);
      });
      const reopenedInput = document.body.querySelector<HTMLInputElement>(
        "[data-slot='command-input']",
      )!;
      await act(async () => {
        reopenedInput.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        );
      });
      await act(async () => {
        reopenedInput.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(trigger.textContent).toContain("2 selected");
      expect(trigger.textContent).not.toContain("Inactive");
      await act(async () => {
        reopenedInput.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(trigger.textContent).toContain("3 selected");

      // Clear all via Clear filters item
      const clearItem = [...document.body.querySelectorAll("[data-slot='command-item']")].find(
        (el) => el.textContent?.includes("Clear filters"),
      )!;
      await act(async () => {
        click(clearItem);
      });
      expect(trigger.textContent).not.toContain("selected");
      expect(trigger.textContent).not.toContain("Inactive");
    } finally {
      await view.cleanup();
    }
  });
});

describe("ActiveFilterChips & ListToolbar Row 2 (TC-02)", () => {
  test("ActiveFilterChips returns null when empty and renders chips standalone", async () => {
    const view = await renderInDom(<ActiveFilterChips chips={[]} />);
    try {
      expect(view.host.querySelector("[data-slot='active-filter-chips']")).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("renders dismissible chips, Clear filters, and resultLabel, and omits Row 2 when empty", async () => {
    const removed: string[] = [];
    let cleared = 0;

    const view = await renderInDom(
      <ListToolbar
        search={{ label: "Search customers", value: "", onChange: () => {} }}
        activeFilters={[]}
        onClearFilters={() => {
          cleared += 1;
        }}
        resultLabel="41 customers"
      />,
    );

    try {
      expect(view.host.querySelector("[data-slot='active-filter-chips']")).toBeNull();

      await view.rerender(
        <ListToolbar
          search={{ label: "Search customers", value: "", onChange: () => {} }}
          activeFilters={[
            {
              id: "status:active",
              label: "Status",
              value: "Active",
              onRemove: () => removed.push("status:active"),
            },
            {
              id: "tag:vip",
              label: "Tag",
              value: "vip",
              onRemove: () => removed.push("tag:vip"),
            },
          ]}
          onClearFilters={() => {
            cleared += 1;
          }}
          resultLabel="5 customers"
        />,
      );

      const strip = view.host.querySelector("[data-slot='active-filter-chips']");
      expect(strip).toBeTruthy();
      expect(strip!.textContent).toContain("Status");
      expect(strip!.textContent).toContain("Active");
      expect(strip!.textContent).toContain("Tag");
      expect(strip!.textContent).toContain("vip");
      expect(strip!.textContent).toContain("5 customers");

      const removeStatusBtn = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label*="Status"][aria-label*="Active"]',
      )!;
      expect(removeStatusBtn).toBeTruthy();
      await act(async () => {
        click(removeStatusBtn);
      });
      expect(removed).toEqual(["status:active"]);

      const clearAllBtn = view.host.querySelector<HTMLButtonElement>(
        "[data-slot='active-filter-chips-clear']",
      )!;
      await act(async () => {
        click(clearAllBtn);
      });
      expect(cleared).toBe(1);
    } finally {
      await view.cleanup();
    }
  });
});

describe("DataTableViewOptions & DataTable controls (TC-02)", () => {
  test("enforces at-least-one-visible column guard, column pinning, and density switch", async () => {
    function Harness() {
      const [visibility, setVisibility] = React.useState<Record<string, boolean>>({});
      const [pinning, setPinning] = React.useState<{ start: string[]; end: string[] }>({
        start: [],
        end: [],
      });
      const [density, setDensity] = React.useState<"comfortable" | "compact">("comfortable");
      return (
        <div>
          <DataTableViewOptions
            columns={[
              { id: "name", label: "Customer" },
              { id: "company", label: "Company" },
            ]}
            columnVisibility={visibility}
            onColumnVisibilityChange={setVisibility}
            columnPinning={pinning}
            onColumnPinningChange={setPinning}
            density={density}
            onDensityChange={setDensity}
          />
          <output data-testid="state">{JSON.stringify({ visibility, pinning, density })}</output>
        </div>
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const trigger = view.host.querySelector<HTMLButtonElement>("button")!;
      await act(async () => {
        click(trigger);
      });

      // Switch density to compact
      const compactBtn = [...document.body.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Compact",
      )!;
      await act(async () => {
        click(compactBtn);
      });
      expect(view.host.querySelector("[data-testid='state']")!.textContent).toContain(
        '"density":"compact"',
      );

      // Hide Company via its hidden input inside the label (happy-dom checkbox toggle)
      const companyCheckbox = document.body.querySelector<HTMLElement>(
        '[role="checkbox"][aria-label*="Company"], [data-slot="checkbox"][aria-label*="Company"]',
      )!;
      const companyInput = companyCheckbox
        .closest("label")!
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      await act(async () => {
        companyInput.click();
      });

      // Now Customer is the last visible column — its checkbox must be disabled and clicking cannot hide it
      const customerCheckbox = document.body.querySelector<HTMLElement>(
        '[role="checkbox"][aria-label*="Customer"], [data-slot="checkbox"][aria-label*="Customer"]',
      )!;
      expect(customerCheckbox.getAttribute("aria-disabled")).toBe("true");
      const customerInput = customerCheckbox
        .closest("label")!
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      await act(async () => {
        customerInput.click();
      });
      expect(view.host.querySelector("[data-testid='state']")!.textContent).not.toContain(
        '"name":false',
      );

      // Pin Customer left
      const pinLeftBtn = document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Pin Customer left"]',
      )!;
      await act(async () => {
        click(pinLeftBtn);
      });
      expect(view.host.querySelector("[data-testid='state']")!.textContent).toContain(
        '"start":["name"]',
      );
    } finally {
      await view.cleanup();
    }
  });

  test("DataTable applies columnVisibility, columnPinning, and density", async () => {
    type Row = { id: string; name: string; company: string };
    const helper = columnsFor<Row>();
    const columns = helper.columns([
      helper.accessor("name", { header: "Customer" }),
      helper.accessor("company", { header: "Company" }),
    ]);

    const view = await renderInDom(
      <DataTable
        data={[{ id: "1", name: "Ada", company: "Analytical" }]}
        columns={columns}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        columnVisibility={{ company: false }}
        columnPinning={{ start: ["name"], end: [] }}
        density="compact"
      />,
    );

    try {
      const table = view.host.querySelector("[data-slot='data-table']")!;
      expect(table.getAttribute("data-density")).toBe("compact");
      const headers = [...view.host.querySelectorAll("th")].map((th) => th.textContent?.trim());
      expect(headers).toEqual(["Customer"]);
      expect(view.host.querySelector("th[data-pinned='start']")).toBeTruthy();
      expect(view.host.querySelector("td[data-pinned='start']")).toBeTruthy();
    } finally {
      await view.cleanup();
    }
  });
});

describe("RowActions (TC-02)", () => {
  test("is keyboard accessible, isolates clicks from row onClick, and supports destructive confirmation", async () => {
    let rowClicks = 0;
    let edited = 0;
    let deleted = 0;

    const view = await renderInDom(
      <table>
        <tbody>
          <tr
            onClick={() => {
              rowClicks += 1;
            }}
          >
            <td>
              <RowActions
                label="Actions for Ada"
                items={[
                  {
                    id: "edit",
                    label: "Edit",
                    onSelect: () => {
                      edited += 1;
                    },
                  },
                  {
                    id: "delete",
                    label: "Delete",
                    variant: "destructive",
                    separatorBefore: true,
                    onSelect: () => {
                      deleted += 1;
                    },
                    confirm: {
                      title: "Delete customer?",
                      description: "Cannot be undone.",
                      confirmLabel: "Delete customer",
                    },
                  },
                ]}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );

    try {
      const trigger = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Actions for Ada"]',
      )!;
      expect(trigger).toBeTruthy();

      await act(async () => {
        click(trigger);
      });
      expect(rowClicks).toBe(0);

      const editItem = [...document.body.querySelectorAll("[role='menuitem']")].find((el) =>
        el.textContent?.includes("Edit"),
      )!;
      expect(editItem).toBeTruthy();

      await act(async () => {
        click(editItem);
      });
      expect(edited).toBe(1);
      expect(rowClicks).toBe(0);

      // Open again and click Delete -> opens ConfirmationDialog without triggering row click
      await act(async () => {
        click(trigger);
      });
      const deleteItem = [...document.body.querySelectorAll("[role='menuitem']")].find((el) =>
        el.textContent?.includes("Delete"),
      )!;
      await act(async () => {
        click(deleteItem);
      });
      expect(deleted).toBe(0);
      expect(rowClicks).toBe(0);

      const dialog = document.body.querySelector("[role='alertdialog']")!;
      expect(dialog).toBeTruthy();
      expect(dialog.textContent).toContain("Delete customer?");

      const confirmBtn = [...dialog.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Delete customer",
      )!;
      await act(async () => {
        click(confirmBtn);
      });
      expect(deleted).toBe(1);
      expect(rowClicks).toBe(0);

      // Keyboard Escape closes open menu without triggering row click
      await act(async () => {
        click(trigger);
      });
      const openMenu = document.body.querySelector("[data-slot='dropdown-menu-content']")!;
      expect(openMenu).toBeTruthy();
      await act(async () => {
        openMenu.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(rowClicks).toBe(0);
    } finally {
      await view.cleanup();
    }
  });
});
