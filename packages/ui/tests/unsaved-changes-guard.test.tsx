import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";

const baseUiRoot = dirname(
  dirname(Bun.resolveSync("@base-ui/react/alert-dialog", import.meta.dir)),
);

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
  "HTMLInputElement",
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
const { Form, UnsavedChangesGuard, useAppForm } = await import("../src/components/form");

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
    rerender: async (nextNode: React.ReactNode) => {
      await act(async () => {
        root.render(nextNode);
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

describe("UnsavedChangesGuard", () => {
  test("passes clean close immediately without opening confirmation dialog", async () => {
    let closedCount = 0;

    function CleanHarness() {
      const [open, setOpen] = React.useState(true);
      const form = useAppForm({
        defaultValues: { name: "Ada" },
      });

      return (
        <UnsavedChangesGuard
          form={form}
          enabled={open}
          onClose={() => {
            closedCount += 1;
            setOpen(false);
          }}
        >
          {({ requestClose }) =>
            open ? (
              <div>
                <Form form={form}>
                  <form.AppField name="name">
                    {(field) => <field.TextField label="Name" />}
                  </form.AppField>
                </Form>
                <button type="button" data-testid="close-btn" onClick={requestClose}>
                  Close
                </button>
              </div>
            ) : null
          }
        </UnsavedChangesGuard>
      );
    }

    const view = await renderInDom(<CleanHarness />);
    try {
      const closeBtn = view.host.querySelector<HTMLButtonElement>('[data-testid="close-btn"]');
      expect(closeBtn).not.toBeNull();

      await act(async () => {
        closeBtn?.click();
      });

      expect(closedCount).toBe(1);
      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("intercepts dirty close and supports Keep editing vs Discard changes", async () => {
    let discardedCount = 0;

    function DirtyHarness() {
      const [open, setOpen] = React.useState(true);
      const form = useAppForm({
        defaultValues: { name: "Ada" },
      });

      return (
        <UnsavedChangesGuard
          form={form}
          enabled={open}
          onClose={() => setOpen(false)}
          onDiscard={() => {
            discardedCount += 1;
            form.reset();
          }}
        >
          {({ requestClose }) =>
            open ? (
              <div data-testid="panel">
                <Form form={form}>
                  <form.AppField name="name">
                    {(field) => <field.TextField label="Name" />}
                  </form.AppField>
                </Form>
                <button type="button" data-testid="close-btn" onClick={requestClose}>
                  Close
                </button>
              </div>
            ) : (
              <div data-testid="closed">Closed</div>
            )
          }
        </UnsavedChangesGuard>
      );
    }

    const view = await renderInDom(<DirtyHarness />);
    try {
      const input = view.host.querySelector<HTMLInputElement>("input");
      expect(input).not.toBeNull();

      await act(async () => {
        if (input) setInputValue(input, "Grace");
      });

      const closeBtn = view.host.querySelector<HTMLButtonElement>('[data-testid="close-btn"]');
      await act(async () => {
        closeBtn?.click();
      });

      const alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog).not.toBeNull();
      expect(alertDialog?.textContent).toContain("Keep editing");
      expect(alertDialog?.textContent).toContain("Discard changes");
      expect(view.host.querySelector('[data-testid="panel"]')).not.toBeNull();

      const keepEditingBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      );
      await act(async () => {
        keepEditingBtn?.click();
      });

      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
      expect(view.host.querySelector('[data-testid="panel"]')).not.toBeNull();
      expect(input?.value).toBe("Grace");
      expect(discardedCount).toBe(0);

      await act(async () => {
        closeBtn?.click();
      });

      const discardBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Discard changes"),
      );
      await act(async () => {
        discardBtn?.click();
      });

      expect(discardedCount).toBe(1);
      expect(view.host.querySelector('[data-testid="closed"]')).not.toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("allows clean close after form.reset() simulates a completed save", async () => {
    let closedCount = 0;

    function SaveHarness() {
      const [open, setOpen] = React.useState(true);
      const form = useAppForm({
        defaultValues: { name: "Ada" },
      });

      return (
        <UnsavedChangesGuard
          form={form}
          enabled={open}
          onClose={() => {
            closedCount += 1;
            setOpen(false);
          }}
        >
          {({ requestClose }) =>
            open ? (
              <div>
                <Form form={form}>
                  <form.AppField name="name">
                    {(field) => <field.TextField label="Name" />}
                  </form.AppField>
                </Form>
                <button
                  type="button"
                  data-testid="save-btn"
                  onClick={() => {
                    form.reset();
                    requestClose();
                  }}
                >
                  Save
                </button>
              </div>
            ) : null
          }
        </UnsavedChangesGuard>
      );
    }

    const view = await renderInDom(<SaveHarness />);
    try {
      const input = view.host.querySelector<HTMLInputElement>("input");
      await act(async () => {
        if (input) setInputValue(input, "Grace");
      });

      const saveBtn = view.host.querySelector<HTMLButtonElement>('[data-testid="save-btn"]');
      await act(async () => {
        saveBtn?.click();
      });

      expect(closedCount).toBe(1);
      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("prompts on blocked route navigation and invokes proceed or reset", async () => {
    let proceeded = 0;
    let resetCalls = 0;

    function BlockerHarness({ blocked }: { blocked: boolean }) {
      return (
        <UnsavedChangesGuard
          isDirty
          blocker={
            blocked
              ? {
                  status: "blocked",
                  proceed: () => {
                    proceeded += 1;
                  },
                  reset: () => {
                    resetCalls += 1;
                  },
                }
              : { status: "idle" }
          }
        />
      );
    }

    const view = await renderInDom(<BlockerHarness blocked />);
    try {
      const keepEditingBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      );
      expect(keepEditingBtn).toBeDefined();

      await act(async () => {
        keepEditingBtn?.click();
      });
      expect(resetCalls).toBe(1);
      expect(proceeded).toBe(0);

      await view.rerender(<BlockerHarness blocked />);
      const discardBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Discard changes"),
      );
      await act(async () => {
        discardBtn?.click();
      });
      expect(proceeded).toBe(1);
    } finally {
      await view.cleanup();
    }
  });

  test("rejects close requests while pending and keeps dirty protection after failure", async () => {
    let closedCount = 0;

    function PendingHarness() {
      const [open, setOpen] = React.useState(true);
      const [pending, setPending] = React.useState(false);
      const form = useAppForm({
        defaultValues: { name: "Ada" },
      });

      return (
        <UnsavedChangesGuard
          form={form}
          enabled={open}
          pending={pending}
          onClose={() => {
            closedCount += 1;
            setOpen(false);
          }}
        >
          {({ guardOpenChange }) =>
            open ? (
              <div data-testid="panel">
                <Form form={form}>
                  <form.AppField name="name">
                    {(field) => <field.TextField label="Name" />}
                  </form.AppField>
                </Form>
                <button type="button" data-testid="start-save" onClick={() => setPending(true)}>
                  Start save
                </button>
                <button type="button" data-testid="fail-save" onClick={() => setPending(false)}>
                  Fail save
                </button>
                <button
                  type="button"
                  data-testid="escape-close"
                  onClick={() => guardOpenChange(false)}
                >
                  Escape
                </button>
              </div>
            ) : null
          }
        </UnsavedChangesGuard>
      );
    }

    const view = await renderInDom(<PendingHarness />);
    try {
      const input = view.host.querySelector<HTMLInputElement>("input");
      await act(async () => {
        if (input) setInputValue(input, "Pending Draft");
      });

      await act(async () => {
        view.host.querySelector<HTMLButtonElement>('[data-testid="start-save"]')?.click();
      });

      // Attempt close while save is pending: must stay open without prompting or closing.
      await act(async () => {
        view.host.querySelector<HTMLButtonElement>('[data-testid="escape-close"]')?.click();
      });

      expect(closedCount).toBe(0);
      expect(view.host.querySelector('[data-testid="panel"]')).not.toBeNull();
      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).toBeNull();
      expect(input?.value).toBe("Pending Draft");

      // Save fails -> pending returns to false -> Escape now prompts Discard confirmation.
      await act(async () => {
        view.host.querySelector<HTMLButtonElement>('[data-testid="fail-save"]')?.click();
      });
      await act(async () => {
        view.host.querySelector<HTMLButtonElement>('[data-testid="escape-close"]')?.click();
      });

      expect(closedCount).toBe(0);
      expect(document.body.querySelector('[data-slot="alert-dialog-content"]')).not.toBeNull();
      expect(input?.value).toBe("Pending Draft");
    } finally {
      await view.cleanup();
    }
  });

  test("resets blocked navigation prompt when guard is disabled after save completes", async () => {
    let resetCalls = 0;

    function SaveClearsBlockerHarness({
      enabled,
      blocked,
    }: {
      enabled: boolean;
      blocked: boolean;
    }) {
      return (
        <UnsavedChangesGuard
          isDirty={enabled}
          enabled={enabled}
          blocker={
            blocked
              ? {
                  status: "blocked",
                  proceed: () => {},
                  reset: () => {
                    resetCalls += 1;
                  },
                }
              : { status: "idle" }
          }
        />
      );
    }

    const view = await renderInDom(<SaveClearsBlockerHarness enabled blocked />);
    try {
      expect(Boolean(document.body.querySelector('[data-slot="alert-dialog-content"]'))).toBe(true);

      await view.rerender(<SaveClearsBlockerHarness enabled={false} blocked />);
      expect(resetCalls).toBe(1);
      expect(Boolean(document.body.querySelector('[data-slot="alert-dialog-content"]'))).toBe(
        false,
      );
    } finally {
      await view.cleanup();
    }
  });
});
