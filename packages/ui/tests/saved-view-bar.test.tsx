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

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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

import type { SavedViewItem } from "../src/components/saved-view-bar";

const { createRoot } = await import("react-dom/client");
const { SavedViewBar } = await import("../src/components/saved-view-bar");

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
}

const INITIAL_VIEWS: SavedViewItem[] = [
  {
    id: "all",
    name: "All invoices",
    count: 23,
    isDefault: true,
    canRename: false,
    canDelete: false,
  },
  { id: "open", name: "Open balance", count: 8 },
  { id: "vip", name: "High value", count: 5 },
];

describe("SavedViewBar (TC-01, TC-03)", () => {
  test("selects views via controlled callbacks and renders unsaved-changes dot + save/discard actions", async () => {
    const selected: string[] = [];
    const saved: string[] = [];
    const discarded: string[] = [];

    const view = await renderInDom(
      <SavedViewBar
        views={INITIAL_VIEWS}
        activeViewId="open"
        isDirty
        onSelectView={(id) => selected.push(id)}
        onSaveChanges={(id) => saved.push(id)}
        onDiscardChanges={(id) => discarded.push(id)}
      />,
    );

    try {
      const openBtn = [...view.host.querySelectorAll("button")].find((btn) =>
        btn.textContent?.includes("Open balance"),
      )!;
      expect(openBtn.getAttribute("aria-pressed")).toBe("true");
      expect(openBtn.querySelector("[data-slot='saved-view-dirty-dot']")).toBeTruthy();
      expect(openBtn.textContent).toContain("unsaved changes");

      const allBtn = [...view.host.querySelectorAll("button")].find((btn) =>
        btn.textContent?.includes("All invoices"),
      )!;
      expect(allBtn.getAttribute("aria-pressed")).toBe("false");

      await act(async () => {
        click(allBtn);
      });
      expect(selected).toEqual(["all"]);

      const saveBtn = [...view.host.querySelectorAll("button")].find(
        (btn) => btn.textContent?.trim() === "Save changes",
      )!;
      await act(async () => {
        click(saveBtn);
      });
      expect(saved).toEqual(["open"]);

      const discardBtn = [...view.host.querySelectorAll("button")].find(
        (btn) => btn.textContent?.trim() === "Discard",
      )!;
      await act(async () => {
        click(discardBtn);
      });
      expect(discarded).toEqual(["open"]);
    } finally {
      await view.cleanup();
    }
  });

  test("announces a rejected save, leaves edits dirty, and allows retrying the same view", async () => {
    const firstSave = Promise.withResolvers<void>();
    const attempts: string[] = [];
    function Harness() {
      const [isDirty, setIsDirty] = React.useState(true);
      return (
        <SavedViewBar
          views={INITIAL_VIEWS}
          activeViewId="open"
          isDirty={isDirty}
          onSelectView={() => {}}
          onSaveChanges={async (id) => {
            attempts.push(id);
            if (attempts.length === 1) await firstSave.promise;
            setIsDirty(false);
          }}
        />
      );
    }
    const view = await renderInDom(<Harness />);
    try {
      const save = [...view.host.querySelectorAll("button")].find(
        (btn) => btn.textContent?.trim() === "Save changes",
      )!;
      await act(async () => click(save));
      expect(save.disabled).toBe(true);
      await act(async () => firstSave.reject(new Error("Temporary save failure")));
      expect(view.host.querySelector('[role="status"]')?.textContent).toContain(
        "Could not save changes. Try again.",
      );
      expect(view.host.querySelector('[data-slot="saved-view-dirty-dot"]')).toBeTruthy();
      expect(save.disabled).toBe(false);
      await act(async () => click(save));
      expect(attempts).toEqual(["open", "open"]);
      expect(view.host.querySelector('[data-slot="saved-view-dirty-actions"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("creates, renames, and confirms deletion via controlled callbacks without internal persistence", async () => {
    const created: string[] = [];
    const renamed: Array<[string, string]> = [];
    const deleted: string[] = [];

    const view = await renderInDom(
      <SavedViewBar
        views={INITIAL_VIEWS}
        activeViewId="open"
        onSelectView={() => {}}
        onCreateView={(name) => created.push(name)}
        onRenameView={(id, name) => renamed.push([id, name])}
        onDeleteView={(id) => deleted.push(id)}
      />,
    );

    try {
      // Create new view
      const newBtn = [...view.host.querySelectorAll("button")].find((btn) =>
        btn.textContent?.includes("Save view"),
      )!;
      await act(async () => {
        click(newBtn);
      });

      const createDialog = document.body.querySelector("[role='dialog']")!;
      expect(createDialog).toBeTruthy();
      const createInput = createDialog.querySelector<HTMLInputElement>("input")!;
      await act(async () => {
        setInputValue(createInput, "  Overdue Q1  ");
      });
      const submitCreate = [...createDialog.querySelectorAll("button")].find(
        (btn) => btn.textContent?.trim() === "Create view",
      )!;
      await act(async () => {
        click(submitCreate);
      });
      expect(created).toEqual(["Overdue Q1"]);

      // Open actions menu for active view "Open balance" -> Rename
      const menuTrigger = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Actions for Open balance"]',
      )!;
      await act(async () => {
        click(menuTrigger);
      });
      const renameItem = [...document.body.querySelectorAll("[role='menuitem']")].find((el) =>
        el.textContent?.includes("Rename"),
      )!;
      await act(async () => {
        click(renameItem);
      });

      const renameDialog = document.body.querySelector("[role='dialog']")!;
      const renameInput = renameDialog.querySelector<HTMLInputElement>("input")!;
      expect(renameInput.value).toBe("Open balance");
      await act(async () => {
        setInputValue(renameInput, "Open > $100");
      });
      const submitRename = [...renameDialog.querySelectorAll("button")].find(
        (btn) => btn.textContent?.trim() === "Save name",
      )!;
      await act(async () => {
        click(submitRename);
      });
      expect(renamed).toEqual([["open", "Open > $100"]]);

      // Open actions menu -> Delete -> ConfirmationDialog
      await act(async () => {
        click(menuTrigger);
      });
      const deleteItem = [...document.body.querySelectorAll("[role='menuitem']")].find((el) =>
        el.textContent?.includes("Delete"),
      )!;
      await act(async () => {
        click(deleteItem);
      });

      expect(deleted).toEqual([]);
      const confirmDialog = document.body.querySelector("[role='alertdialog']")!;
      expect(confirmDialog).toBeTruthy();
      const confirmDeleteBtn = [...confirmDialog.querySelectorAll("button")].find(
        (btn) => btn.textContent?.trim() === "Delete view",
      )!;
      await act(async () => {
        click(confirmDeleteBtn);
      });
      expect(deleted).toEqual(["open"]);
    } finally {
      await view.cleanup();
    }
  });
});
