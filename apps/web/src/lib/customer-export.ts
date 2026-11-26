import type { CustomerScopeInput } from "@monorepo-boilerplate/api/routers/customers";
import type { AppRouter } from "@monorepo-boilerplate/api/routers/index";
import { createTRPCClient, httpLink, TRPCClientError } from "@trpc/client";

import { serverUrl } from "@/lib/server-url";

/**
 * Customers Screen adapter for the Export block.
 *
 * The block stays domain-free: this module snapshots the committed list scope,
 * owns the imperative tRPC call, and turns transport failures into the copy the
 * Screen shows. Nothing here touches the query cache or React state, so an
 * export never becomes a list query and never re-renders the table.
 */

const FALLBACK_MESSAGE = "Could not export customers. Check your connection and try again.";

/**
 * Export runs on its own `httpLink`, deliberately **not** the shared
 * `httpBatchLink` in `@/utils/trpc`.
 *
 * `httpBatchLink` merges same-tick calls into one fetch and only aborts that
 * fetch once every call in the batch aborts. A list refresh landing in the same
 * batch would therefore make the two share a failure and a cancellation
 * boundary: leaving the Screen would not stop the export request, and a broken
 * export response could surface as a list error. One request per export keeps
 * cancellation and failure local to the download.
 */
const exportClient = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${serverUrl}/trpc`,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});

/** The list criteria an export is taken at activation. Paging and selection are excluded. */
export type CustomerExportScope = {
  search?: string | undefined;
  status: NonNullable<CustomerScopeInput["status"]>;
  sortBy: NonNullable<CustomerScopeInput["sortBy"]>;
  sortDir: NonNullable<CustomerScopeInput["sortDir"]>;
};

/** UTC date of the activation, so the name cannot drift mid-run. */
export function customerExportFilename(activatedAt: Date): string {
  return `customers-${activatedAt.toISOString().slice(0, 10)}.csv`;
}

/**
 * Binds one scope to the block's `fetchExport` prop. The returned function is
 * how the block asks for the opaque payload; it resolves with the payload only,
 * never with rows.
 */
export function customerExportRequest(scope: CustomerExportScope) {
  const snapshot: CustomerScopeInput = {
    search: scope.search || undefined,
    status: scope.status,
    sortBy: scope.sortBy,
    sortDir: scope.sortDir,
  };

  return async (signal: AbortSignal): Promise<string> => {
    try {
      return await exportClient.customers.export.query(snapshot, { signal });
    } catch (cause) {
      throw new Error(customerExportErrorMessage(cause));
    }
  };
}

function customerExportErrorMessage(cause: unknown): string {
  // Both messages are owned by the API; only the fallback lives here.
  if (
    cause instanceof TRPCClientError &&
    (cause.data?.code === "PAYLOAD_TOO_LARGE" || cause.data?.code === "PRECONDITION_FAILED")
  ) {
    return cause.message;
  }
  return FALLBACK_MESSAGE;
}
