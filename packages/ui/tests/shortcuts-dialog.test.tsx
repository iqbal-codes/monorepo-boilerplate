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
const { ShortcutsDialog } = await import("../src/components/shortcuts-dialog");

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

const SAMPLE_GROUPS = [
  {
    id: "navigation",
    label: "Navigation",
    items: [
      {
        id: "command-center",
        label: "Open Command Center",
        description: "Jump to any screen or customer",
        keys: [
          ["mod", "K"],
          ["mod", "Enter"],
        ],
        keywords: ["search", "jump"],
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        keys: [["mod", "B"]],
      },
    ],
  },
  {
    id: "help",
    label: "Help",
    items: [
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        keys: [["?"]],
      },
    ],
  },
] as const;

describe("ShortcutsDialog", () => {
  test("renders grouped shortcuts with platform-aware Kbd chords, filters list, and shows empty state", async () => {
    const view = await renderInDom(
      <ShortcutsDialog open onOpenChange={() => {}} groups={SAMPLE_GROUPS} platform="mac" />,
    );

    try {
      const dialog = document.body.querySelector('[data-slot="shortcuts-dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("⌘");
      expect(dialog?.textContent).toContain("Navigation");
      expect(dialog?.textContent).toContain("Help");

      const searchInput = document.body.querySelector<HTMLInputElement>(
        'input[aria-label="Search keyboard shortcuts"]',
      );
      expect(searchInput).not.toBeNull();

      await act(async () => {
        if (searchInput) setInputValue(searchInput, "sidebar");
      });

      const items = document.body.querySelectorAll('[data-slot="shortcut-item"]');
      expect(items.length).toBe(1);
      expect(items[0]?.textContent).toContain("Toggle sidebar");

      await act(async () => {
        if (searchInput) setInputValue(searchInput, "zzzz-missing");
      });

      expect(document.body.querySelectorAll('[data-slot="shortcut-item"]').length).toBe(0);
      const empty = document.body.querySelector('[data-slot="shortcuts-dialog-empty"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain("No shortcuts match");

      const clearBtn = document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Clear search"]',
      );
      expect(clearBtn).not.toBeNull();
      await act(async () => {
        clearBtn?.click();
      });
      expect(document.body.querySelectorAll('[data-slot="shortcut-item"]').length).toBe(3);
    } finally {
      await view.cleanup();
    }
  });

  test("returns focus to trigger on Escape close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
            Shortcuts
          </button>
          <ShortcutsDialog open={open} onOpenChange={setOpen} groups={SAMPLE_GROUPS} />
        </div>
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const opener = view.host.querySelector<HTMLButtonElement>('[data-testid="opener"]');
      expect(opener).not.toBeNull();
      opener?.focus();

      await act(async () => {
        opener?.click();
      });

      const popup = document.body.querySelector<HTMLElement>('[data-slot="shortcuts-dialog"]');
      expect(popup).not.toBeNull();

      await act(async () => {
        popup?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });

      expect(Boolean(document.body.querySelector('[data-slot="shortcuts-dialog"]'))).toBe(false);
      expect(document.activeElement === opener).toBe(true);
    } finally {
      await view.cleanup();
    }
  });

  test("returns focus to explicit finalFocus launcher target on Escape close", async () => {
    function HandoffHarness() {
      const [open, setOpen] = React.useState(false);
      const launcherRef = React.useRef<HTMLButtonElement>(null);

      return (
        <div>
          <button type="button" ref={launcherRef} data-testid="launcher">
            Launcher
          </button>
          <button type="button" data-testid="handoff-trigger" onClick={() => setOpen(true)}>
            Open via handoff
          </button>
          <ShortcutsDialog
            open={open}
            onOpenChange={setOpen}
            groups={SAMPLE_GROUPS}
            finalFocus={() => launcherRef.current}
          />
        </div>
      );
    }

    const view = await renderInDom(<HandoffHarness />);
    try {
      const launcher = view.host.querySelector<HTMLButtonElement>('[data-testid="launcher"]');
      const handoffTrigger = view.host.querySelector<HTMLButtonElement>(
        '[data-testid="handoff-trigger"]',
      );
      expect(launcher).not.toBeNull();
      expect(handoffTrigger).not.toBeNull();

      handoffTrigger?.focus();
      await act(async () => {
        handoffTrigger?.click();
      });

      const popup = document.body.querySelector<HTMLElement>('[data-slot="shortcuts-dialog"]');
      expect(popup).not.toBeNull();

      await act(async () => {
        popup?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });

      expect(Boolean(document.body.querySelector('[data-slot="shortcuts-dialog"]'))).toBe(false);
      expect(document.activeElement === launcher).toBe(true);
    } finally {
      await view.cleanup();
    }
  });
});
