import { afterAll, describe, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", import.meta.dir)));

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
  "HTMLDivElement",
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
  static byTarget = new Map<Element, () => void>();
  constructor(private readonly onResize: () => void) {}
  observe(target: Element) {
    MockResizeObserver.byTarget.set(target, this.onResize);
  }
  unobserve(target: Element) {
    MockResizeObserver.byTarget.delete(target);
  }
  disconnect() {}
}

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  ShadowRoot: win.ShadowRoot,
  HTMLElement: win.HTMLElement,
  HTMLDivElement: win.HTMLDivElement,
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

win.ResizeObserver = MockResizeObserver as unknown as typeof win.ResizeObserver;

const { createRoot } = await import("react-dom/client");
const { VirtualList } = await import("../src/components/virtual-list");

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

describe("VirtualList subpath isolation (TC-03, TC-05)", () => {
  test("packages/ui/package.json exposes ./components/virtual-list subpath export", () => {
    const pkgPath = resolve(import.meta.dir, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      exports?: Record<string, string>;
    };
    expect(pkg.exports?.["./components/virtual-list"]).toBe("./src/components/virtual-list.tsx");
  });

  test("unrelated UI blocks never import @tanstack/react-virtual or virtual-list", async () => {
    const uiSrcDir = resolve(import.meta.dir, "../src");
    const allowedFiles = new Set([
      resolve(uiSrcDir, "components/virtual-list.tsx"),
      resolve(uiSrcDir, "components/data-table.tsx"),
      resolve(uiSrcDir, "components/data-table/use-row-window.ts"),
    ]);

    function walk(dir: string): string[] {
      const files: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          files.push(...walk(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
          files.push(full);
        }
      }
      return files;
    }

    for (const file of walk(uiSrcDir)) {
      if (allowedFiles.has(file)) continue;
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("@tanstack/react-virtual");
      expect(content).not.toContain("virtual-list");
    }

    const result = await Bun.build({
      entrypoints: [resolve(uiSrcDir, "components/form/index.ts")],
      write: false,
      external: [
        "react",
        "react-dom",
        "@tanstack/react-form",
        "@base-ui/react",
        "lucide-react",
        "cn",
        "libphonenumber-js",
        "date-fns",
        "react-day-picker",
        "input-otp",
      ],
    });
    expect(result.success).toBe(true);
    const bundledCode = await result.outputs[0]!.text();
    expect(bundledCode).not.toContain("@tanstack/react-virtual");
  });
});

describe("VirtualList rendering, states, and keyboard access (TC-01, TC-03)", () => {
  const items10k = Array.from({ length: 10_000 }, (_, index) => ({
    id: `item-${index}`,
    label: `Event #${index + 1}`,
  }));

  test("renders only visible window for 10,000 items instead of mounting all rows", () => {
    const html = renderToStaticMarkup(
      <VirtualList
        items={items10k}
        estimateSize={40}
        height={320}
        overscan={3}
        ariaLabel="Audit stream"
        getItemKey={(item) => item.id}
        renderItem={({ item }) => <div>{item.label}</div>}
      />,
    );

    expect(html).toContain('data-slot="virtual-list"');
    expect(html).toContain("Event #1");
    expect(html).not.toContain("Event #500");
    expect(html).not.toContain("Event #10000");
  });

  test("renders loading skeleton and custom emptyState", () => {
    const loadingHtml = renderToStaticMarkup(
      <VirtualList
        items={[]}
        estimateSize={40}
        height={240}
        isLoading
        loadingCount={4}
        renderItem={() => null}
      />,
    );
    expect(loadingHtml).toContain('aria-busy="true"');
    expect(loadingHtml.match(/data-slot="skeleton"/g)?.length).toBeGreaterThanOrEqual(4);

    const emptyHtml = renderToStaticMarkup(
      <VirtualList
        items={[]}
        estimateSize={40}
        height={240}
        emptyState={<div data-testid="custom-empty">No stream events</div>}
        renderItem={() => null}
      />,
    );
    expect(emptyHtml).toContain("No stream events");
  });

  test("supports keyboard navigation (ArrowDown, ArrowUp, Home, End, Enter) and controlled callbacks", async () => {
    const activated: string[] = [];
    const activeChanges: number[] = [];

    function Harness() {
      const [activeIndex, setActiveIndex] = React.useState(0);
      return (
        <VirtualList
          items={items10k}
          estimateSize={40}
          height={320}
          overscan={2}
          ariaLabel="Interactive virtual list"
          getItemKey={(item) => item.id}
          activeIndex={activeIndex}
          onActiveIndexChange={(next) => {
            activeChanges.push(next);
            setActiveIndex(next);
          }}
          onItemActivate={(item) => activated.push(item.id)}
          renderItem={({ item, isActive }) => (
            <div data-active={isActive ? "true" : undefined}>{item.label}</div>
          )}
        />
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const container = view.host.querySelector<HTMLElement>("[data-slot='virtual-list']")!;
      Object.defineProperty(container, "clientHeight", { value: 320, configurable: true });
      Object.defineProperty(container, "clientWidth", { value: 600, configurable: true });
      await view.rerender(<Harness />);
      await act(async () => MockResizeObserver.byTarget.get(container)!());

      expect(container.getAttribute("tabindex")).toBe("0");
      expect(container.getAttribute("role")).toBe("listbox");

      await act(async () => {
        container.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        );
      });
      expect(activeChanges.at(-1)).toBe(1);

      await act(async () => {
        container.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(activated).toEqual(["item-1"]);

      await act(async () => {
        container.dispatchEvent(new win.KeyboardEvent("keydown", { key: "End", bubbles: true }));
      });
      expect(activeChanges.at(-1)).toBe(9_999);

      await act(async () => {
        container.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      });
      expect(activeChanges.at(-1)).toBe(0);

      await act(async () => {
        container.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
        );
      });
      expect(activeChanges.at(-1)).toBe(0);
    } finally {
      await view.cleanup();
    }
  });

  test("retains the focused option when scrolling to index 100, then activates that mounted option", async () => {
    const activated: string[] = [];
    const view = await renderInDom(
      <VirtualList
        items={items10k}
        estimateSize={40}
        height={320}
        overscan={2}
        activeIndex={0}
        onItemActivate={(item) => activated.push(item.id)}
        renderItem={({ item }) => item.label}
      />,
    );
    try {
      const list = view.host.querySelector<HTMLElement>('[role="listbox"]')!;
      Object.defineProperties(list, {
        clientHeight: { value: 320 },
        clientWidth: { value: 600 },
        scrollTop: { value: 4000, writable: true },
      });
      await act(async () => {
        MockResizeObserver.byTarget.get(list)!();
        list.focus();
        list.dispatchEvent(new win.Event("scroll"));
      });
      expect(document.activeElement).toBe(list);
      expect(list.querySelector('[data-index="100"]')).toBeTruthy();
      expect(list.querySelectorAll('[role="option"]').length).toBeLessThan(20);
      const active = document.getElementById(list.getAttribute("aria-activedescendant")!);
      expect(active?.textContent).toBe("Event #1");
      expect(active?.getAttribute("aria-selected")).toBe("true");
      await act(async () =>
        list.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
      );
      expect(activated).toEqual(["item-0"]);
    } finally {
      await view.cleanup();
    }
  });
});
