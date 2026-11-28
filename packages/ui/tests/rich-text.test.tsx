import { afterAll, describe, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/toolbar", import.meta.dir)));

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
  "Text",
  "Range",
  "Selection",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "InputEvent",
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
  Text: win.Text,
  Range: win.Range,
  Selection: win.Selection,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  PointerEvent: win.PointerEvent,
  KeyboardEvent: win.KeyboardEvent,
  InputEvent: win.InputEvent,
  MutationObserver: win.MutationObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Polyfill happy-dom elements for ProseMirror coordinate queries if absent
if (!win.HTMLElement.prototype.getClientRects) {
  win.HTMLElement.prototype.getClientRects = () =>
    [] as unknown as ReturnType<HTMLElement["getClientRects"]>;
}
if (!win.Range.prototype.getClientRects) {
  win.Range.prototype.getClientRects = () => [] as unknown as ReturnType<Range["getClientRects"]>;
}
if (!win.Range.prototype.getBoundingClientRect) {
  win.Range.prototype.getBoundingClientRect = () => new win.DOMRect(0, 0, 0, 0);
}

const { createRoot } = await import("react-dom/client");
const { Form, UnsavedChangesGuard, useAppForm } = await import("../src/components/form");
const richTextModule = await import("../src/components/rich-text");
const {
  DEFAULT_SLASH_COMMANDS,
  EMPTY_RICH_TEXT_DOC,
  RichTextEditor,
  RichTextField,
  RichTextViewer,
  filterSlashCommands,
  isRichTextEmpty,
  toMarkdown,
  toPlainText,
} = richTextModule;

type JSONContent = Parameters<typeof toPlainText>[0];

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
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
      await new Promise((resolve) => setTimeout(resolve, 10));
      host.remove();
    },
  };
}

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const SAMPLE_DOC: NonNullable<JSONContent> = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Release Notes" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: ", " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: ", " },
        { type: "text", text: "struck", marks: [{ type: "strike" }] },
        { type: "text", text: ", " },
        { type: "text", text: "inlineCode()", marks: [{ type: "code" }] },
        { type: "text", text: ", and " },
        {
          type: "text",
          text: "docs",
          marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }],
        },
        { type: "text", text: "." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "First bullet" }] },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Nested bullet" }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Second bullet" }] }],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Step three" }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Step four" }] }],
        },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted line" }] }],
    },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const x = 1;" }],
    },
    { type: "horizontalRule" },
  ],
};

describe("Subpath isolation (TC-02, TC-03)", () => {
  test("packages/ui/package.json exposes ./components/rich-text subpath export", () => {
    const pkgPath = resolve(import.meta.dir, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      exports?: Record<string, string>;
    };
    expect(pkg.exports?.["./components/rich-text"]).toBe("./src/components/rich-text/index.ts");
  });

  test("importing components/form never imports @tiptap/* or rich-text", async () => {
    const formDir = resolve(import.meta.dir, "../src/components/form");
    const formFiles = collectTsFiles(formDir);
    for (const file of formFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("@tiptap/");
      expect(content).not.toContain("rich-text");
    }

    const result = await Bun.build({
      entrypoints: [resolve(formDir, "index.ts")],
      write: false,
      external: [
        "react",
        "react-dom",
        "@tanstack/react-form",
        "@base-ui/react",
        "lucide-react",
        "cn",
        "libphonenumber-js",
        "date-fns",
        "react-day-picker",
        "input-otp",
      ],
    });
    expect(result.success).toBe(true);
    const bundledCode = await result.outputs[0]!.text();
    expect(bundledCode).not.toContain("@tiptap");
    expect(bundledCode).not.toContain("prosemirror");
  });
});

