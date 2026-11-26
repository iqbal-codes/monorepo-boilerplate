import type { CustomerScopeInput } from "@monorepo-boilerplate/api/routers/customers";
import { TRPCClientError } from "@trpc/client";

import { trpcClient } from "@/utils/trpc";

/**
 * Customers Screen adapter for the Export block.
 *
 * The block stays domain-free: this module snapshots the committed list scope,
 * owns the imperative tRPC call, and turns transport failures into the copy the
 * Screen shows. Nothing here touches the query cache or React state, so an
 * export never becomes a list query and never re-renders the table.
 */

const FALLBACK_MESSAGE = "Could not export customers. Check your connection and try again.";

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
      return await trpcClient.customers.export.query(snapshot, { signal });
    } catch (cause) {
      throw new Error(customerExportErrorMessage(cause));
    }
  };
}

function customerExportErrorMessage(cause: unknown): string {
  // The API owns the over-limit copy; only the fallback lives here.
  if (cause instanceof TRPCClientError && cause.data?.code === "PAYLOAD_TOO_LARGE") {
    return cause.message;
  }
  return FALLBACK_MESSAGE;
}
