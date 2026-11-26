import type { CustomerScopeInput } from "@monorepo-boilerplate/api/routers/customers";
import type { AppRouter } from "@monorepo-boilerplate/api/routers/index";
import type { ExportHttpSource } from "@monorepo-boilerplate/ui/components/export-button";
import { useRouter } from "@tanstack/react-router";
import type { TRPCClient } from "@trpc/client";
import { useEffect, useState } from "react";

import { serverUrl } from "@/lib/server-url";

/**
 * Customers Screen adapter for the Export block.
 *
 * The block stays domain-free: this module snapshots the committed list scope,
 * produces an isolated unbatched tRPC HTTP query descriptor so the worker
 * receives and decodes the response off the Window main thread, and turns
 * transport failures into the copy the Screen shows. Nothing here touches the
 * query cache or React state, so an export never becomes a list query and never
 * re-renders the table.
 */

const FALLBACK_MESSAGE = "Could not export customers. Check your connection and try again.";

type CustomerExportProcedureInput = Parameters<
  TRPCClient<AppRouter>["customers"]["export"]["query"]
>[0];

/**
 * The list criteria an export is taken at activation. Paging and selection are excluded.
 */
export type CustomerExportScope = {
  search?: string | undefined;
  status: NonNullable<CustomerScopeInput["status"]>;
  sortBy: NonNullable<CustomerScopeInput["sortBy"]>;
  sortDir: NonNullable<CustomerScopeInput["sortDir"]>;
};

/**
 * Cancels whatever export is running the moment navigation away from the Screen
 * begins.
 *
 * React unmount is not enough: TanStack Router mounts the destination route before
 * it detaches the current one, so a worker resolving in that window would
 * still download a CSV for a list the user has left. `onBeforeNavigate` fires
 * before the URL commits, so aborting there invalidates the run while the toolbar
 * is still on screen.
 *
 * Only `pathChanged` counts. Search, sort, paging, and filter changes keep the same
 * path and are not departures — and an export already captured its scope, so it
 * must survive them. If an effect re-runs after cleanup (such as React StrictMode
 * or a router identity change), a fresh non-aborted controller is installed so the
 * Screen is never stranded with a pre-aborted signal.
 */
export function useCustomerExportCancel(): AbortSignal {
  const router = useRouter();
  const [controller, setController] = useState(() => new AbortController());

  useEffect(() => {
    const active = controller.signal.aborted ? new AbortController() : controller;
    if (active !== controller) {
      setController(active);
      return;
    }
    const unsubscribe = router.subscribe("onBeforeNavigate", (event) => {
      if (event.pathChanged) active.abort();
    });
    return () => {
      unsubscribe();
      active.abort();
    };
  }, [router, controller]);

  return controller.signal;
}

/** UTC date of the activation, so the name cannot drift mid-run. */
export function customerExportFilename(activatedAt: Date): string {
  return `customers-${activatedAt.toISOString().slice(0, 10)}.csv`;
}

/**
 * Builds the unbatched tRPC HTTP query URL for `customers.export`.
 *
 * Deliberately bypasses the shared `httpBatchLink` in `@/utils/trpc` and does
 * not read/decode the response body on the Window thread: `httpBatchLink` merges
 * same-tick calls into one fetch with a shared abort signal, and decoding a
 * 10,000-row payload on the Window thread would stall typing in the list.
 */
export function customerExportUrl(scope: CustomerExportScope): string {
  const snapshot: CustomerExportProcedureInput = {
    search: scope.search || undefined,
    status: scope.status,
    sortBy: scope.sortBy,
    sortDir: scope.sortDir,
  };
  const input = encodeURIComponent(JSON.stringify(snapshot));
  return `${serverUrl}/trpc/customers.export?input=${input}`;
}

/**
 * Binds one scope to the block's `fetchExport` prop. Returns an HTTP descriptor
 * so `ExportButton`'s on-demand worker receives and decodes the response off
 * the Window main thread.
 */
export function customerExportRequest(scope: CustomerExportScope) {
  const url = customerExportUrl(scope);

  return async (): Promise<ExportHttpSource> => ({
    kind: "http",
    url,
    credentials: "include",
    payloadPath: ["result", "data"],
    mapError: customerExportErrorMessage,
  });
}

export function customerExportErrorMessage({ body }: { status?: number; body?: string }): string {
  // Both messages are owned by the API; only the fallback lives here.
  if (body) {
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: unknown; data?: { code?: unknown } };
      };
      const code = parsed.error?.data?.code;
      const message = parsed.error?.message;
      if (
        typeof message === "string" &&
        message !== "" &&
        (code === "PAYLOAD_TOO_LARGE" || code === "PRECONDITION_FAILED")
      ) {
        return message;
      }
    } catch {
      // Non-JSON or truncated error bodies fall back to the staff retry copy.
    }
  }
  return FALLBACK_MESSAGE;
}
