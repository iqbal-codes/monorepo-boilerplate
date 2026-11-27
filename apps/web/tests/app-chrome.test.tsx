import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

class TestHTMLElement {
  public readonly isContentEditable: boolean;
  private readonly selectorMatches: ReadonlySet<string>;

  constructor({
    isContentEditable = false,
    selectorMatches = [],
  }: { isContentEditable?: boolean; selectorMatches?: string[] } = {}) {
    this.isContentEditable = isContentEditable;
    this.selectorMatches = new Set(selectorMatches);
  }

  closest(selector: string): TestHTMLElement | null {
    for (const token of this.selectorMatches) {
      if (selector.includes(token)) {
        return this;
      }
    }
    return null;
  }
}

const previousHTMLElement = globalThis.HTMLElement;
Object.assign(globalThis, { HTMLElement: TestHTMLElement });

const { isEditableTarget, isShortcutsHelpKey } = await import("../src/lib/command-shortcut");

afterAll(() => {
  globalThis.HTMLElement = previousHTMLElement;
});

const APP_SHELL_SOURCE = readFileSync(
  resolve(import.meta.dir, "../src/components/app-shell.tsx"),
  "utf8",
);
const APP_TOPBAR_SOURCE = readFileSync(
  resolve(import.meta.dir, "../src/components/app-topbar.tsx"),
  "utf8",
);
const COMMAND_CENTER_SOURCE = readFileSync(
  resolve(import.meta.dir, "../src/components/command-center.tsx"),
  "utf8",
);
const CUSTOMER_DRAWER_SOURCE = readFileSync(
  resolve(import.meta.dir, "../src/components/customers/customer-form-drawer.tsx"),
  "utf8",
);

describe("Keyboard shortcut guards", () => {
  test("isShortcutsHelpKey triggers on '?' outside editable elements and ignores inputs/textareas/contenteditable", () => {
    const button = new TestHTMLElement() as unknown as EventTarget;
    const input = new TestHTMLElement({ selectorMatches: ["input"] }) as unknown as EventTarget;
    const textarea = new TestHTMLElement({
      selectorMatches: ["textarea"],
    }) as unknown as EventTarget;
    const editableDiv = new TestHTMLElement({ isContentEditable: true }) as unknown as EventTarget;

    expect(isEditableTarget(button)).toBe(false);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(editableDiv)).toBe(true);

    const makeQuestionEvent = (target: EventTarget) =>
      ({
        key: "?",
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        isComposing: false,
        target,
      }) as unknown as KeyboardEvent;

    expect(isShortcutsHelpKey(makeQuestionEvent(button))).toBe(true);
    expect(isShortcutsHelpKey(makeQuestionEvent(input))).toBe(false);
    expect(isShortcutsHelpKey(makeQuestionEvent(textarea))).toBe(false);
    expect(isShortcutsHelpKey(makeQuestionEvent(editableDiv))).toBe(false);
  });
});

describe("App Shell & CustomerFormDrawer wiring", () => {
  test("AppShell mounts SystemBanner slot inside SidebarInset above AppTopbar and mounts ShortcutsDialog", () => {
    const insetIndex = APP_SHELL_SOURCE.indexOf("<SidebarInset");
    const bannerIndex = APP_SHELL_SOURCE.indexOf("<AppSystemBanners");
    const topbarIndex = APP_SHELL_SOURCE.indexOf("<AppTopbar");

    expect(insetIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeGreaterThan(insetIndex);
    expect(topbarIndex).toBeGreaterThan(bannerIndex);
    expect(APP_SHELL_SOURCE).toContain("ShortcutsDialog");
    expect(APP_SHELL_SOURCE).toContain("isShortcutsHelpKey");
  });

  test("AppTopbar wires NotificationCenter beside theme toggle without fetching", () => {
    expect(APP_TOPBAR_SOURCE).toContain("NotificationCenter");
    expect(APP_TOPBAR_SOURCE).not.toContain("fetch(");
    expect(APP_TOPBAR_SOURCE).not.toContain("useQuery");
  });

  test("CommandCenter provides a Keyboard shortcuts entry", () => {
    expect(COMMAND_CENTER_SOURCE).toContain("Keyboard shortcuts");
    expect(COMMAND_CENTER_SOURCE).toContain("onOpenShortcuts");
  });

  test("CustomerFormDrawer wires UnsavedChangesGuard with TanStack Router useBlocker and resets form on save", () => {
    expect(CUSTOMER_DRAWER_SOURCE).toContain("UnsavedChangesGuard");
    expect(CUSTOMER_DRAWER_SOURCE).toContain("useBlocker");
    expect(CUSTOMER_DRAWER_SOURCE).toContain("form.reset");
  });
});
