import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
const { SettingsDialog, SettingsGroup, SettingsRow, SettingsSection } =
  await import("../src/components/settings-dialog");

afterAll(() => {
  for (const key of DOM_KEYS) {
    (globalThis as Record<string, unknown>)[key] = previousGlobals[key];
  }
  win.close();
});

const SAMPLE_GROUPS = [
  {
    id: "prefs",
    label: "Preferences",
    items: [
      {
        id: "general",
        label: "General",
        description: "Workspace defaults",
        keywords: ["tables", "density"],
      },
      {
        id: "appearance",
        label: "Appearance",
        description: "Theme and color mode",
        keywords: ["dark", "light"],
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "profile",
        label: "Profile",
        description: "Name and email",
      },
    ],
  },
] as const;

async function renderInDom(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });

  return {
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

describe("SettingsDialog", () => {
  test("renders mobile fullscreen and desktop split classes with scroll containment", async () => {
    const view = await renderInDom(
      <SettingsDialog open onOpenChange={() => {}} groups={SAMPLE_GROUPS} activeId="general">
        <div>General content</div>
      </SettingsDialog>,
    );

    try {
      const popup = document.body.querySelector('[data-slot="settings-dialog"]');
      const overlay = document.body.querySelector('[data-slot="dialog-overlay"]');
      const body = document.body.querySelector('[data-slot="settings-dialog-body"]');

      expect(popup).not.toBeNull();
      expect(popup?.className).toContain("max-md:inset-0");
      expect(popup?.className).toContain("max-md:h-dvh");
      expect(popup?.className).toContain("max-md:w-full");
      expect(popup?.className).toContain("md:max-w-3xl");
      expect(popup?.className).toContain("overscroll-contain");
      expect(overlay?.className).toContain("overscroll-contain");
      expect(body?.className).toContain("overscroll-contain");
      expect(body?.textContent).toContain("General content");
    } finally {
      await view.cleanup();
    }
  });

  test("supports two-layer mobile navigation from menu list to detail and back", async () => {
    function Harness({ open }: { open: boolean }) {
      const [activeId, setActiveId] = React.useState("general");
      return (
        <SettingsDialog
          open={open}
          onOpenChange={() => {}}
          groups={SAMPLE_GROUPS}
          activeId={activeId}
          onActiveIdChange={setActiveId}
        >
          <div data-testid="panel-content">{`Active: ${activeId}`}</div>
        </SettingsDialog>
      );
    }

    const view = await renderInDom(<Harness open />);

    try {
      const popup = document.body.querySelector('[data-slot="settings-dialog"]');
      const sidebar = document.body.querySelector('[data-slot="settings-dialog-sidebar"]');
      const panel = document.body.querySelector('[data-slot="settings-dialog-panel"]');

      expect(popup?.getAttribute("data-mobile-view")).toBe("menu");
      expect(sidebar?.className).not.toContain("max-md:hidden");
      expect(panel?.className).toContain("max-md:hidden");

      const appearanceButton = Array.from(
        document.body.querySelectorAll('[data-slot="settings-nav-item"]'),
      ).find((el) => el.textContent?.includes("Appearance")) as HTMLButtonElement | undefined;
      expect(appearanceButton).toBeDefined();

      await act(async () => {
        appearanceButton?.click();
      });

      expect(popup?.getAttribute("data-mobile-view")).toBe("detail");
      expect(sidebar?.className).toContain("max-md:hidden");
      expect(panel?.className).not.toContain("max-md:hidden");
      expect(panel?.textContent).toContain("Active: appearance");

      const backButton = document.body.querySelector(
        'button[aria-label="Back to Settings"]',
      ) as HTMLButtonElement | null;
      expect(backButton).not.toBeNull();

      await act(async () => {
        backButton?.click();
      });

      expect(popup?.getAttribute("data-mobile-view")).toBe("menu");
      expect(sidebar?.className).not.toContain("max-md:hidden");
      expect(panel?.className).toContain("max-md:hidden");

      // Re-opening resets mobile view back to the Layer 1 menu.
      await act(async () => {
        appearanceButton?.click();
      });
      expect(popup?.getAttribute("data-mobile-view")).toBe("detail");

      await view.rerender(<Harness open={false} />);
      await view.rerender(<Harness open />);
      const reopenedPopup = document.body.querySelector('[data-slot="settings-dialog"]');
      expect(reopenedPopup?.getAttribute("data-mobile-view")).toBe("menu");
    } finally {
      await view.cleanup();
    }
  });

  test("filters sidebar items by label, description, or keywords and resets on clear", async () => {
    const view = await renderInDom(
      <SettingsDialog open onOpenChange={() => {}} groups={SAMPLE_GROUPS} activeId="general">
        <div>Content</div>
      </SettingsDialog>,
    );

    try {
      const searchInput = document.body.querySelector(
        'input[aria-label="Search settings"]',
      ) as HTMLInputElement | null;
      expect(searchInput).not.toBeNull();

      await act(async () => {
        if (searchInput) setInputValue(searchInput, "dark");
      });

      const matchingItems = document.body.querySelectorAll('[data-slot="settings-nav-item"]');
      expect(matchingItems.length).toBe(1);
      expect(matchingItems[0]?.textContent).toContain("Appearance");

      await act(async () => {
        if (searchInput) setInputValue(searchInput, "nonexistent-setting");
      });
      expect(document.body.querySelectorAll('[data-slot="settings-nav-item"]').length).toBe(0);
      expect(document.body.textContent).toContain("No settings match");

      const clearBtn = document.body.querySelector(
        'button[aria-label="Clear search"]',
      ) as HTMLButtonElement | null;
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn?.click();
      });
      expect(document.body.querySelectorAll('[data-slot="settings-nav-item"]').length).toBe(3);
    } finally {
      await view.cleanup();
    }
  });
});

describe("SettingsSection, SettingsGroup, and SettingsRow", () => {
  test("renders grouped rows with accessible labels and inline layout option", () => {
    const html = renderToStaticMarkup(
      <SettingsSection title="Interface" description="Display preferences.">
        <SettingsGroup>
          <SettingsRow
            inline
            htmlFor="compact-toggle"
            title="Compact density"
            description="Tighter rows."
          >
            <input id="compact-toggle" type="checkbox" />
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>,
    );

    expect(html).toContain('data-slot="settings-section"');
    expect(html).toContain('data-slot="settings-group"');
    expect(html).toContain('data-slot="settings-row"');
    expect(html).toContain('for="compact-toggle"');
    expect(html).toContain("flex-row items-center justify-between");
  });
});
