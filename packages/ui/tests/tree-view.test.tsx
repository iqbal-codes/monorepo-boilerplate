import { afterAll, describe, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TreeNode } from "../src/components/tree-view";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/checkbox", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
win.HTMLElement.prototype.scrollIntoView ??= () => {};
// TanStack measures clientHeight after mount; Happy DOM does not perform layout.
const clientHeight = Object.getOwnPropertyDescriptor(win.HTMLElement.prototype, "clientHeight");
Object.defineProperty(win.HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return this.dataset.virtualized
      ? Number.parseFloat(this.style.height)
      : (clientHeight?.get?.call(this) ?? 0);
  },
});

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
const { TreeView, filterTreeNodes, flattenVisibleTree } =
  await import("../src/components/tree-view");

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

const SAMPLE_NODES: TreeNode[] = [
  {
    id: "workspace",
    label: "Workspace",
    children: [
      {
        id: "apps",
        label: "Apps",
        children: [
          { id: "web", label: "Web App" },
          { id: "server", label: "API Server", disabled: true },
        ],
      },
      { id: "packages", label: "Packages", hasChildren: true },
    ],
  },
  {
    id: "readme",
    label: "README.md",
  },
];

describe("TreeView subpath isolation & pure helpers (TC-04)", () => {
  test("packages/ui/package.json exposes ./components/tree-view subpath export", () => {
    const pkgPath = resolve(import.meta.dir, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      exports?: Record<string, string>;
    };
    expect(pkg.exports?.["./components/tree-view"]).toBe("./src/components/tree-view/index.ts");
  });

  test("tree-view never leaks @tanstack/react-virtual into unrelated UI blocks or mutates caller arrays", async () => {
    const treeDir = resolve(import.meta.dir, "../src/components/tree-view");
    const uiSrcDir = resolve(import.meta.dir, "../src");

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

    for (const file of walk(treeDir)) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("@tanstack/react-router");
      expect(content).not.toMatch(/emerald-|amber-|sky-|blue-/);
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
    expect(bundledCode).not.toContain("tree-view");

    const frozen = Object.freeze(SAMPLE_NODES.map((n) => Object.freeze({ ...n })));
    const flat = flattenVisibleTree(frozen, new Set(["workspace"]));
    expect(flat.map((item) => item.node.id)).toEqual(["workspace", "apps", "packages", "readme"]);
    expect(filterTreeNodes(frozen, "nonexistent-match")).toEqual([]);
  });
});