describe("Serialization: toPlainText & toMarkdown (TC-04)", () => {
  test("handles empty, null, and undefined documents deterministically", () => {
    expect(toPlainText(null)).toBe("");
    expect(toPlainText(undefined)).toBe("");
    expect(toPlainText(EMPTY_RICH_TEXT_DOC)).toBe("");
    expect(toMarkdown(null)).toBe("");
    expect(toMarkdown(undefined)).toBe("");
    expect(toMarkdown(EMPTY_RICH_TEXT_DOC)).toBe("");
    expect(isRichTextEmpty(EMPTY_RICH_TEXT_DOC)).toBe(true);
    expect(isRichTextEmpty(SAMPLE_DOC)).toBe(false);
  });

  test("toPlainText converts headings, lists, links, code blocks, and inline marks", () => {
    expect(toPlainText(SAMPLE_DOC)).toBe(
      [
        "Release Notes",
        "Hello bold, italic, struck, inlineCode(), and docs.",
        "- First bullet\n  - Nested bullet\n- Second bullet",
        "3. Step three\n4. Step four",
        "Quoted line",
        "const x = 1;",
      ].join("\n\n"),
    );
  });

  test("toMarkdown converts headings, lists, links, code blocks, and inline marks deterministically", () => {
    expect(toMarkdown(SAMPLE_DOC)).toBe(
      [
        "# Release Notes",
        "Hello **bold**, *italic*, ~~struck~~, `inlineCode()`, and [docs](https://example.com/docs).",
        "- First bullet\n  - Nested bullet\n- Second bullet",
        "3. Step three\n4. Step four",
        "> Quoted line",
        "```ts\nconst x = 1;\n```",
        "---",
      ].join("\n\n"),
    );
  });

  test("toMarkdown strips unsafe link protocols and handles combined marks cleanly", () => {
    const doc: NonNullable<JSONContent> = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Click",
              marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "Safe",
              marks: [
                { type: "bold" },
                { type: "italic" },
                { type: "link", attrs: { href: "https://example.com" } },
              ],
            },
          ],
        },
      ],
    };

    expect(toMarkdown(doc)).toBe("**Click** [***Safe***](https://example.com)");
  });
});

describe("RichTextViewer (TC-01)", () => {
  test("renders structured JSONContent semantically without raw HTML injection", () => {
    const html = renderToStaticMarkup(<RichTextViewer value={SAMPLE_DOC} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Release Notes");
    expect(html).toContain("<strong");
    expect(html).toContain("<em");
    expect(html).toContain("<s");
    expect(html).toContain("<code");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<pre");
    expect(html).toContain("<hr");
  });

  test("escapes literal HTML strings and rejects javascript: links", () => {
    const malicious: NonNullable<JSONContent> = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "<script>alert(1)</script>" },
            {
              type: "text",
              text: "bad link",
              marks: [{ type: "link", attrs: { href: "javascript:alert(2)" } }],
            },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<RichTextViewer value={malicious} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("javascript:");
  });

  test("renders emptyFallback when document is empty", () => {
    const html = renderToStaticMarkup(
      <RichTextViewer value={EMPTY_RICH_TEXT_DOC} emptyFallback="Nothing written yet" />,
    );
    expect(html).toContain("Nothing written yet");
  });
});

