import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/field", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
const scrollIntoViewCalls: HTMLElement[] = [];
win.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  scrollIntoViewCalls.push(this as unknown as HTMLElement);
};
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
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
  "ClipboardEvent",
  "DataTransfer",
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
  ClipboardEvent: win.ClipboardEvent,
  DataTransfer: win.DataTransfer,
  MutationObserver: win.MutationObserver,
  ResizeObserver: MockResizeObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { createRoot } = await import("react-dom/client");
const { TagInput } = await import("../src/components/tag-input");
const { Form, useAppForm } = await import("../src/components/form");

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

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
}

describe("TagInput", () => {
  test("supports Enter, comma, IME guard, paste-split, deduplication, maxTags, and Backspace removal", async () => {
    function Harness() {
      const [tags, setTags] = React.useState<string[]>(["vip"]);
      return (
        <TagInput
          aria-label="Customer tags"
          value={tags}
          onValueChange={setTags}
          maxTags={4}
          suggestions={["enterprise", "onboarding", "renewal", "VIP"]}
        />
      );
    }

    const view = await renderInDom(<Harness />);

    try {
      const input = view.host.querySelector<HTMLInputElement>("input")!;

      // IME-composing Enter should not commit a tag.
      await act(async () => {
        setInputValue(input, "draft");
        input.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }),
        );
      });
      expect(view.host.querySelectorAll("[data-tag-pill]").length).toBe(1);

      // Standard Enter commits trimmed tag and dedupes case-insensitively.
      await act(async () => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(
        [...view.host.querySelectorAll("[data-tag-pill]")].map((el) => el.textContent?.trim()),
      ).toEqual(["vip", "draft"]);
      expect(input.value).toBe("");

      // Duplicate case-variant is ignored.
      await act(async () => {
        setInputValue(input, "VIP");
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(view.host.querySelectorAll("[data-tag-pill]").length).toBe(2);

      // Paste-split trims, dedupes, and respects maxTags (4).
      await act(async () => {
        const dt = new win.DataTransfer();
        dt.setData("text/plain", " enterprise , vip, renewal , extra ");
        input.dispatchEvent(
          new win.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      });
      expect(
        [...view.host.querySelectorAll("[data-tag-pill]")].map((el) => el.textContent?.trim()),
      ).toEqual(["vip", "draft", "enterprise", "renewal"]);

      // Backspace on empty input removes last tag.
      await act(async () => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      });
      expect(
        [...view.host.querySelectorAll("[data-tag-pill]")].map((el) => el.textContent?.trim()),
      ).toEqual(["vip", "draft", "enterprise"]);

      // Remove button removes specific tag.
      const removeDraft = view.host.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove draft"]',
      );
      await act(async () => {
        removeDraft?.click();
      });
      expect(
        [...view.host.querySelectorAll("[data-tag-pill]")].map((el) => el.textContent?.trim()),
      ).toEqual(["vip", "enterprise"]);
    } finally {
      await view.cleanup();
    }
  });

  test("filters suggestions and supports keyboard ArrowDown + Enter selection", async () => {
    const changes: string[][] = [];
    const view = await renderInDom(
      <TagInput
        aria-label="Tags"
        value={["vip"]}
        onValueChange={(next) => changes.push(next)}
        suggestions={["enterprise", "onboarding", "vip"]}
      />,
    );

    try {
      const input = view.host.querySelector<HTMLInputElement>("input")!;
      await act(async () => {
        input.focus();
        setInputValue(input, "onb");
      });

      const options = [...document.body.querySelectorAll('[role="option"]')];
      expect(options.map((o) => o.textContent)).toEqual(["onboarding"]);

      await act(async () => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(changes).toEqual([["vip", "onboarding"]]);
    } finally {
      await view.cleanup();
    }
  });

  test("scrolls highlighted option into view when navigating past visible options and keeps tags on Escape", async () => {
    scrollIntoViewCalls.length = 0;
    const suggestions = Array.from(
      { length: 20 },
      (_, index) => `tag-${String(index + 1).padStart(2, "0")}`,
    );
    const changes: string[][] = [];
    const inputValues: string[] = [];

    const view = await renderInDom(
      <TagInput
        aria-label="Many tags"
        value={["initial"]}
        onValueChange={(next) => changes.push(next)}
        onInputValueChange={(next) => inputValues.push(next)}
        suggestions={suggestions}
      />,
    );

    try {
      const input = view.host.querySelector<HTMLInputElement>("input")!;
      await act(async () => {
        input.focus();
      });

      // Navigate past the visible window (15 ArrowDown presses to tag-15).
      for (let step = 0; step < 15; step += 1) {
        await act(async () => {
          input.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
          );
        });
      }

      const highlighted = document.body.querySelector<HTMLElement>(
        '[role="option"][data-highlighted]',
      );
      expect(highlighted?.textContent).toBe("tag-15");
      expect(scrollIntoViewCalls.some((el) => el.textContent === "tag-15")).toBe(true);

      // Select highlighted tag-15 with Enter.
      await act(async () => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(changes).toEqual([["initial", "tag-15"]]);

      // Pressing Escape while menu is closed must not clear existing tags.
      await act(async () => {
        setInputValue(input, "unsaved-draft");
      });
      expect(inputValues.at(-1)).toBe("unsaved-draft");
      await act(async () => {
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(changes).toEqual([["initial", "tag-15"]]);
    } finally {
      await view.cleanup();
    }
  });
});

describe("TagField", () => {
  test("binds to TanStack Form via useAppForm and surfaces validation feedback", async () => {
    const submitted: Array<{ tags: string[] }> = [];

    function TagFormHarness() {
      const form = useAppForm({
        defaultValues: { tags: [] as string[] },
        validators: {
          onSubmit: ({ value }) =>
            value.tags.length === 0 ? { fields: { tags: "Add at least one tag." } } : undefined,
        },
        onSubmit: ({ value }) => {
          submitted.push(value);
        },
      });

      return (
        <Form form={form}>
          <form.AppField name="tags">
            {(field) => <field.TagField label="Tags" suggestions={["vip", "beta"]} />}
          </form.AppField>
          <button type="submit">Save</button>
        </Form>
      );
    }

    const view = await renderInDom(<TagFormHarness />);

    try {
      const submitBtn = view.host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      await act(async () => {
        submitBtn.click();
      });
      expect(view.host.textContent).toContain("Add at least one tag.");
      expect(submitted).toEqual([]);

      const input = view.host.querySelector<HTMLInputElement>("input")!;
      await act(async () => {
        setInputValue(input, "vip");
        input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await act(async () => {
        submitBtn.click();
      });
      expect(submitted).toEqual([{ tags: ["vip"] }]);
    } finally {
      await view.cleanup();
    }
  });
});

describe("UploadField clear/remove affordance", () => {
  test("clears an existing stored asset path when Remove avatar is clicked", async () => {
    const submitted: Array<{ avatarUrl: string }> = [];

    function AvatarFormHarness() {
      const form = useAppForm({
        defaultValues: { avatarUrl: "/uploads/existing.png" },
        onSubmit: ({ value }) => {
          submitted.push(value);
        },
      });

      return (
        <Form form={form}>
          <form.AppField name="avatarUrl">
            {(field) => (
              <field.UploadField
                label="Avatar"
                removeLabel="Remove avatar"
                upload={async () => ({ url: "/uploads/new.png" })}
                resolvePreviewUrl={(path) => `http://localhost:3000${path}`}
              />
            )}
          </form.AppField>
          <button type="submit">Save</button>
        </Form>
      );
    }

    const view = await renderInDom(<AvatarFormHarness />);

    try {
      expect(view.host.querySelector("img")?.getAttribute("src")).toBe(
        "http://localhost:3000/uploads/existing.png",
      );
      const removeBtn = view.host.querySelector<HTMLButtonElement>("button");
      expect(removeBtn?.textContent).toContain("Remove avatar");

      await act(async () => {
        removeBtn?.click();
      });

      expect(view.host.querySelector("img")).toBeNull();
      const submitBtn = view.host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      await act(async () => {
        submitBtn.click();
      });
      expect(submitted).toEqual([{ avatarUrl: "" }]);
    } finally {
      await view.cleanup();
    }
  });
});
