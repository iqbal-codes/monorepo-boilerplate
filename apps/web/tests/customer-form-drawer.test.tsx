import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react";

import {
  chromeMocks,
  getTestWindow,
  renderWithQuery,
  setInputValue,
  useChromeDomHarness,
} from "./dom-test-harness";

const { CustomerFormDrawer } = await import("../src/components/customers/customer-form-drawer");

describe("CustomerFormDrawer pending save and Escape guard", () => {
  useChromeDomHarness();

  test("rejects Escape while save is pending, retains draft on failure, and restores dirty guard", async () => {
    const win = getTestWindow();
    let rejectCreate!: (error: Error) => void;
    let createStarted = false;
    chromeMocks.createCustomerImpl = () => {
      createStarted = true;
      return new Promise((_resolve, reject) => {
        rejectCreate = reject;
      });
    };

    let closeCalls = 0;
    function DrawerHarness() {
      const [open, setOpen] = React.useState(true);
      return (
        <CustomerFormDrawer
          open={open}
          onOpenChange={(next) => {
            if (!next) closeCalls += 1;
            setOpen(next);
          }}
          customerId={null}
        />
      );
    }

    const view = await renderWithQuery(<DrawerHarness />);
    try {
      const sheet = document.body.querySelector<HTMLElement>('[data-slot="sheet-content"]');
      expect(sheet).not.toBeNull();

      const nameInput = document.body.querySelector<HTMLInputElement>('input[name="name"]');
      const emailInput = document.body.querySelector<HTMLInputElement>('input[name="email"]');
      expect(nameInput).not.toBeNull();
      expect(emailInput).not.toBeNull();

      await act(async () => {
        if (nameInput) setInputValue(nameInput, "Deferred Draft");
        if (emailInput) setInputValue(emailInput, "deferred@example.com");
      });

      const formEl = document.body.querySelector<HTMLFormElement>("form");
      expect(formEl).not.toBeNull();

      await act(async () => {
        formEl?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(createStarted).toBe(true);

      // Attempt Escape while mutation is still pending: Sheet must stay open with draft intact.
      await act(async () => {
        sheet?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });

      expect(closeCalls).toBe(0);
      expect(Boolean(document.body.querySelector('[data-slot="sheet-content"]'))).toBe(true);
      expect(Boolean(document.body.querySelector('[data-slot="alert-dialog-content"]'))).toBe(
        false,
      );
      expect(nameInput?.value).toBe("Deferred Draft");

      // Reject the deferred mutation: error shows, draft stays open and intact.
      await act(async () => {
        rejectCreate(new Error("Email already exists"));
      });

      expect(closeCalls).toBe(0);
      expect(Boolean(document.body.querySelector('[data-slot="sheet-content"]'))).toBe(true);
      expect(document.body.textContent).toContain("Could not save customer");
      expect(nameInput?.value).toBe("Deferred Draft");

      // Subsequent Escape now opens the UnsavedChangesGuard confirmation dialog.
      await act(async () => {
        sheet?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });

      const alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(Boolean(alertDialog)).toBe(true);
      expect(alertDialog?.textContent).toContain("Discard unsaved changes?");
    } finally {
      await view.cleanup();
    }
  });

  test("resets blocked navigation resolver when save succeeds so both drawer and discard prompt close cleanly", async () => {
    const win = getTestWindow();
    let resolveCreate!: (value: unknown) => void;
    chromeMocks.createCustomerImpl = () =>
      new Promise((resolve) => {
        resolveCreate = resolve;
      });

    let blocked = false;
    let resetCalls = 0;
    let proceedCalls = 0;
    chromeMocks.blockerImpl = () =>
      blocked
        ? {
            status: "blocked",
            proceed: () => {
              proceedCalls += 1;
              blocked = false;
            },
            reset: () => {
              resetCalls += 1;
              blocked = false;
            },
          }
        : { status: "idle" };

    function DrawerBlockerHarness() {
      const [open, setOpen] = React.useState(true);
      const [, setTick] = React.useState(0);
      return (
        <div>
          <button
            type="button"
            data-testid="trigger-back"
            onClick={() => {
              blocked = true;
              setTick((n) => n + 1);
            }}
          >
            Back
          </button>
          <CustomerFormDrawer open={open} onOpenChange={setOpen} customerId={null} />
        </div>
      );
    }

    const view = await renderWithQuery(<DrawerBlockerHarness />);
    try {
      const nameInput = document.body.querySelector<HTMLInputElement>('input[name="name"]');
      const emailInput = document.body.querySelector<HTMLInputElement>('input[name="email"]');
      await act(async () => {
        if (nameInput) setInputValue(nameInput, "Save During Back");
        if (emailInput) setInputValue(emailInput, "save-back@example.com");
      });

      const formEl = document.body.querySelector<HTMLFormElement>("form");
      await act(async () => {
        formEl?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
      });

      // Simulate pressing browser Back while create is pending.
      await act(async () => {
        view.host.querySelector<HTMLButtonElement>('[data-testid="trigger-back"]')?.click();
      });
      const alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(Boolean(alertDialog)).toBe(true);

      // While save is in flight, Discard changes must be disabled and must not proceed/reset,
      // while Keep editing remains enabled.
      const discardBtn = Array.from(alertDialog?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Discard changes"),
      ) as HTMLButtonElement | undefined;
      const keepBtn = Array.from(alertDialog?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      ) as HTMLButtonElement | undefined;
      expect(discardBtn?.disabled).toBe(true);
      expect(keepBtn?.disabled).toBe(false);
      await act(async () => {
        discardBtn?.click();
      });
      expect(proceedCalls).toBe(0);
      expect(nameInput?.value).toBe("Save During Back");

      // Save resolves successfully: drawer AND discard confirmation must both close cleanly.
      await act(async () => {
        resolveCreate({ id: "c-new" });
        await Promise.resolve();
      });

      expect(resetCalls).toBeGreaterThanOrEqual(1);
      expect(proceedCalls).toBe(0);
      expect(Boolean(document.body.querySelector('[data-slot="sheet-content"]'))).toBe(false);
      expect(Boolean(document.body.querySelector('[data-slot="alert-dialog-content"]'))).toBe(
        false,
      );
    } finally {
      await view.cleanup();
    }
  });

  test("TC-09: CustomerFormDrawer supports TagField and avatar clearing with avatarUrl: null while respecting UnsavedChangesGuard", async () => {
    const win = getTestWindow();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const customerRecord = {
      id: "cust-edit",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "",
      company: "Analytical Engines",
      status: "active",
      balanceMinor: 5000,
      currency: "USD",
      avatarUrl: "/uploads/ada.png",
      tags: ["vip"],
      notes: "",
    };
    queryClient.setQueryData(["customers", "byId", "cust-edit"], customerRecord);
    queryClient.setQueryData(["customers", "tags"], ["vip", "enterprise"]);
    chromeMocks.customerByIdImpl = async () => customerRecord;
    const updatedPayloads: unknown[] = [];
    chromeMocks.updateCustomerImpl = async (input) => {
      updatedPayloads.push(input);
      return { id: "cust-edit" };
    };

    let openState = true;
    const view = await renderWithQuery(
      <CustomerFormDrawer
        open
        onOpenChange={(next) => {
          openState = next;
        }}
        customerId="cust-edit"
      />,
      queryClient,
    );

    try {
      const nameInput = document.body.querySelector<HTMLInputElement>('input[name="name"]');
      expect(nameInput?.value).toBe("Ada Lovelace");
      const tagInput = document.body.querySelector<HTMLInputElement>(
        '[data-slot="tag-input"] input',
      );
      expect(tagInput).not.toBeNull();
      expect(document.body.textContent).toContain("vip");

      // Add a new tag via TagField.
      await act(async () => {
        if (tagInput) {
          setInputValue(tagInput, "renewal");
          tagInput.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      });
      expect(document.body.textContent).toContain("renewal");

      // Clear avatar via UploadField remove affordance.
      const removeAvatarBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Remove avatar"),
      );
      expect(removeAvatarBtn).not.toBeUndefined();
      await act(async () => {
        removeAvatarBtn?.click();
      });

      // Attempting to close via Escape must trigger UnsavedChangesGuard.
      const sheet = document.body.querySelector('[data-slot="sheet-content"]');
      await act(async () => {
        sheet?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });
      const alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog?.textContent).toContain("Discard unsaved changes?");

      // Keep editing and submit the form.
      const keepBtn = Array.from(alertDialog?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      );
      await act(async () => {
        keepBtn?.click();
      });

      const formEl = document.body.querySelector<HTMLFormElement>("form");
      await act(async () => {
        formEl?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(updatedPayloads).toEqual([
        {
          id: "cust-edit",
          tags: ["vip", "renewal"],
          avatarUrl: null,
        },
      ]);
      expect(openState).toBe(false);
    } finally {
      await view.cleanup();
    }
  });

  test("SEAM-04: preserves local drawer tag and avatar edits when customers.byId refetches on focus", async () => {
    const win = getTestWindow();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const initialRecord = {
      id: "cust-edit",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "",
      company: "Analytical Engines",
      status: "active",
      balanceMinor: 5000,
      currency: "USD",
      avatarUrl: "/uploads/ada.png",
      tags: ["vip"],
      notes: "",
    };
    let serverRecord = initialRecord;
    queryClient.setQueryData(["customers", "byId", "cust-edit"], initialRecord);
    queryClient.setQueryData(["customers", "tags"], ["vip", "enterprise"]);
    chromeMocks.customerByIdImpl = async () => serverRecord;

    const view = await renderWithQuery(
      <CustomerFormDrawer open onOpenChange={() => {}} customerId="cust-edit" />,
      queryClient,
    );

    try {
      const tagInput = document.body.querySelector<HTMLInputElement>(
        '[data-slot="tag-input"] input',
      );
      await act(async () => {
        if (tagInput) {
          setInputValue(tagInput, "local-tag");
          tagInput.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      });

      const removeAvatarBtn = Array.from(document.body.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Remove avatar"),
      );
      await act(async () => {
        removeAvatarBtn?.click();
      });
      expect(document.body.textContent).toContain("local-tag");
      expect(document.body.querySelector('img[alt="Uploaded file preview"]')).toBeNull();

      // Another staff member saves a concurrent update and a focus refetch lands.
      serverRecord = {
        ...initialRecord,
        name: "Ada Updated By Colleague",
        tags: ["vip", "colleague-tag"],
        avatarUrl: "/uploads/colleague.png",
      };
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ["customers", "byId", "cust-edit"] });
        await Promise.resolve();
      });

      const nameInput = document.body.querySelector<HTMLInputElement>('input[name="name"]');
      expect(nameInput?.value).toBe("Ada Lovelace");
      expect(document.body.textContent).toContain("local-tag");
      expect(document.body.textContent).not.toContain("colleague-tag");
      expect(document.body.querySelector('img[alt="Uploaded file preview"]')).toBeNull();
    } finally {
      await view.cleanup();
    }
  });

  test("CODE-02: triggers UnsavedChangesGuard on Cancel when tag input has uncommitted draft text", async () => {
    let openState = true;
    const view = await renderWithQuery(
      <CustomerFormDrawer
        open
        onOpenChange={(next) => {
          openState = next;
        }}
        customerId={null}
      />,
    );

    try {
      const tagInput = document.body.querySelector<HTMLInputElement>(
        '[data-slot="tag-input"] input',
      );
      expect(tagInput).not.toBeNull();

      await act(async () => {
        if (tagInput) {
          setInputValue(tagInput, "uncommitted-tag");
        }
      });

      const cancelBtn = Array.from(document.body.querySelectorAll("button")).find(
        (btn) => btn.textContent?.trim() === "Cancel",
      );
      await act(async () => {
        cancelBtn?.click();
      });

      const alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog?.textContent).toContain("Discard unsaved changes?");
      expect(openState).toBe(true);

      // Keep editing retains the typed draft text.
      const keepBtn = Array.from(alertDialog?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      );
      await act(async () => {
        keepBtn?.click();
      });
      expect(tagInput?.value).toBe("uncommitted-tag");

      // Cancel -> Discard changes closes cleanly.
      await act(async () => {
        cancelBtn?.click();
      });
      const discardBtn = Array.from(
        document.body
          .querySelector('[data-slot="alert-dialog-content"]')
          ?.querySelectorAll("button") ?? [],
      ).find((btn) => btn.textContent?.includes("Discard changes"));
      await act(async () => {
        discardBtn?.click();
      });
      expect(openState).toBe(false);
    } finally {
      await view.cleanup();
    }
  });

  test("preserves colleague archive when saving an unrelated edit (diff-only update)", async () => {
    const win = getTestWindow();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const initialRecord = {
      id: "cust-edit",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "",
      company: "Analytical Engines",
      status: "active",
      balanceMinor: 5000,
      currency: "USD",
      avatarUrl: "/uploads/ada.png",
      tags: ["vip"],
      notes: "",
    };
    let serverRecord = initialRecord;
    queryClient.setQueryData(["customers", "byId", "cust-edit"], initialRecord);
    queryClient.setQueryData(["customers", "tags"], ["vip", "enterprise"]);
    chromeMocks.customerByIdImpl = async () => serverRecord;

    const updatedPayloads: Array<Record<string, unknown>> = [];
    chromeMocks.updateCustomerImpl = async (input) => {
      updatedPayloads.push(input as Record<string, unknown>);
      return { id: "cust-edit" };
    };

    let openState = true;
    const view = await renderWithQuery(
      <CustomerFormDrawer
        open
        onOpenChange={(next) => {
          openState = next;
        }}
        customerId="cust-edit"
      />,
      queryClient,
    );

    try {
      // Colleague archives the open record concurrently and refetch arrives.
      serverRecord = { ...initialRecord, status: "archived" };
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ["customers", "byId", "cust-edit"] });
        await Promise.resolve();
      });

      const companyInput = document.body.querySelector<HTMLInputElement>('input[name="company"]');
      expect(companyInput).not.toBeNull();
      await act(async () => {
        if (companyInput) {
          setInputValue(companyInput, "Lovelace Labs");
        }
      });

      const formEl = document.body.querySelector<HTMLFormElement>("form");
      await act(async () => {
        formEl?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(updatedPayloads).toEqual([
        {
          id: "cust-edit",
          company: "Lovelace Labs",
        },
      ]);
      expect(openState).toBe(false);
    } finally {
      await view.cleanup();
    }
  });

  test("CODE-04: omits blank phone, company, and notes keys from edit patch when saving a tag", async () => {
    const win = getTestWindow();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const customerRecord = {
      id: "cust-edit",
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+14155550101",
      company: "Analytical Engines",
      status: "active",
      balanceMinor: 5000,
      currency: "USD",
      avatarUrl: "/uploads/ada.png",
      tags: ["vip"],
      notes: "Original note",
    };
    queryClient.setQueryData(["customers", "byId", "cust-edit"], customerRecord);
    queryClient.setQueryData(["customers", "tags"], ["vip", "renewal"]);
    chromeMocks.customerByIdImpl = async () => customerRecord;

    const updatedPayloads: Array<Record<string, unknown>> = [];
    chromeMocks.updateCustomerImpl = async (input) => {
      updatedPayloads.push(input as Record<string, unknown>);
      return { id: "cust-edit" };
    };

    let openState = true;
    const view = await renderWithQuery(
      <CustomerFormDrawer
        open
        onOpenChange={(next) => {
          openState = next;
        }}
        customerId="cust-edit"
      />,
      queryClient,
    );

    try {
      const phoneInput = document.body.querySelector<HTMLInputElement>('input[type="tel"]');
      const companyInput = document.body.querySelector<HTMLInputElement>('input[name="company"]');
      const notesInput = document.body.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');
      const tagInput = document.body.querySelector<HTMLInputElement>(
        '[data-slot="tag-input"] input',
      );
      expect(phoneInput?.value).toBe("4155550101");
      expect(companyInput?.value).toBe("Analytical Engines");
      expect(notesInput?.value).toBe("Original note");

      await act(async () => {
        if (phoneInput) setInputValue(phoneInput, "");
        if (companyInput) setInputValue(companyInput, "");
        if (notesInput) setInputValue(notesInput, "");
        if (tagInput) {
          setInputValue(tagInput, "renewal");
          tagInput.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        }
      });

      const formEl = document.body.querySelector<HTMLFormElement>("form");
      await act(async () => {
        formEl?.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(updatedPayloads).toEqual([
        {
          id: "cust-edit",
          tags: ["vip", "renewal"],
        },
      ]);
      expect(openState).toBe(false);
    } finally {
      await view.cleanup();
    }
  });

  test("CODE-02: retains pending tag text per-keystroke across blur, popup-open Cancel, Escape, and Keep editing", async () => {
    const win = getTestWindow();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["customers", "tags"], ["vip", "enterprise", "beta"]);
    chromeMocks.customerTagsImpl = async () => ["vip", "enterprise", "beta"];

    let openState = true;
    const view = await renderWithQuery(
      <CustomerFormDrawer
        open
        onOpenChange={(next) => {
          openState = next;
        }}
        customerId={null}
      />,
      queryClient,
    );

    try {
      const tagInput = document.body.querySelector<HTMLInputElement>(
        '[data-slot="tag-input"] input',
      );
      expect(tagInput).not.toBeNull();

      await act(async () => {
        tagInput?.focus();
      });

      // Type "ved-tag" character by character ('v' matches "vip", 'e' matches "enterprise", 'd' matches none).
      let typed = "";
      for (const ch of "ved-tag") {
        typed += ch;
        await act(async () => {
          if (tagInput) setInputValue(tagInput, typed);
        });
        expect(tagInput?.value).toBe(typed);
      }

      const cancelBtn = Array.from(document.body.querySelectorAll("button")).find(
        (btn) => btn.textContent?.trim() === "Cancel",
      );
      expect(cancelBtn).toBeDefined();

      // Simulate focus moving to Cancel before click (real browser blur + outside press).
      await act(async () => {
        cancelBtn?.focus();
        tagInput?.dispatchEvent(
          new win.FocusEvent("blur", { bubbles: true, relatedTarget: cancelBtn }),
        );
        cancelBtn?.click();
      });

      let alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog?.textContent).toContain("Discard unsaved changes?");
      expect(openState).toBe(true);

      const keepBtn = Array.from(alertDialog?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      );
      await act(async () => {
        keepBtn?.click();
      });
      expect(tagInput?.value).toBe("ved-tag");

      // Now type "b" so the suggestions popup ("beta") opens, then click Cancel.
      await act(async () => {
        tagInput?.focus();
        if (tagInput) setInputValue(tagInput, "b");
      });
      expect(document.body.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);

      await act(async () => {
        cancelBtn?.focus();
        tagInput?.dispatchEvent(
          new win.FocusEvent("blur", { bubbles: true, relatedTarget: cancelBtn }),
        );
        cancelBtn?.click();
      });
      alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog?.textContent).toContain("Discard unsaved changes?");
      expect(openState).toBe(true);

      const keepBtn2 = Array.from(alertDialog?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Keep editing"),
      );
      await act(async () => {
        keepBtn2?.click();
      });
      expect(tagInput?.value).toBe("b");

      // Escape with closed popup must prompt instead of dropping pending text or closing silently.
      await act(async () => {
        tagInput?.focus();
        tagInput?.dispatchEvent(
          new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      });
      alertDialog = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(alertDialog?.textContent).toContain("Discard unsaved changes?");
      expect(tagInput?.value).toBe("b");
      expect(openState).toBe(true);
    } finally {
      await view.cleanup();
    }
  });
});