describe("RichTextEditor & RichTextField (TC-01)", () => {
  test("renders controlled JSONContent, toolbar ARIA semantics, and handles disabled state", async () => {
    const updates: Array<NonNullable<JSONContent>> = [];
    const { host, rerender, cleanup } = await renderInDom(
      <RichTextEditor
        aria-label="Project brief"
        value={SAMPLE_DOC}
        onChange={(next) => updates.push(next)}
      />,
    );

    const toolbar = host.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.getAttribute("aria-label")).toBe("Formatting");

    const boldButton = host.querySelector('button[aria-label="Bold"]');
    expect(boldButton).not.toBeNull();
    expect(boldButton?.getAttribute("aria-pressed")).toBe("false");

    const undoButton = host.querySelector('button[aria-label="Undo"]');
    expect(undoButton).not.toBeNull();
    expect(undoButton?.hasAttribute("aria-pressed")).toBe(false);

    const editorEl = host.querySelector("[contenteditable]");
    expect(editorEl).not.toBeNull();
    expect(editorEl?.getAttribute("contenteditable")).toBe("true");
    expect(editorEl?.textContent).toContain("Release Notes");

    await rerender(
      <RichTextEditor
        aria-label="Project brief"
        value={EMPTY_RICH_TEXT_DOC}
        placeholder="Write notes…"
        onChange={(next) => updates.push(next)}
      />,
    );

    const emptyEditor = host.querySelector("[contenteditable]");
    expect(emptyEditor?.querySelector("p.is-editor-empty")?.getAttribute("data-placeholder")).toBe(
      "Write notes…",
    );

    await rerender(
      <RichTextEditor
        aria-label="Project brief"
        value={EMPTY_RICH_TEXT_DOC}
        placeholder="Write notes…"
        disabled
        onChange={(next) => updates.push(next)}
      />,
    );

    const disabledEditor = host.querySelector("[contenteditable]");
    expect(disabledEditor?.getAttribute("contenteditable")).toBe("false");
    expect(disabledEditor?.getAttribute("aria-disabled")).toBe("true");
    expect(disabledEditor?.getAttribute("tabindex")).toBe("-1");

    await rerender(
      <RichTextEditor
        aria-label="Project brief"
        value={SAMPLE_DOC}
        readOnly
        aria-invalid
        onChange={(next) => updates.push(next)}
      />,
    );

    const readOnlyEditor = host.querySelector("[contenteditable]");
    expect(readOnlyEditor?.getAttribute("contenteditable")).toBe("false");
    expect(readOnlyEditor?.getAttribute("aria-readonly")).toBe("true");
    expect(readOnlyEditor?.getAttribute("aria-invalid")).toBe("true");
    expect(readOnlyEditor?.getAttribute("tabindex")).toBe("0");

    await cleanup();
  });

  test("RichTextLinkPopover validates and normalizes URLs without native type=url blocking", async () => {
    const { host, cleanup } = await renderInDom(
      <RichTextEditor aria-label="Link test" value={SAMPLE_DOC} />,
    );

    const linkButton = host.querySelector('button[aria-label="Link"]') as HTMLButtonElement | null;
    expect(linkButton).not.toBeNull();
    await act(async () => {
      linkButton?.click();
    });

    const urlInput = document.body.querySelector<HTMLInputElement>('input[inputmode="url"]');
    expect(urlInput).not.toBeNull();
    expect(urlInput?.type).toBe("text");

    const form = urlInput?.closest("form");
    expect(form?.hasAttribute("novalidate")).toBe(true);

    const setUrl = (val: string) => {
      if (!urlInput) return;
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
      setter?.call(urlInput, val);
      urlInput.dispatchEvent(new win.Event("input", { bubbles: true }));
      urlInput.dispatchEvent(new win.Event("change", { bubbles: true }));
    };

    // Invalid protocol shows custom inline error
    await act(async () => {
      setUrl("javascript:alert(1)");
    });
    await act(async () => {
      form?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.body.textContent).toContain("Enter a valid http(s), mailto, or relative URL.");

    // Relative path passes validation and closes popover
    await act(async () => {
      setUrl("/docs/getting-started");
    });
    await act(async () => {
      form?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(document.body.querySelector('input[inputmode="url"]')).toBeNull();

    await cleanup();
  });

  test("RichTextField integrates with useAppForm, shows validation errors, and updates dirty state", async () => {
    const validateSummary = ({ value }: { value: { summary: JSONContent } }) => {
      const length = toPlainText(value.summary).trim().length;
      return length < 10 ? { fields: { summary: "Enter at least 10 characters." } } : undefined;
    };

    let latestDirty = false;

    function FieldHarness() {
      const form = useAppForm({
        defaultValues: {
          summary: EMPTY_RICH_TEXT_DOC as JSONContent,
        },
        validators: {
          onChange: validateSummary,
          onSubmit: validateSummary,
        },
      });

      return (
        <Form form={form}>
          <form.Subscribe selector={(s) => s.isDirty}>
            {(isDirty) => {
              latestDirty = isDirty;
              return <span data-dirty={String(isDirty)} />;
            }}
          </form.Subscribe>
          <form.AppField name="summary">
            {() => (
              <RichTextField
                label="Executive summary"
                description="Minimum 10 plain-text characters."
                required
              />
            )}
          </form.AppField>
          <form.SubmitButton>Save</form.SubmitButton>
        </Form>
      );
    }

    const { host, cleanup } = await renderInDom(<FieldHarness />);
    expect(host.textContent).toContain("Executive summary");
    expect(latestDirty).toBe(false);

    // Submit empty form to trigger validation error
    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    expect(submitBtn).not.toBeNull();
    await act(async () => {
      submitBtn?.click();
    });

    expect(host.textContent).toContain("Enter at least 10 characters.");

    await cleanup();
  });

  test("clearing a document ending with a codeBlock via setFieldValue stays cleared and shows validation error on submit", async () => {
    const docWithTrailingCodeBlock: NonNullable<JSONContent> = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Quarterly Release Brief" }],
        },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };

    const validateDoc = ({ value }: { value: { document: JSONContent } }) => {
      const length = toPlainText(value.document).trim().length;
      return length < 12
        ? { fields: { document: "Enter at least 12 plain-text characters." } }
        : undefined;
    };

    function ClearHarness() {
      const form = useAppForm({
        defaultValues: {
          document: docWithTrailingCodeBlock as JSONContent,
        },
        validators: {
          onChange: validateDoc,
          onSubmit: validateDoc,
        },
      });

      return (
        <div>
          <button
            type="button"
            data-testid="clear-btn"
            onClick={() => form.setFieldValue("document", EMPTY_RICH_TEXT_DOC)}
          >
            Clear document
          </button>
          <Form form={form}>
            <form.AppField name="document">
              {() => <RichTextField label="Release brief" required />}
            </form.AppField>
            <form.SubmitButton>Validate</form.SubmitButton>
          </Form>
          <form.Subscribe selector={(s) => s.values.document}>
            {(doc) => <RichTextViewer value={doc} emptyFallback="Document is empty" />}
          </form.Subscribe>
        </div>
      );
    }

    const { host, cleanup } = await renderInDom(<ClearHarness />);
    expect(host.textContent).toContain("Quarterly Release Brief");

    const clearBtn = host.querySelector('[data-testid="clear-btn"]') as HTMLButtonElement | null;
    await act(async () => {
      clearBtn?.click();
    });

    expect(host.textContent).toContain("Document is empty");
    expect(host.querySelector('[data-slot="rich-text-editor"]')?.textContent).not.toContain(
      "Quarterly Release Brief",
    );

    const submitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    await act(async () => {
      submitBtn?.click();
    });

    expect(host.textContent).toContain("Enter at least 12 plain-text characters.");
    expect(host.querySelector('[data-slot="rich-text-editor"]')?.getAttribute("data-invalid")).toBe(
      "true",
    );

    await cleanup();
  });

  test("RichTextEditor emits JSONContent onChange when toggling toolbar formatting and pairs with UnsavedChangesGuard", async () => {
    const emitted: Array<NonNullable<JSONContent>> = [];

    function GuardedRichTextHarness() {
      const form = useAppForm({
        defaultValues: {
          body: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Initial copy" }] }],
          } as JSONContent,
        },
      });

      return (
        <UnsavedChangesGuard form={form} title="Discard edits?">
          {({ isDirty, requestClose }) => (
            <Form form={form}>
              <span data-testid="dirty-flag">{String(isDirty)}</span>
              <button type="button" data-testid="leave-btn" onClick={requestClose}>
                Leave
              </button>
              <form.AppField name="body">
                {(field) => (
                  <RichTextEditor
                    aria-label="Guarded editor"
                    value={field.state.value}
                    onChange={(next) => {
                      emitted.push(next);
                      field.handleChange(next);
                    }}
                  />
                )}
              </form.AppField>
            </Form>
          )}
        </UnsavedChangesGuard>
      );
    }

    const { host, cleanup } = await renderInDom(<GuardedRichTextHarness />);
    expect(host.querySelector('[data-testid="dirty-flag"]')?.textContent).toBe("false");

    const h1Button = host.querySelector(
      'button[aria-label="Heading 1"]',
    ) as HTMLButtonElement | null;
    expect(h1Button).not.toBeNull();
    await act(async () => {
      h1Button?.click();
    });

    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.at(-1)?.content?.[0]?.type).toBe("heading");
    expect(host.querySelector('[data-testid="dirty-flag"]')?.textContent).toBe("true");

    const leaveBtn = host.querySelector('[data-testid="leave-btn"]') as HTMLButtonElement | null;
    await act(async () => {
      leaveBtn?.click();
    });

    expect(document.body.textContent).toContain("Discard edits?");

    await cleanup();
  });

  test("filterSlashCommands matches labels, descriptions, and keywords", () => {
    expect(filterSlashCommands(DEFAULT_SLASH_COMMANDS, "").length).toBe(
      DEFAULT_SLASH_COMMANDS.length,
    );
    expect(filterSlashCommands(DEFAULT_SLASH_COMMANDS, "h2").map((item) => item.id)).toEqual([
      "heading-2",
    ]);
    expect(filterSlashCommands(DEFAULT_SLASH_COMMANDS, "quote").map((item) => item.id)).toEqual([
      "blockquote",
    ]);
    expect(filterSlashCommands(DEFAULT_SLASH_COMMANDS, "nonexistent-block")).toEqual([]);
  });
});
