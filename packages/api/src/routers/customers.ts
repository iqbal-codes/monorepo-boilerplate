import { TRPCError } from "@trpc/server";
import {
  CUSTOMER_EXPORT_LIMIT,
  customerQueries,
  type CustomerListQuery,
} from "@monorepo-boilerplate/db/queries/customer";
import { customerStatus } from "@monorepo-boilerplate/db/schema/customer";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { adminProcedure } from "../procedures";

const MAX_CUSTOMER_PAGE_SIZE = 100;

export const customerScopeInput = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["all", "active", "inactive", "archived"]).default("all"),
  sortBy: z.enum(["name", "company", "status", "balanceMinor", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const customerListInput = customerScopeInput.extend({
  pageIndex: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(MAX_CUSTOMER_PAGE_SIZE).default(20),
});

export type CustomerScopeInput = z.infer<typeof customerScopeInput>;

/**
 * Column order of every Customer export, shared by the procedure's projection
 * and the CSV headers the worker writes.
 */
export const CUSTOMER_EXPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "company",
  "status",
  "balanceMinor",
  "currency",
  "notes",
] as const;

export const CUSTOMER_EXPORT_TOO_LARGE_MESSAGE =
  "This export matches more than 10,000 customers. Narrow the search or status filter and try again.";

/**
 * The widest integer a JSON number can carry without losing precision. The DB
 * column is a SQL `bigint`, so a row outside this range cannot be represented
 * as a number in the payload.
 */
const MAX_SAFE_BALANCE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BALANCE_MINOR = -MAX_SAFE_BALANCE_MINOR;

/**
 * Converts the exact decimal text from the query into the payload's JSON number.
 *
 * Throws instead of rounding: a wrong balance in a downloaded file is worse than
 * a failed export, and the CSV cannot express "unsafe" by any other means.
 */
function toExportBalanceMinor(balanceMinor: string): number {
  const exact = BigInt(balanceMinor);
  if (exact > MAX_SAFE_BALANCE_MINOR || exact < MIN_SAFE_BALANCE_MINOR) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This export includes a balance too large to write exactly. Narrow the search or status filter and try again.",
    });
  }
  return Number(exact);
}

export const customerCreateInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(200).optional(),
  status: z.enum(customerStatus.enumValues).default("active"),
  balanceMinor: z.number().int().min(-9_007_199_254_740_991).max(9_007_199_254_740_991),
  currency: z.string().length(3).default("USD"),
  notes: z.string().max(2000).optional(),
  avatarUrl: z.string().max(2048).optional(),
});

export const customerUpdateInput = customerCreateInput.partial().extend({
  id: z.string().min(1),
});

export const customersRouter = router({
  list: protectedProcedure.input(customerListInput).query(({ ctx, input }) => {
    const query: CustomerListQuery = input;
    return customerQueries(ctx.db).list(query);
  }),

  /**
   * Opaque CSV payload for every Customer matching the list scope.
   *
   * Paging and selection are not inputs: an export is the whole filtered set.
   * The payload is UTF-8 JSON whose rows follow `CUSTOMER_EXPORT_COLUMNS`;
   * `balanceMinor` stays a JSON number so the worker never mistakes a negative
   * balance for formula-like text. The client generates the file in a worker so
   * neither the rows nor their stringification touch the main thread.
   *
   * The query projects the balance as exact decimal text and this procedure
   * range-checks it before any number conversion, so a stored value outside
   * JavaScript's safe integer range fails the export instead of rounding.
   */
  export: protectedProcedure.input(customerScopeInput).query(async ({ ctx, input }) => {
    const rows = await customerQueries(ctx.db).exportRows(input);
    if (rows.length > CUSTOMER_EXPORT_LIMIT) {
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: CUSTOMER_EXPORT_TOO_LARGE_MESSAGE,
      });
    }
    return JSON.stringify({
      headers: CUSTOMER_EXPORT_COLUMNS,
      rows: rows.map((row) =>
        CUSTOMER_EXPORT_COLUMNS.map((column) =>
          column === "balanceMinor" ? toExportBalanceMinor(row.balanceMinor) : row[column],
        ),
      ),
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => customerQueries(ctx.db).byId(input.id)),

  create: protectedProcedure.input(customerCreateInput).mutation(({ ctx, input }) => {
    return customerQueries(ctx.db).create({ ...input, id: crypto.randomUUID() });
  }),

  update: protectedProcedure.input(customerUpdateInput).mutation(({ ctx, input }) => {
    const { id, ...patch } = input;
    return customerQueries(ctx.db).update(id, patch);
  }),

  archiveMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(MAX_CUSTOMER_PAGE_SIZE) }))
    .mutation(async ({ ctx, input }) => {
      const archived = await customerQueries(ctx.db).archiveMany(input.ids);
      if (!archived) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some selected customers no longer exist.",
        });
      }
      return archived;
    }),

  // Destructive: administrators only. Proves the role gate end to end (docs/adr/0003).
  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => customerQueries(ctx.db).remove(input.id)),

  stats: protectedProcedure.query(({ ctx }) => customerQueries(ctx.db).stats()),
});
