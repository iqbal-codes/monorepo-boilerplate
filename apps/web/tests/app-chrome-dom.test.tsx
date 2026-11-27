import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react";

const uiPkgPath = resolve(import.meta.dir, "../../../packages/ui/package.json");
const { Window } = (await import(
  Bun.resolveSync("happy-dom", uiPkgPath)
)) as typeof import("happy-dom");
const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", uiPkgPath)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/customers" });
win.HTMLElement.prototype.scrollIntoView ??= () => {};
win.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

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
  MutationObserver: win.MutationObserver,
  ResizeObserver: MockResizeObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

let sessionHookState: {
  data: {
    user: { id: string; name: string; email: string; role?: string };
    session: { id: string; impersonatedBy?: string | null };
  } | null;
  error: { status?: number; message: string } | null;
  isPending: boolean;
  refetch: () => Promise<void>;
} = {
  data: null,
  error: null,
  isPending: false,
  refetch: async () => {},
};

let stopImpersonatingImpl: () => Promise<{
  data?: {
    user: { id: string; name: string; email: string; role?: string };
    session: { id: string; impersonatedBy?: string | null };
  } | null;
  error?: { message?: string } | null;
}> = async () => ({
  data: null,
  error: null,
});

let createCustomerImpl: (input: unknown) => Promise<unknown> = async () => ({ id: "c-1" });
let updateCustomerImpl: (input: unknown) => Promise<unknown> = async () => ({ id: "c-1" });
let customerByIdImpl: (id: string) => Promise<unknown> = async () => null;
let customerTagsImpl: () => Promise<string[]> = async () => ["vip", "enterprise"];

mock.module("@/lib/server-url", () => ({
  serverUrl: "http://localhost:3000",
  getServerUrl: (url: string) => url,
}));

mock.module("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => sessionHookState,
    admin: {
      stopImpersonating: () => stopImpersonatingImpl(),
    },
  },
}));

mock.module("@/utils/trpc", () => ({
  trpc: {
    customers: {
      pathFilter: () => ({ queryKey: ["customers"] }),
      byId: {
        queryOptions: ({ id }: { id: string }) => ({
          queryKey: ["customers", "byId", id],
          queryFn: () => customerByIdImpl(id),
        }),
      },
      tags: {
        queryOptions: () => ({
          queryKey: ["customers", "tags"],
          queryFn: () => customerTagsImpl(),
        }),
      },
      list: {
        queryOptions: (input: unknown) => ({
          queryKey: ["customers", "list", input],
          queryFn: async () => ({ rows: [], rowCount: 0 }),
        }),
      },
      create: {
        mutationOptions: (opts: Record<string, unknown> = {}) => ({
          ...opts,
          mutationFn: (input: unknown) => createCustomerImpl(input),
        }),
      },
      update: {
        mutationOptions: (opts: Record<string, unknown> = {}) => ({
          ...opts,
          mutationFn: (input: unknown) => updateCustomerImpl(input),
        }),
      },
    },
  },
}));

let routerInvalidateCalls = 0;
let blockerImpl: () =>
  | { status: "idle" }
  | { status: "blocked"; proceed: () => void; reset: () => void } = () => ({ status: "idle" });

mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to ?? "#"} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => () => Promise.resolve(),
  useRouter: () => ({
    invalidate: async () => {
      routerInvalidateCalls += 1;
    },
  }),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({
      location: { pathname: "/customers" },
      matches: [{ staticData: { pageTitle: "Customers" } }],
    }),
  useBlocker: () => blockerImpl(),
}));

const { createRoot } = await import("react-dom/client");
const { AppShell } = await import("../src/components/app-shell");
const { AppSystemBanners } = await import("../src/components/app-system-banners");
const { CustomerFormDrawer } = await import("../src/components/customers/customer-form-drawer");

afterAll(() => {
  for (const key of DOM_KEYS) {
    (globalThis as Record<string, unknown>)[key] = previousGlobals[key];
  }
  win.close();
});

beforeEach(() => {
  sessionHookState = {
    data: {
      user: { id: "u-1", name: "Ada", email: "ada@example.com", role: "user" },
      session: { id: "s-1", impersonatedBy: null },
    },
    error: null,
    isPending: false,
    refetch: async () => {},
  };
  stopImpersonatingImpl = async () => ({ error: null });
  createCustomerImpl = async () => ({ id: "c-1" });
  updateCustomerImpl = async () => ({ id: "c-1" });
  customerByIdImpl = async () => null;
  customerTagsImpl = async () => ["vip", "enterprise"];
  routerInvalidateCalls = 0;
  blockerImpl = () => ({ status: "idle" });
});

