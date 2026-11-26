import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import { act } from "react";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";

import { parseCsvTable, serializeCsvTemplate } from "../src/lib/csv";

/**
 * Base UI resolves `useIsoLayoutEffect` to `useLayoutEffect` only when
 * `document` already exists, and it decides once, when its module first loads.
 * Bun keeps one module registry per process, so any other test file that imports
 * Base UI before a DOM exists would leave the dialog's mount/exit transitions as
 * a noop here and the popup would never appear.
 *
 * `@base-ui/utils` is a transitive dependency, so the specifier has to be
 * resolved from `@base-ui/react`'s own directory before it can be mocked.
 */
const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

/**
 * Base UI resolves `useLayoutEffect` from `typeof document` once, when its module
 * first loads, so the DOM globals have to exist before `import-block` (and the
 * primitives it composes) are imported. One window therefore lives for the whole
 * file and each test only swaps the mounted container.
 */
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

const { ImportBlock } = await import("../src/components/import-block");
type ImportBlockModule = typeof import("../src/components/import-block");
type ImportBlockProps = ImportBlockModule["ImportBlock"] extends (
  props: infer Props,
) => React.ReactNode
  ? Props
  : never;
type ImportConfirmResult = ImportBlockModule["ImportConfirmResult"];
type ImportIssue = ImportBlockModule["ImportIssue"];
type ImportRecord = ImportBlockModule["ImportRecord"];

const COLUMNS = [
  "name",
  "email",
  "phone",
  "company",
  "status",
  "balanceMinor",
  "currency",
  "notes",
] as const;

const CONTRACT = { columns: COLUMNS, filename: "customers-template.csv" };
const DEFAULTS = { status: "active", balanceMinor: "0", currency: "USD" };
const HEADER = COLUMNS.join(",");

const realParse = async ({ text, columns }: { text: string; columns: readonly string[] }) =>
  parseCsvTable(text, columns);

const CLEAN_CSV = [HEADER, "Ada,ada@example.test,,,,,,", "Grace,grace@example.test,,,,,,"].join(
  "\n",
);

function csvFile(
  content: string,
  { name = "customers.csv", type = "text/csv" }: { name?: string; type?: string } = {},
) {
  return new win.File([content], name, { type }) as unknown as File;
}

function oversizedFile(bytes: number) {
  const file = csvFile("");
  Object.defineProperty(file, "size", { value: bytes, configurable: true });
  return file;
}

type Harness = {
  container: HTMLDivElement;
  root: Root;
  render: (props: Partial<ImportBlockProps>) => Promise<void>;
  cleanup: () => Promise<void>;
};