describe("TreeView WAI-ARIA, keyboard nav, selection, lazy-load & virtualization (TC-02, TC-04)", () => {
  test("renders WAI-ARIA tree roles, roving tabindex, disabled state, and empty search state", () => {
    const html = renderToStaticMarkup(
      <TreeView
        nodes={SAMPLE_NODES}
        defaultExpandedIds={["workspace", "apps"]}
        defaultSelectedIds={["web"]}
        ariaLabel="Project explorer"
      />,
    );

    expect(html).toContain('role="tree"');
    expect(html).toContain('role="treeitem"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="0"');

    const emptySearchHtml = renderToStaticMarkup(
      <TreeView nodes={SAMPLE_NODES} searchQuery="zzzz-missing" ariaLabel="Project explorer" />,
    );
    expect(emptySearchHtml).toContain('data-slot="tree-search-empty"');
  });

  test("supports ArrowUp/Down/Left/Right, Home, End, Space, Enter, and disabled guard", async () => {
    const activated: string[] = [];
    const selections: string[][] = [];

    const view = await renderInDom(
      <TreeView
        nodes={SAMPLE_NODES}
        defaultExpandedIds={["workspace"]}
        selectionMode="multiple"
        ariaLabel="Explorer"
        onSelectedIdsChange={(ids) => selections.push([...ids])}
        onNodeActivate={(node) => activated.push(node.id)}
      />,
    );

    try {
      const tree = view.host.querySelector<HTMLElement>('[role="tree"]')!;
      expect(tree.getAttribute("aria-multiselectable")).toBe("true");

      const getItem = (id: string) =>
        view.host.querySelector<HTMLElement>(`[role="treeitem"][data-node-id="${id}"]`)!;

      const workspace = getItem("workspace");
      expect(workspace.getAttribute("tabindex")).toBe("0");
      expect(getItem("apps").getAttribute("tabindex")).toBe("-1");

      workspace.focus();

      // ArrowDown -> moves roving tabindex & focus to "apps" (closed branch)
      await act(async () => {
        workspace.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        );
      });
      expect(getItem("apps").getAttribute("tabindex")).toBe("0");
      expect(document.activeElement).toBe(getItem("apps"));

      // ArrowRight on closed "apps" -> expands it
      await act(async () => {
        getItem("apps").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
      });
      expect(getItem("apps").getAttribute("aria-expanded")).toBe("true");
      expect(getItem("web")).not.toBeNull();

      // ArrowRight on expanded "apps" -> moves focus to first child "web"
      await act(async () => {
        getItem("apps").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(getItem("web"));

      // Space toggles selection on "web"
      await act(async () => {
        getItem("web").dispatchEvent(new win.KeyboardEvent("keydown", { key: " ", bubbles: true }));
      });
      expect(selections.at(-1)).toEqual(["web"]);

      // ArrowDown -> moves to disabled "server", Space/Enter does NOT select or activate it
      await act(async () => {
        getItem("web").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(getItem("server"));
      await act(async () => {
        getItem("server").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: " ", bubbles: true }),
        );
        getItem("server").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(activated).not.toContain("server");
      expect(selections.at(-1)).toEqual(["web"]);

      // ArrowLeft on "server" -> moves focus back to parent "apps"
      await act(async () => {
        getItem("server").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(getItem("apps"));

      // ArrowLeft on expanded "apps" -> collapses "apps"
      await act(async () => {
        getItem("apps").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
        );
      });
      expect(getItem("apps").getAttribute("aria-expanded")).toBe("false");

      // End -> moves to last visible item ("readme")
      await act(async () => {
        getItem("apps").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "End", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(getItem("readme"));

      // Home -> moves to first item ("workspace")
      await act(async () => {
        getItem("readme").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Home", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(getItem("workspace"));

      // Enter activates "workspace"
      await act(async () => {
        getItem("workspace").dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(activated).toContain("workspace");
    } finally {
      await view.cleanup();
    }
  });

  test("a vetoed controlled expansion is not included in the next proposal", async () => {
    const proposals: string[][] = [];

    function Harness() {
      const [expandedIds, setExpandedIds] = React.useState<ReadonlySet<string>>(
        new Set(["workspace"]),
      );
      return (
        <TreeView
          nodes={SAMPLE_NODES}
          expandedIds={expandedIds}
          onExpandedIdsChange={(ids) => {
            proposals.push([...ids]);
            if (ids.has("packages")) setExpandedIds(ids);
          }}
        />
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const apps = view.host.querySelector<HTMLElement>('[data-node-id="apps"]')!;
      const packages = view.host.querySelector<HTMLElement>('[data-node-id="packages"]')!;
      const toggle = (item: HTMLElement) =>
        item.querySelector<HTMLElement>('[data-slot="tree-node-toggle"]')!.click();

      await act(async () => toggle(apps));
      expect(proposals).toEqual([["workspace", "apps"]]);
      expect(apps.getAttribute("aria-expanded")).toBe("false");

      await act(async () => toggle(packages));
      expect(proposals).toEqual([
        ["workspace", "apps"],
        ["workspace", "packages"],
      ]);
      expect(apps.getAttribute("aria-expanded")).toBe("false");
      expect(packages.getAttribute("aria-expanded")).toBe("true");
    } finally {
      await view.cleanup();
    }
  });

  test("triggers async onLoadChildren with loading spinner and merges resolved children", async () => {
    let resolveLoad!: (children: TreeNode[]) => void;
    const loadPromise = new Promise<TreeNode[]>((resolve) => {
      resolveLoad = resolve;
    });

    const view = await renderInDom(
      <TreeView
        nodes={SAMPLE_NODES}
        defaultExpandedIds={["workspace"]}
        ariaLabel="Lazy explorer"
        onLoadChildren={() => loadPromise}
      />,
    );

    try {
      const pkgToggle = view.host.querySelector<HTMLElement>(
        '[data-node-id="packages"] [data-slot="tree-node-toggle"]',
      )!;
      await act(async () => {
        pkgToggle.click();
      });

      const pkgItem = view.host.querySelector<HTMLElement>('[data-node-id="packages"]')!;
      expect(pkgItem.getAttribute("aria-busy")).toBe("true");
      expect(pkgItem.querySelector('[data-slot="spinner"]')).not.toBeNull();

      await act(async () => {
        resolveLoad([{ id: "ui-pkg", label: "@monorepo-boilerplate/ui" }]);
        await loadPromise;
      });

      expect(pkgItem.getAttribute("aria-busy")).toBeNull();
      expect(view.host.textContent).toContain("@monorepo-boilerplate/ui");
    } finally {
      await view.cleanup();
    }
  });

  test.each(["keyboard", "pointer"])("a filtered lazy match can expand via %s", async (method) => {
    const load = mock(() => [{ id: "server-index", label: "src/index.ts" }]);
    const nodes: TreeNode[] = [
      {
        id: "apps",
        label: "Apps",
        children: [{ id: "server", label: "server", hasChildren: true }],
      },
    ];
    const view = await renderInDom(
      <TreeView nodes={nodes} searchQuery="server" onLoadChildren={load} />,
    );
    try {
      const server = view.host.querySelector<HTMLElement>('[data-node-id="server"]')!;
      expect(view.host.querySelector('[data-node-id="apps"]')?.getAttribute("aria-expanded")).toBe(
        "true",
      );
      expect(server.getAttribute("aria-expanded")).toBe("false");
      await act(async () => {
        if (method === "keyboard") {
          server.focus();
          server.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
          );
        } else {
          server.querySelector<HTMLElement>('[data-slot="tree-node-toggle"]')!.click();
        }
      });
      expect(load).toHaveBeenCalledTimes(1);
      expect(server.getAttribute("aria-expanded")).toBe("true");
      expect(server.querySelector('[data-node-id="server-index"]')).not.toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("a deferred rejection is announced and collapses only the failed branch before retry", async () => {
    const first = Promise.withResolvers<TreeNode[]>();
    const second = Promise.withResolvers<TreeNode[]>();
    const load = mock(() => first.promise);

    function Harness() {
      const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set(["workspace"]));
      return (
        <TreeView
          nodes={SAMPLE_NODES}
          expandedIds={expanded}
          onExpandedIdsChange={setExpanded}
          onLoadChildren={load}
        />
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const pkg = view.host.querySelector<HTMLElement>('[data-node-id="packages"]')!;
      const apps = view.host.querySelector<HTMLElement>('[data-node-id="apps"]')!;
      const toggle = (item: HTMLElement) =>
        item.querySelector<HTMLElement>('[data-slot="tree-node-toggle"]')!.click();
      await act(async () => toggle(pkg));
      expect(pkg.getAttribute("aria-busy")).toBe("true");
      await act(async () => toggle(apps));
      expect(apps.getAttribute("aria-expanded")).toBe("true");

      await act(async () => first.reject(new Error("Request failed")));
      expect(pkg.getAttribute("aria-busy")).toBeNull();
      expect(pkg.getAttribute("aria-expanded")).toBe("false");
      expect(apps.getAttribute("aria-expanded")).toBe("true");
      expect(view.host.querySelector('[role="status"]')?.textContent).toContain(
        "Could not load children for Packages",
      );

      load.mockImplementation(() => second.promise);
      await act(async () => {
        pkg.focus();
        pkg.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      });
      expect(load).toHaveBeenCalledTimes(2);
      expect(pkg.getAttribute("aria-busy")).toBe("true");
      await act(async () => second.resolve([{ id: "retry-child", label: "Loaded on retry" }]));
      expect(pkg.getAttribute("aria-expanded")).toBe("true");
      expect(pkg.getAttribute("aria-busy")).toBeNull();
      expect(pkg.querySelector('[data-node-id="retry-child"]')).not.toBeNull();
      expect(view.host.querySelector('[role="status"]')?.textContent).not.toContain(
        "Could not load",
      );
    } finally {
      await view.cleanup();
    }
  });

  test.each(["after", "before"])(
    "children supplied by the parent %s a deferred rejection take precedence over failure",
    async (refreshTiming) => {
      const request = Promise.withResolvers<TreeNode[]>();
      const load = mock(() => request.promise);
      const proposeExpansion = mock((_ids: ReadonlySet<string>) => {});
      const collapsed = new Set(["workspace"]);
      const expanded = new Set(["workspace", "packages"]);
      const refreshed = SAMPLE_NODES.map((node) => ({
        ...node,
        children: node.children?.map((child) =>
          child.id === "packages"
            ? { ...child, children: [{ id: "refreshed-child", label: "Refreshed package" }] }
            : child,
        ),
      }));
      const tree = (nodes: TreeNode[], expandedIds: ReadonlySet<string>) => (
        <TreeView
          nodes={nodes}
          expandedIds={expandedIds}
          onExpandedIdsChange={proposeExpansion}
          onLoadChildren={load}
        />
      );

      const view = await renderInDom(tree(SAMPLE_NODES, collapsed));
      try {
        const packages = view.host.querySelector<HTMLElement>('[data-node-id="packages"]')!;
        const status = view.host.querySelector('[role="status"]')!;
        const child = () => packages.querySelector('[data-node-id="refreshed-child"]');
        await act(async () => {
          packages.querySelector<HTMLElement>('[data-slot="tree-node-toggle"]')!.click();
        });
        expect(proposeExpansion).toHaveBeenNthCalledWith(1, expanded);
        await view.rerender(tree(SAMPLE_NODES, expanded));
        expect(packages.getAttribute("aria-busy")).toBe("true");

        if (refreshTiming === "before") {
          await view.rerender(tree(refreshed, expanded));
          expect(child()).not.toBeNull();
        }
        await act(async () => request.reject(new Error("Request failed")));
        expect(packages.getAttribute("aria-busy")).toBeNull();

        if (refreshTiming === "after") {
          expect(packages.getAttribute("aria-expanded")).toBe("false");
          expect(status.textContent).toContain("Could not load children for Packages");
          expect(proposeExpansion).toHaveBeenNthCalledWith(2, collapsed);
          await view.rerender(tree(refreshed, expanded));
        } else {
          expect(proposeExpansion).toHaveBeenCalledTimes(1);
        }

        expect(packages.getAttribute("aria-expanded")).toBe("true");
        expect(child()?.textContent).toContain("Refreshed package");
        expect(status.textContent).toBe("");
        expect(load).toHaveBeenCalledTimes(1);

        // Retire the old error rather than just hiding it while children are present.
        await view.rerender(tree(SAMPLE_NODES, expanded));
        expect(packages.getAttribute("aria-expanded")).toBe("true");
        expect(status.textContent).toBe("");
      } finally {
        await view.cleanup();
      }
    },
  );

  test.each([false, true])(
    "expanded children belong to their parent's group (virtualized: %s)",
    async (virtualized) => {
      const view = await renderInDom(
        <TreeView
          nodes={SAMPLE_NODES}
          defaultExpandedIds={["workspace", "apps"]}
          virtualized={virtualized}
        />,
      );
      try {
        const workspace = view.host.querySelector('[data-node-id="workspace"]')!;
        const apps = workspace.querySelector(':scope > [role="group"] > [data-node-id="apps"]')!;
        expect(apps.querySelector(':scope > [role="group"] > [data-node-id="web"]')).not.toBeNull();
        expect(
          workspace.querySelector(':scope > [role="group"] > [data-node-id="packages"]'),
        ).not.toBeNull();
      } finally {
        await view.cleanup();
      }
    },
  );

  test("virtualizes 1,000+ nodes instead of mounting every treeitem in the DOM", () => {
    const nodes1200: TreeNode[] = Array.from({ length: 40 }, (_, groupIdx) => ({
      id: `group-${groupIdx}`,
      label: `Group ${groupIdx + 1}`,
      children: Array.from({ length: 30 }, (__, leafIdx) => ({
        id: `leaf-${groupIdx}-${leafIdx}`,
        label: `Item ${groupIdx + 1}.${leafIdx + 1}`,
      })),
    }));
    const expanded = new Set(nodes1200.map((g) => g.id));

    const html = renderToStaticMarkup(
      <TreeView
        nodes={nodes1200}
        expandedIds={expanded}
        virtualized={{ height: 360, estimateSize: 36, overscan: 4 }}
        ariaLabel="Large virtual tree"
      />,
    );

    expect(html).toContain('data-virtualized="true"');
    expect(html).toContain("Group 1");
    expect(html).not.toContain("Item 40.30");
  });
});