async function renderWithQuery(node: React.ReactNode, queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });

  return {
    host,
    client,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
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

describe("AppSystemBanners seam safety", () => {
  test("preserves route-verified impersonation banner and exposes refresh failure when useSession errors", async () => {
    let refetchCalls = 0;
    sessionHookState = {
      data: null,
      error: { status: 500, message: "Internal Server Error" },
      isPending: false,
      refetch: async () => {
        refetchCalls += 1;
      },
    };

    const impersonatedInitial = {
      user: { id: "u-target", name: "Target User", email: "target@example.com" },
      session: { id: "s-imp", impersonatedBy: "admin-1" },
    } as never;

    const view = await renderWithQuery(<AppSystemBanners initialSession={impersonatedInitial} />);
    try {
      const text = view.host.textContent ?? "";
      expect(text).toContain("Viewing as Target User");
      expect(text).toContain("Stop impersonating");
      expect(text).toContain("Could not refresh session status");

      const retryBtn = Array.from(view.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Retry"),
      );
      expect(retryBtn).toBeDefined();
      await act(async () => {
        retryBtn?.click();
      });
      expect(refetchCalls).toBe(1);
    } finally {
      await view.cleanup();
    }
  });

  test("clears cached queries and invokes reload on successful stopImpersonating, but skips reload on error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["assistant", "threads"], [{ id: "private-target-thread" }]);

    sessionHookState = {
      data: {
        user: { id: "u-target", name: "Target User", email: "target@example.com" },
        session: { id: "s-imp", impersonatedBy: "admin-1" },
      },
      error: null,
      isPending: false,
      refetch: async () => {},
    };

    let reloads = 0;
    let identityResets = 0;
    stopImpersonatingImpl = async () => ({ error: { message: "Denied" } });

    const view = await renderWithQuery(
      <AppSystemBanners
        onIdentityReset={() => {
          identityResets += 1;
        }}
        onReload={() => {
          reloads += 1;
        }}
      />,
      queryClient,
    );

    try {
      const stopBtn = Array.from(view.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Stop impersonating"),
      );
      expect(stopBtn).toBeDefined();

      await act(async () => {
        stopBtn?.click();
      });
      expect(reloads).toBe(0);
      expect(identityResets).toBe(0);
      expect(queryClient.getQueryData(["assistant", "threads"])).toBeDefined();

      stopImpersonatingImpl = async () => ({ error: null });
      await act(async () => {
        stopBtn?.click();
      });
      expect(reloads).toBe(1);
      expect(identityResets).toBe(1);
      expect(routerInvalidateCalls).toBe(1);
      expect(queryClient.getQueryData(["assistant", "threads"])).toBeUndefined();
    } finally {
      await view.cleanup();
    }
  });

  test("hides impersonation banner when useSession settles to null (200/null expired session) and stays hidden on refetch", async () => {
    const impersonatedInitial = {
      user: { id: "u-target", name: "Target User", email: "target@example.com" },
      session: { id: "s-imp", impersonatedBy: "admin-1" },
    } as never;

    sessionHookState = {
      data: null,
      error: null,
      isPending: true,
      refetch: async () => {},
    };

    const view = await renderWithQuery(<AppSystemBanners initialSession={impersonatedInitial} />);
    try {
      expect(view.host.textContent).toContain("Viewing as Target User");

      // Better Auth settles to HTTP 200 / null when session expires.
      sessionHookState = {
        data: null,
        error: null,
        isPending: false,
        refetch: async () => {},
      };
      await act(async () => {
        await view.cleanup();
      });

      const settledView = await renderWithQuery(
        <AppSystemBanners initialSession={impersonatedInitial} />,
      );
      try {
        expect(settledView.host.textContent).not.toContain("Viewing as Target User");
        expect(settledView.host.textContent).not.toContain("Stop impersonating");
      } finally {
        await settledView.cleanup();
      }
    } finally {
      // Initial view already cleaned up above if settledView block ran; ensure safe cleanup.
    }
  });

  test("does not resurrect initialSession when live session transitions from active to null then refetches", async () => {
    const impersonatedInitial = {
      user: { id: "u-target", name: "Target User", email: "target@example.com" },
      session: { id: "s-imp", impersonatedBy: "admin-1" },
    } as never;

    sessionHookState = {
      data: {
        user: { id: "u-target", name: "Target User", email: "target@example.com" },
        session: { id: "s-imp", impersonatedBy: "admin-1" },
      },
      error: null,
      isPending: false,
      refetch: async () => {},
    };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { createRoot: makeRoot } = await import("react-dom/client");
    const root = makeRoot(host);

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).toContain("Viewing as Target User");

      // Active -> settled null (session expired)
      sessionHookState = { data: null, error: null, isPending: false, refetch: async () => {} };
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");

      // Subsequent refetch puts isPending=true again; banner must stay hidden.
      sessionHookState = { data: null, error: null, isPending: true, refetch: async () => {} };
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  test("latches 401 so Retry (error cleared -> 500) never resurrects the stale impersonation seed", async () => {
    const impersonatedInitial = {
      user: { id: "u-target", name: "Target User", email: "target@example.com" },
      session: { id: "s-imp", impersonatedBy: "admin-1" },
    } as never;

    let refetchCalls = 0;
    sessionHookState = {
      data: null,
      error: { status: 401, message: "Unauthorized" },
      isPending: false,
      refetch: async () => {
        refetchCalls += 1;
      },
    };

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const { createRoot: makeRoot } = await import("react-dom/client");
    const root = makeRoot(host);

    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");
      expect(host.textContent).not.toContain("Stop impersonating");

      // Better Auth clears `error` when Retry begins (isPending: true), then returns 500.
      const retryBtn = Array.from(host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Retry"),
      );
      expect(retryBtn).toBeDefined();
      await act(async () => {
        retryBtn?.click();
      });
      expect(refetchCalls).toBe(1);

      sessionHookState = {
        data: null,
        error: null,
        isPending: true,
        refetch: sessionHookState.refetch,
      };
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");

      sessionHookState = {
        data: null,
        error: { status: 500, message: "Internal Server Error" },
        isPending: false,
        refetch: sessionHookState.refetch,
      };
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");
      expect(host.textContent).not.toContain("Stop impersonating");
      expect(host.textContent).toContain("Could not refresh session status");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  test("unmounts target identity subtree immediately from Stop response even when refetch stalls and reload is suppressed", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["assistant", "threads"], [{ id: "private-target-thread" }]);

    const targetSession = {
      user: { id: "u-target", name: "Target User", email: "target@example.com" },
      session: { id: "s-imp", impersonatedBy: "admin-1" },
    };
    const adminSession = {
      user: { id: "admin-1", name: "Admin", email: "admin@example.com", role: "admin" },
      session: { id: "s-admin", impersonatedBy: null },
    };

    // Stalled GET /get-session that never resolves during the assertion window.
    let refetchStarted = false;
    sessionHookState = {
      data: targetSession,
      error: null,
      isPending: false,
      refetch: () => {
        refetchStarted = true;
        return new Promise<void>(() => {});
      },
    };
    stopImpersonatingImpl = async () => ({
      data: adminSession,
      error: null,
    });

    let targetUnmounts = 0;
    function IdentityScopedChild({ userId }: { userId: string }) {
      React.useEffect(() => {
        return () => {
          if (userId === "u-target") targetUnmounts += 1;
        };
      }, [userId]);
      return <div data-testid="identity-subtree">{userId}</div>;
    }

    function StopHarness() {
      const [restored, setRestored] = React.useState<typeof adminSession | null>(null);
      const [epoch, setEpoch] = React.useState(0);
      const activeUserId = restored?.user.id ?? targetSession.user.id;
      return (
        <div key={`${activeUserId}:${epoch}`}>
          <AppSystemBanners
            initialSession={restored ?? (targetSession as never)}
            sessionOverride={restored as never}
            onIdentityReset={(next) => {
              setRestored((next as typeof adminSession | null) ?? null);
              setEpoch((n) => n + 1);
            }}
            onReload={() => {
              // Suppressed reload (e.g. cancelled beforeunload)
            }}
          />
          <IdentityScopedChild userId={activeUserId} />
        </div>
      );
    }

    const view = await renderWithQuery(<StopHarness />, queryClient);
    try {
      expect(view.host.textContent).toContain("Viewing as Target User");
      expect(view.host.querySelector('[data-testid="identity-subtree"]')?.textContent).toBe(
        "u-target",
      );

      const stopBtn = Array.from(view.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Stop impersonating"),
      );
      expect(stopBtn).toBeDefined();

      await act(async () => {
        stopBtn?.click();
        await Promise.resolve();
      });

      expect(targetUnmounts).toBe(1);
      expect(refetchStarted).toBe(true);
      expect(queryClient.getQueryData(["assistant", "threads"])).toBeUndefined();
      expect(view.host.querySelector('[data-testid="identity-subtree"]')?.textContent).toBe(
        "admin-1",
      );
      expect(view.host.textContent).not.toContain("Viewing as Target User");
    } finally {
      await view.cleanup();
    }
  });
});

describe("CustomerFormDrawer pending save and Escape guard", () => {
  test("rejects Escape while save is pending, retains draft on failure, and restores dirty guard", async () => {
    let rejectCreate!: (error: Error) => void;
    let createStarted = false;
    createCustomerImpl = () => {
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
    let resolveCreate!: (value: unknown) => void;
    createCustomerImpl = () =>
      new Promise((resolve) => {
        resolveCreate = resolve;
      });

    let blocked = false;
    let resetCalls = 0;
    let proceedCalls = 0;
    blockerImpl = () =>
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
    customerByIdImpl = async () => customerRecord;
    const updatedPayloads: unknown[] = [];
    updateCustomerImpl = async (input) => {
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
    customerByIdImpl = async () => serverRecord;

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
    customerByIdImpl = async () => serverRecord;

    const updatedPayloads: Array<Record<string, unknown>> = [];
    updateCustomerImpl = async (input) => {
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

  test("CODE-02: retains pending tag text per-keystroke across blur, popup-open Cancel, Escape, and Keep editing", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["customers", "tags"], ["vip", "enterprise", "beta"]);
    customerTagsImpl = async () => ["vip", "enterprise", "beta"];

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

describe("AppShell Command Center -> ShortcutsDialog focus handoff", () => {
  test("restores focus to sidebar Command Center launcher when Escape closes ShortcutsDialog", async () => {
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
