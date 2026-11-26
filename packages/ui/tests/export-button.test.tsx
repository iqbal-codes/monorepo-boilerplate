import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { ExportButton, type ExportSource } from "../src/components/export-button";
import { ListToolbar } from "../src/components/list-toolbar";

/** Button attributes with `class` removed, so utility names cannot match. */
function buttonAttributes(html: string): string {
  return (/<button\b[^>]*>/.exec(html)?.[0] ?? "").replace(/class="[^"]*"/, "");
}

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

async function withDom(run: (win: Window) => Promise<void>) {
  const win = new Window({ url: "http://localhost/" });
  const previous = Object.fromEntries(
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
  try {
    await run(win);
  } finally {
    await win.close();
    Object.assign(globalThis, previous);
  }
}

type FakeWorkerInstance = {
  posted: unknown[];
  terminated: boolean;
  deliver(message: unknown): void;
  fail(message: string): void;
};

/**
 * One fixture for every lifecycle case: a mounted `ExportButton` in a fake DOM,
 * with the fake `Worker`, object-URL registry, and download capture the block
 * actually uses. Scenarios only supply `fetchExport`, `getFilename`, and
 * assertions, so adding a case never re-invents the environment.
 */
type Harness = {
  workers: FakeWorkerInstance[];
  createdUrls: string[];
  revokedUrls: string[];
  downloads: string[];
  signals: AbortSignal[];
  click(): Promise<void>;
  unmount(): Promise<void>;
  button(): HTMLButtonElement | null;
  text(): string;
  alert(): string;
  status(): string;
};

async function mountExportButton(
  win: Window,
  props: {
    fetchExport: (signal: AbortSignal) => Promise<ExportSource>;
    getFilename?: (activatedAt: Date) => string;
    onExported?: (file: File, rowCount: number) => void;
    hint?: string;
    disabled?: boolean;
    cancelSignal?: AbortSignal;
    strict?: boolean;
  },
): Promise<Harness> {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);

  const workers: FakeWorkerInstance[] = [];
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const downloads: string[] = [];
  const signals: AbortSignal[] = [];

  class FakeWorker implements FakeWorkerInstance {
    posted: unknown[] = [];
    terminated = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message?: string }) => void) | null = null;

    constructor() {
      workers.push(this);
    }

    postMessage(message: unknown) {
      this.posted.push(message);
    }

    terminate() {
      this.terminated = true;
    }

    deliver(message: unknown) {
      this.onmessage?.({ data: message });
    }

    fail(message: string) {
      this.onerror?.({ message });
    }
  }

  const RealURL = globalThis.URL;
  class FakeURL extends RealURL {
    static override createObjectURL() {
      const url = `blob:fake/${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    }

    static override revokeObjectURL(url: string) {
      revokedUrls.push(url);
    }
  }

  const createElement = win.document.createElement.bind(win.document);
  (win.document as unknown as { createElement: typeof createElement }).createElement = ((
    tag: string,
    ...rest: unknown[]
  ) => {
    const element = createElement(tag, ...rest) as HTMLElement & { click: () => void };
    if (tag === "a") element.click = () => downloads.push(element.getAttribute("download") ?? "");
    return element;
  }) as typeof createElement;

  const previous = { Worker: globalThis.Worker, URL: RealURL };
  Object.assign(globalThis, { Worker: FakeWorker, URL: FakeURL });

  const capture = (signal: AbortSignal) => {
    signals.push(signal);
    return props.fetchExport(signal);
  };

  await act(async () => {
    const node = (
      <ExportButton
        label="Export CSV"
        hint={props.hint ?? "CSV escaping may change literal text."}
        disabled={props.disabled}
        getFilename={props.getFilename ?? (() => "customers-2026-11-26.csv")}
        fetchExport={capture}
        cancelSignal={props.cancelSignal}
        onExported={props.onExported}
      />
    );
    root.render(props.strict ? <StrictMode>{node}</StrictMode> : node);
  });

  const harness: Harness = {
    workers,
    createdUrls,
    revokedUrls,
    downloads,
    signals,
    async click() {
      await act(async () => {
        container.querySelector("button")?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      Object.assign(globalThis, previous);
    },
    button: () => container.querySelector("button"),
    text: () => container.textContent ?? "",
    alert: () => container.querySelector('[role="alert"]')?.textContent ?? "",
    status: () => container.querySelector('p[role="status"]')?.textContent ?? "",
  };

  return harness;
}

/** Runs `body` with a mounted harness and always unmounts it afterwards. */
async function withHarness(
  props: Parameters<typeof mountExportButton>[1],
  body: (harness: Harness, win: Window) => Promise<void>,
) {
  await withDom(async (win) => {
    const harness = await mountExportButton(win, props);
    try {
      await body(harness, win);
    } finally {
      await harness.unmount();
    }
  });
}

function csvFile(name = "customers-2026-11-26.csv", body = "name\r\nAda\r\n"): File {
  return new File([body], name, { type: "text/csv;charset=utf-8" });
}

function payload(rows: (string | number | null)[][] = [["Ada"]]) {
  return JSON.stringify({ headers: ["name"], rows });
}

describe("ExportButton idle markup", () => {
  test("renders an enabled button described by the visible hint", () => {
    const html = renderToStaticMarkup(
      <ExportButton
        label="Export CSV"
        hint="CSV escaping may change literal text."
        getFilename={() => "customers-2026-11-26.csv"}
        fetchExport={async () => "{}"}
      />,
    );

    const button = buttonAttributes(html);
    const describedBy = /aria-describedby="([^"]+)"/.exec(button)?.[1];
    const hintId = /<p id="([^"]+)"[^>]*>CSV escaping may change literal text\./.exec(html)?.[1];

    expect(html).toContain(">Export CSV<");
    expect(html).toContain("CSV escaping may change literal text.");
    expect(describedBy).toBeDefined();
    expect(hintId).toBeDefined();
    expect(describedBy).toBe(hintId);
    expect(button).not.toContain("disabled");
    expect(button).not.toContain("aria-busy");
  });

  test("renders a disabled button that keeps the hint visible", () => {
    const html = renderToStaticMarkup(
      <ExportButton
        label="Export CSV"
        hint="CSV escaping may change literal text."
        disabled
        getFilename={() => "customers.csv"}
        fetchExport={async () => "{}"}
      />,
    );

    const button = buttonAttributes(html);

    expect(button).toContain('aria-describedby="');
    expect(button).toContain("disabled");
    expect(html).toContain("CSV escaping may change literal text.");
  });
});

describe("ExportButton activation", () => {
  test("announces preparation, sends the abort signal, and releases the worker", async () => {
    let resolvePayload: ((value: string) => void) | undefined;

    await withHarness(
      {
        fetchExport: () =>
          new Promise<string>((resolve) => {
            resolvePayload = resolve;
          }),
      },
      async (harness) => {
        await harness.click();

        expect(harness.signals).toHaveLength(1);
        expect(harness.workers).toHaveLength(0);
        // Busy keeps focus: `aria-disabled` instead of the native attribute, so
        // the control stays in the tab order and the guard blocks activation.
        expect(harness.button()?.getAttribute("aria-disabled")).toBe("true");
        expect(harness.button()?.getAttribute("aria-busy")).toBe("true");
        expect(harness.text()).toContain("Preparing the export.");

        await act(async () => {
          resolvePayload?.(payload([["Ada"], ["Grace"]]));
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(harness.workers).toHaveLength(1);
        expect(harness.text()).toContain("Generating the CSV file.");
        expect(harness.workers[0]?.posted).toEqual([
          {
            payload: payload([["Ada"], ["Grace"]]),
            filename: "customers-2026-11-26.csv",
          },
        ]);
      },
    );
  });

  test("downloads once, reports the row count, and re-enables the control", async () => {
    const exported: Array<{ rows: number; name: string }> = [];

    await withHarness(
      {
        fetchExport: async () => payload([["Ada"], ["Grace"]]),
        onExported: (file, rowCount) => exported.push({ rows: rowCount, name: file.name }),
      },
      async (harness) => {
        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 2 });
        });

        expect(harness.workers[0]?.terminated).toBe(true);
        expect(harness.downloads).toEqual(["customers-2026-11-26.csv"]);
        expect(harness.createdUrls).toEqual(["blob:fake/1"]);
        expect(exported).toEqual([{ rows: 2, name: "customers-2026-11-26.csv" }]);
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
        expect(harness.button()?.getAttribute("aria-busy")).toBeNull();
        expect(harness.status()).toBe("Exported 2 rows.");
      },
    );
  });

  test("revokes the object URL on the next task after it has served the click", async () => {
    await withHarness({ fetchExport: async () => payload() }, async (harness) => {
      await harness.click();
      await act(async () => {
        harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
      });

      // Not revoked synchronously: the browser still needs the URL to start
      // the download.
      expect(harness.revokedUrls).toEqual([]);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });

      expect(harness.revokedUrls).toEqual(["blob:fake/1"]);
    });
  });

  test("surfaces a fetch failure as an assertive retry message without a download", async () => {
    await withHarness(
      {
        fetchExport: async () => {
          throw new Error("Could not export customers. Check your connection and try again.");
        },
      },
      async (harness) => {
        await harness.click();

        expect(harness.alert()).toContain("Could not export customers");
        expect(harness.alert()).toContain("try again");
        expect(harness.workers).toHaveLength(0);
        expect(harness.downloads).toEqual([]);
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
      },
    );
  });

  test("a worker generation failure is assertive, leaves no download, and re-enables the control", async () => {
    const exported: number[] = [];

    await withHarness(
      { fetchExport: async () => "{}", onExported: (_file, rowCount) => exported.push(rowCount) },
      async (harness) => {
        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({
            type: "error",
            message: "Export payload is not valid JSON.",
          });
        });

        expect(harness.workers[0]?.terminated).toBe(true);
        expect(harness.downloads).toEqual([]);
        expect(exported).toEqual([]);
        expect(harness.alert()).toContain("Export payload is not valid JSON.");
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
      },
    );
  });

  test("a worker script error keeps the retry wording actionable", async () => {
    await withHarness({ fetchExport: async () => payload() }, async (harness) => {
      await harness.click();
      await act(async () => {
        harness.workers[0]?.fail("ChunkLoadError: Failed to fetch dynamically imported module");
      });

      expect(harness.workers[0]?.terminated).toBe(true);
      expect(harness.downloads).toEqual([]);
      expect(harness.alert()).toBe(
        "Could not prepare the export. Check your connection and try again.",
      );
      // The technical worker message must not leak into staff-facing copy.
      expect(harness.alert()).not.toContain("ChunkLoadError");
      expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
    });
  });
});

describe("ExportButton failure recovery", () => {
  test("a throwing filename provider settles the control and offers a retry", async () => {
    let calls = 0;

    await withHarness(
      {
        getFilename: () => {
          calls += 1;
          if (calls === 1) throw new Error("Filename unavailable.");
          return "customers-2026-11-26.csv";
        },
        fetchExport: async () => payload(),
      },
      async (harness) => {
        await harness.click();

        expect(harness.alert()).toContain("Filename unavailable.");
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
        expect(harness.button()?.getAttribute("aria-busy")).toBeNull();
        expect(harness.signals).toHaveLength(0);
        expect(harness.workers).toHaveLength(0);
        expect(harness.downloads).toEqual([]);

        // Retry works without remounting the block.
        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
        });

        expect(harness.downloads).toEqual(["customers-2026-11-26.csv"]);
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
      },
    );
  });

  test("a filename provider that throws a non-Error still uses the fallback copy", async () => {
    await withHarness(
      {
        getFilename: () => {
          throw "nope";
        },
        fetchExport: async () => payload(),
      },
      async (harness) => {
        await harness.click();

        expect(harness.alert()).toBe(
          "Could not prepare the export. Check your connection and try again.",
        );
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
      },
    );
  });

  test("a retry after a failure clears the previous alert", async () => {
    let calls = 0;

    await withHarness(
      {
        fetchExport: async () => {
          calls += 1;
          if (calls === 1) throw new Error("Could not export customers. Try again.");
          return payload();
        },
      },
      async (harness) => {
        await harness.click();
        expect(harness.alert()).toContain("Could not export customers");

        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
        });

        expect(harness.alert()).toBe("");
        expect(harness.status()).toBe("Exported 1 row.");
      },
    );
  });
});

describe("ExportButton guards", () => {
  test("a double activation starts exactly one export", async () => {
    await withHarness({ fetchExport: () => new Promise<string>(() => {}) }, async (harness) => {
      await act(async () => {
        harness.button()?.click();
        harness.button()?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(harness.signals).toHaveLength(1);
    });
  });

  test("stays focusable while busy so keyboard users can retry in place", async () => {
    await withHarness(
      { fetchExport: () => new Promise<string>(() => {}) },
      async (harness, win) => {
        await act(async () => {
          harness.button()?.focus();
          harness.button()?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const button = harness.button();
        expect(button?.getAttribute("aria-disabled")).toBe("true");
        expect(win.document.activeElement).toBe(button);
      },
    );
  });

  test("unmount aborts an in-flight fetch so nothing is generated", async () => {
    await withDom(async (win) => {
      const harness = await mountExportButton(win, {
        fetchExport: () => new Promise<string>(() => {}),
      });

      await harness.click();
      expect(harness.signals).toHaveLength(1);

      await harness.unmount();

      expect(harness.signals[0]?.aborted).toBe(true);
      expect(harness.workers).toEqual([]);
    });
  });

  test("unmount terminates a running worker and delivers no stale download", async () => {
    await withDom(async (win) => {
      const harness = await mountExportButton(win, { fetchExport: async () => payload() });

      await harness.click();
      expect(harness.workers[0]?.posted).toBeDefined();

      await harness.unmount();

      expect(harness.workers[0]?.terminated).toBe(true);

      // A late worker message must not download anything after teardown.
      await act(async () => {
        harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 0 });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(harness.downloads).toEqual([]);
    });
  });

  test("a Screen cancel mid-generation terminates the worker and downloads nothing", async () => {
    // The navigation race: the Screen aborts as soon as it starts leaving, while
    // the worker is already generating and the old toolbar is still mounted.
    const cancel = new AbortController();

    await withHarness(
      { fetchExport: async () => payload(), cancelSignal: cancel.signal },
      async (harness) => {
        await harness.click();
        expect(harness.workers).toHaveLength(1);

        await act(async () => {
          cancel.abort();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(harness.workers[0]?.terminated).toBe(true);
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();

        // A generation that resolves after the cancel must not download.
        await act(async () => {
          harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
        });

        expect(harness.downloads).toEqual([]);
        expect(harness.createdUrls).toEqual([]);
        expect(harness.revokedUrls).toEqual([]);
        expect(harness.status()).not.toContain("Exported");
      },
    );
  });

  test("a Screen cancel before generation still spawns no worker", async () => {
    const cancel = new AbortController();

    await withHarness(
      {
        fetchExport: (signal) =>
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => resolve(payload()), { once: true });
          }),
        cancelSignal: cancel.signal,
      },
      async (harness) => {
        await harness.click();
        await act(async () => {
          cancel.abort();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(harness.signals[0]?.aborted).toBe(true);
        expect(harness.workers).toEqual([]);
        expect(harness.downloads).toEqual([]);
      },
    );
  });

  test("a run that resolves while the Screen is already gone never downloads and does not stay busy", async () => {
    const cancel = new AbortController();
    cancel.abort();

    await withHarness(
      { fetchExport: async () => payload(), cancelSignal: cancel.signal },
      async (harness) => {
        await harness.click();

        expect(harness.workers).toEqual([]);
        expect(harness.downloads).toEqual([]);
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
        expect(harness.button()?.getAttribute("aria-busy")).toBeNull();
      },
    );
  });

  test("StrictMode double-mount does not lock the export button", async () => {
    await withHarness({ fetchExport: async () => payload(), strict: true }, async (harness) => {
      await harness.click();
      await act(async () => {
        harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
      });

      expect(harness.downloads).toEqual(["customers-2026-11-26.csv"]);
      expect(harness.status()).toBe("Exported 1 row.");
    });
  });

  test("HTTP worker mode keeps preparing while fetching, maps http-error, and aborts cleanly on cancel", async () => {
    const cancel = new AbortController();
    await withHarness(
      {
        cancelSignal: cancel.signal,
        fetchExport: async () => ({
          kind: "http",
          url: "http://localhost:3000/trpc/customers.export",
          credentials: "include",
          payloadPath: ["result", "data"],
          mapError: ({ status }) =>
            status === 413 ? "Narrow filters." : "Could not export customers. Try again.",
        }),
      },
      async (harness) => {
        await harness.click();
        expect(harness.workers).toHaveLength(1);
        expect(harness.workers[0]?.posted[0]).toEqual({
          type: "http",
          request: {
            url: "http://localhost:3000/trpc/customers.export",
            credentials: "include",
            headers: undefined,
            payloadPath: ["result", "data"],
          },
          filename: "customers-2026-11-26.csv",
        });

        await act(async () => {
          harness.workers[0]?.deliver({ type: "stage", stage: "fetching" });
        });
        expect(harness.status()).toBe("Preparing the export.");

        await act(async () => {
          cancel.abort();
        });
        expect(harness.workers[0]?.posted).toContainEqual({ type: "abort" });
        expect(harness.workers[0]?.terminated).toBe(false);
        expect(harness.status()).toBe("");

        await act(async () => {
          harness.workers[0]?.deliver({ type: "aborted" });
        });
        expect(harness.workers[0]?.terminated).toBe(true);
        expect(harness.downloads).toEqual([]);
      },
    );

    await withHarness(
      {
        fetchExport: async () => ({
          kind: "http",
          url: "http://localhost:3000/trpc/customers.export",
          mapError: ({ status }) =>
            status === 413 ? "Narrow filters." : "Could not export customers. Try again.",
        }),
      },
      async (harness) => {
        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({ type: "stage", stage: "fetching" });
          harness.workers[0]?.deliver({ type: "stage", stage: "generating" });
        });
        expect(harness.status()).toBe("Generating the CSV file.");

        await act(async () => {
          harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
        });
        expect(harness.downloads).toEqual(["customers-2026-11-26.csv"]);
        expect(harness.status()).toBe("Exported 1 row.");
      },
    );

    await withHarness(
      {
        fetchExport: async () => ({
          kind: "http",
          url: "http://localhost:3000/trpc/customers.export",
          mapError: ({ status }) =>
            status === 413 ? "Narrow filters." : "Could not export customers. Try again.",
        }),
      },
      async (harness) => {
        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({ type: "stage", stage: "fetching" });
          harness.workers[0]?.deliver({ type: "http-error", status: 413, body: "{}" });
        });

        expect(harness.workers[0]?.terminated).toBe(true);
        expect(harness.downloads).toEqual([]);
        expect(harness.alert()).toBe("Narrow filters.");
        expect(harness.button()?.getAttribute("aria-disabled")).toBeNull();
      },
    );
  });

  test("unmount revokes a created object URL even when the deferred task never runs", async () => {
    await withDom(async (win) => {
      // The callback runs before the deferred revocation task, so unmounting from
      // it is exactly the race that used to leak the URL.
      const holder: { unmount?: () => Promise<void> } = {};
      const harness = await mountExportButton(win, {
        fetchExport: async () => payload(),
        onExported: () => void holder.unmount?.(),
      });
      holder.unmount = harness.unmount;

      try {
        await harness.click();
        await act(async () => {
          harness.workers[0]?.deliver({ type: "done", file: csvFile(), rowCount: 1 });
        });

        expect(harness.createdUrls).toEqual(["blob:fake/1"]);
        expect(harness.revokedUrls).toEqual(["blob:fake/1"]);
      } finally {
        holder.unmount = undefined;
      }
    });
  });
});

describe("ListToolbar actions slot", () => {
  const search = { label: "Search customers", value: "", onChange: () => {} };

  test("renders the existing consumers unchanged when no actions are given", () => {
    const html = renderToStaticMarkup(<ListToolbar search={search} resultLabel="41 customers" />);

    expect(html).not.toContain('data-slot="list-toolbar-actions"');
    expect(html).toContain("41 customers");
    expect(html.indexOf("41 customers")).toBeGreaterThan(html.indexOf('data-slot="input-group"'));
  });

  test("renders actions after the result label at the trailing edge", () => {
    const html = renderToStaticMarkup(
      <ListToolbar
        search={search}
        resultLabel="41 customers"
        actions={<button type="button">Export CSV</button>}
      />,
    );

    expect(html).toContain('data-slot="list-toolbar-actions"');
    expect(html.indexOf("41 customers")).toBeLessThan(html.indexOf("Export CSV"));
  });
});
