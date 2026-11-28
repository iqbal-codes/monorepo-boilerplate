import { customerStatus } from "@monorepo-boilerplate/db/schema/customer";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { storedAssetPathSchema } from "../asset-path";
import {
  MAX_CUSTOMER_FILTER_TAG_LENGTH,
  MAX_CUSTOMER_FILTER_TAGS,
} from "../customer-filter-limits";

export { storedAssetPathSchema };

export const MAX_CUSTOMER_PAGE_SIZE = 100;

/** Mirrors `MAX_IMPORT_ROWS` in `packages/ui/src/lib/csv.ts`. */
export const MAX_IMPORT_ROWS = 1000;

/** Mirrors `PREVIEW_SAMPLE_ROWS` in `packages/ui/src/lib/csv.ts`. */
export const PREVIEW_SAMPLE_ROWS = 50;

export const MAX_BALANCE_MINOR = 9_007_199_254_740_991;

export const customerScopeInput = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["all", "active", "inactive", "archived"]).default("all"),
  statuses: z.array(z.enum(customerStatus.enumValues)).max(10).optional(),
  tags: z
    .array(z.string().trim().min(1).max(MAX_CUSTOMER_FILTER_TAG_LENGTH))
    .max(MAX_CUSTOMER_FILTER_TAGS)
    .optional(),
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
export function toExportBalanceMinor(balanceMinor: string): number {
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

const TAG_REGEX = /^.+$/;

const customerBaseFields = {
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(200).optional(),
  status: z.enum(customerStatus.enumValues),
  balanceMinor: z.number().int().min(-MAX_BALANCE_MINOR).max(MAX_BALANCE_MINOR),
  currency: z.string().length(3),
  notes: z.string().max(2000).optional(),
  avatarUrl: storedAssetPathSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(64).regex(TAG_REGEX)).max(50).optional(),
};

export const customerCreateInput = z.object({
  ...customerBaseFields,
  status: customerBaseFields.status.default("active"),
  currency: customerBaseFields.currency.default("USD"),
});

export const customerUpdateInput = z
  .object(customerBaseFields)
  .partial()
  .extend({
    id: z.string().min(1),
    avatarUrl: storedAssetPathSchema.nullable().optional(),
  });

/**
 * A CSV row as the Import block sends it: the original 1-based line plus the
 * raw cell text. Blank cells arrive as `""` so the row rules can default them,
 * and every field is bounded here so a direct caller cannot bypass the CSV
 * parser's limits.
 */
export const customerImportRowInput = z.object({
  lineNumber: z.number().int().min(1),
  values: z
    .object({
      name: z.string().max(10_000),
      email: z.string().max(10_000),
      phone: z.string().max(10_000),
      company: z.string().max(10_000),
      status: z.string().max(10_000),
      balanceMinor: z.string().max(10_000),
      currency: z.string().max(10_000),
      notes: z.string().max(10_000),
    })
    .strict(),
});

export const customerImportInput = z.object({
  rows: z.array(customerImportRowInput).max(MAX_IMPORT_ROWS),
  importId: z.uuid().optional(),
});

export const customerImportStatusInput = z.object({
  importId: z.uuid(),
  emails: z.array(z.string().max(320)).max(MAX_IMPORT_ROWS).optional(),
});
