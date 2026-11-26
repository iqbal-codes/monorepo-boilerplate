import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { ExportButton } from "../src/components/export-button";
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

    const buttonTag = buttonAttributes(html);
    const describedBy = /aria-describedby="([^"]+)"/.exec(buttonTag)?.[1];
    const hintId = /<p id="([^"]+)"[^>]*>CSV escaping may change literal text\./.exec(html)?.[1];

    expect(html).toContain(">Export CSV<");
    expect(html).toContain("CSV escaping may change literal text.");
    expect(describedBy).toBeDefined();
    expect(hintId).toBeDefined();
    expect(describedBy).toBe(hintId);
    expect(buttonTag).not.toContain("disabled");
    expect(buttonTag).not.toContain("aria-busy");
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

    const buttonTag = buttonAttributes(html);

    expect(buttonTag).toContain('aria-describedby="');
    expect(buttonTag).toContain("disabled");
    expect(html).toContain("CSV escaping may change literal text.");
  });
});

describe("ExportButton activation", () => {
  test("announces preparation, sends the abort signal, and releases the worker", async () => {
    await withDom(async (win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container);

      const signals: AbortSignal[] = [];
      const downloaded: string[] = [];
      const workers: FakeWorker[] = [];
      const revoked: string[] = [];
      const created: Blob[] = [];

      class FakeWorker {
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
      }

      const RealURL = globalThis.URL;
      class FakeURL extends RealURL {
        static createObjectURL = (blob: Blob) => {
          created.push(blob);
          return `blob:fake/${created.length}`;
        };
        static revokeObjectURL = (url: string) => revoked.push(url);
      }
      const previous = { Worker: globalThis.Worker, URL: RealURL };
      Object.assign(globalThis, { Worker: FakeWorker, URL: FakeURL });

      const createElement = win.document.createElement.bind(win.document);
      (win.document as unknown as { createElement: typeof createElement }).createElement = ((
        tag: string,
        ...rest: unknown[]
      ) => {
        const element = createElement(tag, ...rest) as HTMLElement & {
          click: () => void;
        };
        if (tag === "a") {
          element.click = () => downloaded.push(element.getAttribute("download") ?? "");
        }
        return element;
      }) as typeof createElement;

      const exported: Array<{ rows: number; name: string }> = [];
      let resolvePayload: ((payload: string) => void) | undefined;
      try {
        await act(async () => {
          root.render(
            <ExportButton
              label="Export CSV"
              hint="CSV escaping may change literal text."
              getFilename={() => "customers-2026-11-26.csv"}
              fetchExport={(signal) => {
                signals.push(signal);
                return new Promise<string>((resolve) => {
                  resolvePayload = resolve;
                });
              }}
              onExported={(file, rowCount) => exported.push({ rows: rowCount, name: file.name })}
            />,
          );
        });

        const button = container.querySelector("button");
        expect(button?.getAttribute("aria-busy")).toBeNull();

        await act(async () => {
          button?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(signals).toHaveLength(1);
        expect(workers).toHaveLength(0);
        expect(container.querySelector("button")?.disabled).toBe(true);
        expect(container.querySelector("button")?.getAttribute("aria-busy")).toBe("true");
        expect(container.textContent).toContain("Preparing the export.");

        await act(async () => {
          resolvePayload?.(JSON.stringify({ headers: ["name"], rows: [["Ada"], ["Grace"]] }));
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(workers).toHaveLength(1);
        expect(container.textContent).toContain("Generating the CSV file.");
        expect(workers[0]?.posted).toEqual([
          {
            payload: JSON.stringify({ headers: ["name"], rows: [["Ada"], ["Grace"]] }),
            filename: "customers-2026-11-26.csv",
          },
        ]);
        expect(container.querySelector("button")?.disabled).toBe(true);

        const file = new (globalThis.File as typeof File)(
          ["name\r\n"],
          "customers-2026-11-26.csv",
          {
            type: "text/csv;charset=utf-8",
          },
        );
        await act(async () => {
          workers[0]?.onmessage?.({ data: { type: "done", file, rowCount: 2 } });
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(workers[0]?.terminated).toBe(true);
        expect(downloaded).toEqual(["customers-2026-11-26.csv"]);
        expect(revoked).toEqual(["blob:fake/1"]);
        expect(exported).toEqual([{ rows: 2, name: "customers-2026-11-26.csv" }]);
        expect(container.querySelector("button")?.disabled).toBe(false);
        expect(container.querySelector("button")?.getAttribute("aria-busy")).toBeNull();
        expect(container.querySelector('[role="status"]')?.textContent).toBe("Exported 2 rows.");
      } finally {
        await act(async () => {
          root.unmount();
        });
        Object.assign(globalThis, previous);
      }
    });
  });

  test("surfaces a fetch failure as an assertive retry message without a download", async () => {
    await withDom(async (win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container);

      const workers: unknown[] = [];
      const downloaded: string[] = [];
      const previous = { Worker: globalThis.Worker };
      class FakeWorker {
        onmessage: unknown = null;
        onerror: unknown = null;
        postMessage() {}
        terminate() {}
        constructor() {
          workers.push(this);
        }
      }
      Object.assign(globalThis, { Worker: FakeWorker });

      const createElement = win.document.createElement.bind(win.document);
      (win.document as unknown as { createElement: typeof createElement }).createElement = ((
        tag: string,
        ...rest: unknown[]
      ) => {
        const element = createElement(tag, ...rest) as HTMLElement & { click: () => void };
        if (tag === "a") element.click = () => downloaded.push("clicked");
        return element;
      }) as typeof createElement;

      try {
        await act(async () => {
          root.render(
            <ExportButton
              label="Export CSV"
              hint="CSV escaping may change literal text."
              getFilename={() => "customers.csv"}
              fetchExport={async () => {
                throw new Error("Could not export customers. Check your connection and try again.");
              }}
            />,
          );
        });

        await act(async () => {
          container.querySelector("button")?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const alert = container.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain("Could not export customers");
        expect(alert?.textContent).toContain("try again");
        expect(workers).toHaveLength(0);
        expect(downloaded).toEqual([]);
        expect(container.querySelector("button")?.disabled).toBe(false);
      } finally {
        await act(async () => {
          root.unmount();
        });
        Object.assign(globalThis, previous);
      }
    });
  });
});

describe("ExportButton guards", () => {
  test("a double activation starts exactly one export", async () => {
    await withDom(async (win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container);

      const signals: AbortSignal[] = [];
      const previous = { Worker: globalThis.Worker };
      class FakeWorker {
        onmessage: unknown = null;
        onerror: unknown = null;
        postMessage() {}
        terminate() {}
      }
      Object.assign(globalThis, { Worker: FakeWorker });

      try {
        await act(async () => {
          root.render(
            <ExportButton
              label="Export CSV"
              getFilename={() => "customers.csv"}
              fetchExport={(signal) => {
                signals.push(signal);
                return new Promise<string>(() => {});
              }}
            />,
          );
        });

        const button = container.querySelector("button");
        await act(async () => {
          button?.click();
          button?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(signals).toHaveLength(1);
      } finally {
        await act(async () => {
          root.unmount();
        });
        Object.assign(globalThis, previous);
      }
    });
  });

  test("unmount aborts an in-flight fetch so nothing is generated", async () => {
    await withDom(async (win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container);

      const signals: AbortSignal[] = [];
      const workers: unknown[] = [];
      const previous = { Worker: globalThis.Worker };
      class CountingWorker {
        onmessage: unknown = null;
        onerror: unknown = null;
        postMessage() {}
        terminate() {}
        constructor() {
          workers.push(this);
        }
      }
      Object.assign(globalThis, { Worker: CountingWorker });

      try {
        await act(async () => {
          root.render(
            <ExportButton
              label="Export CSV"
              getFilename={() => "customers.csv"}
              fetchExport={(signal) => {
                signals.push(signal);
                return new Promise<string>(() => {});
              }}
            />,
          );
        });

        await act(async () => {
          container.querySelector("button")?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(signals).toHaveLength(1);

        await act(async () => {
          root.unmount();
        });

        expect(signals[0]?.aborted).toBe(true);
        expect(workers).toEqual([]);
      } finally {
        Object.assign(globalThis, previous);
      }
    });
  });

  test("unmount terminates a running worker and delivers no stale download", async () => {
    await withDom(async (win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container);

      const signals: AbortSignal[] = [];
      const workers: FakeWorker[] = [];
      const downloaded: string[] = [];
      class FakeWorker {
        onmessage: ((event: { data: unknown }) => void) | null = null;
        onerror: unknown = null;
        terminated = false;
        posted = 0;
        constructor() {
          workers.push(this);
        }
        postMessage() {
          this.posted += 1;
        }
        terminate() {
          this.terminated = true;
        }
      }
      const previous = { Worker: globalThis.Worker };
      Object.assign(globalThis, { Worker: FakeWorker });

      const createElement = win.document.createElement.bind(win.document);
      (win.document as unknown as { createElement: typeof createElement }).createElement = ((
        tag: string,
        ...rest: unknown[]
      ) => {
        const element = createElement(tag, ...rest) as HTMLElement & { click: () => void };
        if (tag === "a") element.click = () => downloaded.push("clicked");
        return element;
      }) as typeof createElement;

      try {
        await act(async () => {
          root.render(
            <ExportButton
              label="Export CSV"
              getFilename={() => "customers.csv"}
              fetchExport={(signal) => {
                signals.push(signal);
                return Promise.resolve(JSON.stringify({ headers: ["name"], rows: [] }));
              }}
            />,
          );
        });

        await act(async () => {
          container.querySelector("button")?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(workers).toHaveLength(1);
        expect(workers[0]?.posted).toBe(1);

        await act(async () => {
          root.unmount();
        });

        expect(workers[0]?.terminated).toBe(true);

        // A late worker message must not download anything after teardown.
        await act(async () => {
          const file = new (globalThis.File as typeof File)(["name\r\n"], "customers.csv", {
            type: "text/csv;charset=utf-8",
          });
          workers[0]?.onmessage?.({ data: { type: "done", file, rowCount: 0 } });
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(downloaded).toEqual([]);
      } finally {
        Object.assign(globalThis, previous);
      }
    });
  });

  test("a worker generation failure is assertive, leaves no download, and re-enables the control", async () => {
    await withDom(async (win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container);

      const workers: FakeWorker[] = [];
      const downloaded: string[] = [];
      class FakeWorker {
        onmessage: ((event: { data: unknown }) => void) | null = null;
        onerror: unknown = null;
        terminated = false;
        constructor() {
          workers.push(this);
        }
        postMessage() {}
        terminate() {
          this.terminated = true;
        }
      }
      const previous = { Worker: globalThis.Worker };
      Object.assign(globalThis, { Worker: FakeWorker });

      const createElement = win.document.createElement.bind(win.document);
      (win.document as unknown as { createElement: typeof createElement }).createElement = ((
        tag: string,
        ...rest: unknown[]
      ) => {
        const element = createElement(tag, ...rest) as HTMLElement & { click: () => void };
        if (tag === "a") element.click = () => downloaded.push("clicked");
        return element;
      }) as typeof createElement;

      const exported: number[] = [];
      try {
        await act(async () => {
          root.render(
            <ExportButton
              label="Export CSV"
              getFilename={() => "customers.csv"}
              fetchExport={async () => "{}"}
              onExported={(_file, rowCount) => exported.push(rowCount)}
            />,
          );
        });

        await act(async () => {
          container.querySelector("button")?.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        await act(async () => {
          workers[0]?.onmessage?.({
            data: { type: "error", message: "Export payload is not valid JSON." },
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(workers[0]?.terminated).toBe(true);
        expect(downloaded).toEqual([]);
        expect(exported).toEqual([]);
        expect(container.querySelector('[role="alert"]')?.textContent).toContain(
          "Export payload is not valid JSON.",
        );
        expect(container.querySelector("button")?.disabled).toBe(false);
      } finally {
        await act(async () => {
          root.unmount();
        });
        Object.assign(globalThis, previous);
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