const BASE_PROPS = {
  contract: CONTRACT,
  defaults: DEFAULTS,
  parse: realParse as ImportBlockProps["parse"],
};

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(overrides: Partial<ImportBlockProps> = {}): Promise<Harness> {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  let props = { ...BASE_PROPS, ...overrides };

  const render = async (next: Partial<ImportBlockProps> = {}) => {
    props = { ...props, ...next };
    await act(async () => {
      root.render(<ImportBlock {...props} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  await render();

  return {
    container,
    root,
    render,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      container.remove();
    },
  };
}

async function click(element: Element | null) {
  if (!element) throw new Error("expected an element to click");
  await act(async () => {
    (element as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function dialog() {
  return win.document.querySelector('[data-slot="dialog-content"]');
}

function dialogText() {
  return dialog()?.textContent ?? "";
}

function trigger() {
  return win.document.querySelector<HTMLButtonElement>('[data-slot="import-trigger"]');
}

function confirmButton() {
  return win.document.querySelector<HTMLButtonElement>('[data-slot="import-confirm"]');
}

function buttonByText(text: string, scope: ParentNode = win.document.body) {
  return (
    Array.from(scope.querySelectorAll("button")).find(
      (button) => (button.textContent ?? "").trim() === text,
    ) ?? null
  );
}

async function openDialog() {
  await click(trigger());
  expect(dialog()).not.toBeNull();
}

async function chooseFile(file: File) {
  const input = dialog()?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("expected a file input inside the dialog");
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterAll(async () => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  await win.close();
  Object.assign(globalThis, previousGlobals);
});

describe("ImportBlock", () => {
  test("downloads the template, previews a clean file with plain callbacks, and confirms once", async () => {
    const blobs: Blob[] = [];
    const downloads: string[] = [];
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return "blob:template";
    };
    URL.revokeObjectURL = () => {};
    const originalClick = win.HTMLAnchorElement.prototype.click;
    win.HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      downloads.push(this.download);
      return undefined;
    };

    const validateCalls: ImportRecord[][] = [];
    const confirmCalls: ImportRecord[][] = [];

    const harness = await mount({
      validate: (records) => {
        validateCalls.push(records);
        return [];
      },
      confirm: (records) => {
        confirmCalls.push(records);
        return { ok: true, created: records.length } satisfies ImportConfirmResult;
      },
    });

    try {
      expect(trigger()?.textContent?.trim()).toBe("Import");
      expect(trigger()?.getAttribute("aria-haspopup")).toBe("dialog");

      await openDialog();
      await click(buttonByText("Download CSV template"));

      expect(downloads).toEqual([CONTRACT.filename]);
      expect(blobs).toHaveLength(1);
      expect(await blobs[0]!.text()).toBe(serializeCsvTemplate(COLUMNS));
      expect(await blobs[0]!.text()).toBe(
        "name,email,phone,company,status,balanceMinor,currency,notes\n",
      );

      await chooseFile(csvFile(CLEAN_CSV));
      await settle();

      expect(dialogText()).toContain("2 records");
      expect(validateCalls).toHaveLength(1);
      expect(validateCalls[0]?.map((record) => record.lineNumber)).toEqual([2, 3]);
      expect(validateCalls[0]?.[0]?.values).toMatchObject({
        name: "Ada",
        status: "active",
        balanceMinor: "0",
        currency: "USD",
        notes: "",
      });

      expect(confirmButton()?.disabled).toBe(false);
      await click(confirmButton());

      expect(confirmCalls).toHaveLength(1);
      expect(confirmCalls[0]?.map((record) => record.lineNumber)).toEqual([2, 3]);
      expect(dialog()).toBeNull();
    } finally {
      win.HTMLAnchorElement.prototype.click = originalClick;
      await harness.cleanup();
    }
  });

  test("lists every issue by its original line number, including rows past the sample", async () => {
    const multiline = [
      HEADER,
      '"Ada\nLovelace",ada@example.test,,,,,,',
      "Grace,grace@example.test,,,,,,",
      "Katherine,katherine@example.test,,,,,,",
    ].join("\n");

    const issues: ImportIssue[] = [
      { lineNumber: 2, field: "email", message: "Email is already used by another Customer." },
      { lineNumber: 5, field: "balanceMinor", message: "Balance must be a whole number." },
    ];

    const harness = await mount({
      sampleLimit: 1,
      validate: () => issues,
      confirm: () => {
        throw new Error("confirm must stay unreachable while issues exist");
      },
    });

    try {
      await openDialog();
      await chooseFile(csvFile(multiline));
      await settle();

      const text = dialogText();
      expect(text).toContain("3 records");
      expect(text).toContain("Showing 1 of 3");
      expect(text).toContain("Line 2");
      expect(text).toContain("Line 5");
      expect(text).toContain("Email is already used by another Customer.");
      expect(text).toContain("Balance must be a whole number.");
      expect(text).toContain("2 issues to fix");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("rejects an unsupported file type with one recoverable message and clears the preview", async () => {
    let parseCalls = 0;
    const harness = await mount({
      parse: async ({ text, columns }) => {
        parseCalls += 1;
        return parseCsvTable(text, columns);
      },
      validate: () => [],
      confirm: () => ({ ok: true, created: 0 }),
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV));
      await settle();
      expect(dialogText()).toContain("2 records");

      await chooseFile(csvFile("nope", { name: "customers.pdf", type: "application/pdf" }));
      await settle();

      expect(parseCalls).toBe(1);
      expect(dialogText()).toContain("Choose a .csv file");
      expect(dialogText()).not.toContain("2 records");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("accepts a type-less .csv file and rejects a type-less file that is not .csv", async () => {
    let parseCalls = 0;
    const harness = await mount({
      parse: async ({ text, columns }) => {
        parseCalls += 1;
        return parseCsvTable(text, columns);
      },
      validate: () => [],
      confirm: () => ({ ok: true, created: 0 }),
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV, { name: "customers.csv", type: "" }));
      await settle();
      expect(parseCalls).toBe(1);
      expect(dialogText()).toContain("2 records");

      await chooseFile(csvFile(CLEAN_CSV, { name: "customers.txt", type: "" }));
      await settle();
      expect(parseCalls).toBe(1);
      expect(dialogText()).toContain("Choose a .csv file");
    } finally {
      await harness.cleanup();
    }
  });

  test("rejects a file above the byte limit without parsing it", async () => {
    let parseCalls = 0;
    const harness = await mount({
      parse: async ({ text, columns }) => {
        parseCalls += 1;
        return parseCsvTable(text, columns);
      },
      validate: () => [],
      confirm: () => ({ ok: true, created: 0 }),
    });

    try {
      await openDialog();
      await chooseFile(oversizedFile(5 * 1024 * 1024 + 1));
      await settle();

      expect(parseCalls).toBe(0);
      expect(dialogText()).toContain("5 MiB");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("rejects more than 1000 nonblank rows", async () => {
    const rows = Array.from(
      { length: 1001 },
      (_, index) => `Row ${index},row${index}@example.test,,,,,,`,
    );
    const harness = await mount({
      validate: () => [],
      confirm: () => ({ ok: true, created: 0 }),
    });

    try {
      await openDialog();
      await chooseFile(csvFile([HEADER, ...rows].join("\n")));
      await settle();

      expect(dialogText()).toContain("1,000");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("reports a rejected header set from the parser", async () => {
    const harness = await mount({
      validate: () => [],
      confirm: () => ({ ok: true, created: 0 }),
    });

    try {
      await openDialog();
      await chooseFile(csvFile(`name,email\nAda,ada@example.test`));
      await settle();

      expect(dialogText()).toContain("missing required columns");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("discards a stale validation response after the file is cancelled", async () => {
    let releaseValidation: ((issues: ImportIssue[]) => void) | undefined;
    const validation = new Promise<ImportIssue[]>((resolve) => {
      releaseValidation = resolve;
    });

    const harness = await mount({
      validate: () => validation,
      confirm: () => {
        throw new Error("confirm must not run for a cancelled file");
      },
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV));
      await settle();
      expect(dialogText()).toContain("Checking");

      await click(buttonByText("Cancel"));
      await settle();
      expect(dialog()).toBeNull();

      await act(async () => {
        releaseValidation?.([{ lineNumber: 2, field: "email", message: "Stale issue" }]);
        await validation;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await openDialog();
      expect(dialogText()).not.toContain("Stale issue");
      expect(dialogText()).not.toContain("2 records");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("submits exactly once while the confirmation is pending", async () => {
    let releaseConfirm: ((result: ImportConfirmResult) => void) | undefined;
    const pending = new Promise<ImportConfirmResult>((resolve) => {
      releaseConfirm = resolve;
    });
    let confirmCalls = 0;

    const harness = await mount({
      validate: () => [],
      confirm: () => {
        confirmCalls += 1;
        return pending;
      },
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV));
      await settle();

      await click(confirmButton());
      await settle();
      expect(confirmCalls).toBe(1);

      await click(confirmButton());
      await settle();
      expect(confirmCalls).toBe(1);
      expect(dialogText()).toContain("Importing");

      await act(async () => {
        releaseConfirm?.({ ok: true, created: 2 });
        await pending;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(dialog()).toBeNull();
    } finally {
      await harness.cleanup();
    }
  });

  test("reports a post-preview conflict by line number without losing the preview", async () => {
    const harness = await mount({
      validate: () => [],
      confirm: () => ({ ok: false, conflictLineNumbers: [3] }),
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV));
      await settle();
      await click(confirmButton());
      await settle();

      const text = dialogText();
      expect(text).toContain("Line 3");
      expect(text).toContain("Nothing was saved");
      expect(text).toContain("2 records");
      expect(confirmButton()?.disabled).toBe(false);
    } finally {
      await harness.cleanup();
    }
  });

  test("keeps a recoverable message when the confirmation fails", async () => {
    const harness = await mount({
      validate: () => [],
      confirm: () => {
        throw new Error("network down");
      },
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV));
      await settle();
      await click(confirmButton());
      await settle();

      expect(dialogText()).toContain("Nothing was saved");
      expect(dialogText()).toContain("try again");
      expect(confirmButton()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });

  test("escape closes the workflow without writing", async () => {
    let confirmCalls = 0;
    const harness = await mount({
      validate: () => [],
      confirm: () => {
        confirmCalls += 1;
        return { ok: true, created: 2 };
      },
    });

    try {
      await openDialog();
      await chooseFile(csvFile(CLEAN_CSV));
      await settle();

      await act(async () => {
        dialog()?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await settle();

      expect(confirmCalls).toBe(0);
      expect(dialog()).toBeNull();
    } finally {
      await harness.cleanup();
    }
  });

  test("renders the trigger label and disabled state supplied by the screen", async () => {
    const harness = await mount({
      triggerLabel: "Import customers",
      disabled: true,
      validate: () => [],
      confirm: () => ({ ok: true, created: 0 }),
    });

    try {
      expect(trigger()?.textContent?.trim()).toBe("Import customers");
      expect(trigger()?.disabled).toBe(true);
    } finally {
      await harness.cleanup();
    }
  });
});
