import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react";

import { chromeMocks, renderWithQuery, useChromeDomHarness } from "./dom-test-harness";

const { createRoot } = await import("react-dom/client");
const { AppSystemBanners } = await import("../src/components/app-system-banners");

describe("AppSystemBanners seam safety", () => {
  useChromeDomHarness();

  test("preserves route-verified impersonation banner and exposes refresh failure when useSession errors", async () => {
    let refetchCalls = 0;
    chromeMocks.sessionHookState = {
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

    chromeMocks.sessionHookState = {
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
    chromeMocks.stopImpersonatingImpl = async () => ({ error: { message: "Denied" } });

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

      chromeMocks.stopImpersonatingImpl = async () => ({ error: null });
      await act(async () => {
        stopBtn?.click();
      });
      expect(reloads).toBe(1);
      expect(identityResets).toBe(1);
      expect(chromeMocks.routerInvalidateCalls).toBe(1);
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

    chromeMocks.sessionHookState = {
      data: null,
      error: null,
      isPending: true,
      refetch: async () => {},
    };

    const view = await renderWithQuery(<AppSystemBanners initialSession={impersonatedInitial} />);
    try {
      expect(view.host.textContent).toContain("Viewing as Target User");

      // Better Auth settles to HTTP 200 / null when session expires.
      chromeMocks.sessionHookState = {
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

    chromeMocks.sessionHookState = {
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
    const root = createRoot(host);

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
      chromeMocks.sessionHookState = {
        data: null,
        error: null,
        isPending: false,
        refetch: async () => {},
      };
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");

      // Subsequent refetch puts isPending=true again; banner must stay hidden.
      chromeMocks.sessionHookState = {
        data: null,
        error: null,
        isPending: true,
        refetch: async () => {},
      };
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
    chromeMocks.sessionHookState = {
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
    const root = createRoot(host);

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

      chromeMocks.sessionHookState = {
        data: null,
        error: null,
        isPending: true,
        refetch: chromeMocks.sessionHookState.refetch,
      };
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <AppSystemBanners initialSession={impersonatedInitial} />
          </QueryClientProvider>,
        );
      });
      expect(host.textContent).not.toContain("Viewing as Target User");

      chromeMocks.sessionHookState = {
        data: null,
        error: { status: 500, message: "Internal Server Error" },
        isPending: false,
        refetch: chromeMocks.sessionHookState.refetch,
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
    chromeMocks.sessionHookState = {
      data: targetSession,
      error: null,
      isPending: false,
      refetch: () => {
        refetchStarted = true;
        return new Promise<void>(() => {});
      },
    };
    chromeMocks.stopImpersonatingImpl = async () => ({
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
