import { describe, expect, test } from "bun:test";
import { act } from "react";

import { getTestWindow, renderWithQuery, useChromeDomHarness } from "./dom-test-harness";

const { AppShell } = await import("../src/components/app-shell");

describe("AppShell Command Center -> ShortcutsDialog focus handoff", () => {
  useChromeDomHarness();

  test("restores focus to sidebar Command Center launcher when Escape closes ShortcutsDialog", async () => {
    const win = getTestWindow();
    const view = await renderWithQuery(
      <AppShell>
        <div>Shell content</div>
      </AppShell>,
    );

    try {
      const sidebarLauncher = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Search or jump to"]',
      );
      expect(sidebarLauncher).not.toBeNull();

      sidebarLauncher?.focus();
      await act(async () => {
        sidebarLauncher?.click();
      });

      // Reissuing Ctrl+K while Command Center is already open must not overwrite the launcher target.
      await act(async () => {
        window.dispatchEvent(
          new win.KeyboardEvent("keydown", {
            key: "k",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      const shortcutsCmdItem = Array.from(
        document.body.querySelectorAll<HTMLElement>('[data-slot="command-item"]'),
      ).find((el) => el.textContent?.includes("Keyboard shortcuts"));
      expect(shortcutsCmdItem).toBeDefined();

      await act(async () => {
        shortcutsCmdItem?.click();
      });

      const shortcutsPopup = document.body.querySelector<HTMLElement>(
        '[data-slot="shortcuts-dialog"]',
      );
      expect(Boolean(shortcutsPopup)).toBe(true);

      await act(async () => {
        shortcutsPopup?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
        await Promise.resolve();
      });

      expect(Boolean(document.body.querySelector('[data-slot="shortcuts-dialog"]'))).toBe(false);
      expect(document.activeElement === sidebarLauncher).toBe(true);
    } finally {
      await view.cleanup();
    }
  });

  test("opens AppShortcutsDialog on '?' outside editable fields and ignores '?' inside inputs", async () => {
    const win = getTestWindow();
    const view = await renderWithQuery(
      <AppShell>
        <div>
          <button type="button" data-testid="non-editable-btn">
            Action
          </button>
          <input type="text" aria-label="Filter input" />
        </div>
      </AppShell>,
    );

    try {
      const input = view.host.querySelector<HTMLInputElement>('input[aria-label="Filter input"]');
      const btn = view.host.querySelector<HTMLButtonElement>('[data-testid="non-editable-btn"]');
      expect(input).not.toBeNull();
      expect(btn).not.toBeNull();

      input?.focus();
      await act(async () => {
        input?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true }),
        );
      });
      expect(Boolean(document.body.querySelector('[data-slot="shortcuts-dialog"]'))).toBe(false);

      btn?.focus();
      await act(async () => {
        btn?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true }),
        );
      });
      const shortcutsPopup = document.body.querySelector<HTMLElement>(
        '[data-slot="shortcuts-dialog"]',
      );
      expect(Boolean(shortcutsPopup)).toBe(true);

      await act(async () => {
        shortcutsPopup?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
        await Promise.resolve();
      });
      expect(Boolean(document.body.querySelector('[data-slot="shortcuts-dialog"]'))).toBe(false);
      expect(document.activeElement === btn).toBe(true);
    } finally {
      await view.cleanup();
    }
  });
});
