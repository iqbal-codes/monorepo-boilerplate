import { TRPCError } from "@trpc/server";
import {
  CUSTOMER_EXPORT_LIMIT,
  customerQueries,
  isUniqueViolation,
  type CustomerListQuery,
} from "@monorepo-boilerplate/db/queries/customer";
import { customerStatus } from "@monorepo-boilerplate/db/schema/customer";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { adminProcedure } from "../procedures";

const MAX_CUSTOMER_PAGE_SIZE = 100;

/** Mirrors `MAX_IMPORT_ROWS` in `packages/ui/src/lib/csv.ts`. */
const MAX_IMPORT_ROWS = 1000;

/** Mirrors `PREVIEW_SAMPLE_ROWS` in `packages/ui/src/lib/csv.ts`. */
const PREVIEW_SAMPLE_ROWS = 50;

const MAX_BALANCE_MINOR = 9_007_199_254_740_991;

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
  balanceMinor: z.number().int().min(-MAX_BALANCE_MINOR).max(MAX_BALANCE_MINOR),
  currency: z.string().length(3).default("USD"),
  notes: z.string().max(2000).optional(),
  avatarUrl: z.string().max(2048).optional(),
});

export const customerUpdateInput = customerCreateInput.partial().extend({
  id: z.string().min(1),
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
});

type ImportRowInput = z.infer<typeof customerImportRowInput>;

export type CustomerImportIssue = {
  lineNumber: number;
  field: string;
  message: string;
};

export type CustomerImportDraft = Omit<z.infer<typeof customerCreateInput>, "avatarUrl"> & {
  lineNumber: number;
};

const IMPORTABLE_STATUSES = ["active", "inactive"] as const;

/** Optional `-` followed by digits; no separators, decimals, or exponents. */
const BALANCE_PATTERN = /^-?\d+$/;

const DEFAULTS = {
  status: "active",
  balanceMinor: "0",
  currency: "USD",
} as const;

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Turns one CSV row into the exact shape `customerCreateInput` accepts, or
 * reports every problem it found. No value is coerced or rounded: an ambiguous
 * balance is rejected instead of guessed at.
 */
export function readImportRow(row: ImportRowInput): {
  draft?: CustomerImportDraft;
  issues: CustomerImportIssue[];
} {
  const { lineNumber } = row;
  const raw = row.values;
  const issues: CustomerImportIssue[] = [];
  const fail = (field: string, message: string) => issues.push({ lineNumber, field, message });

  const name = raw.name.trim();
  if (name === "") fail("name", "Name is required.");
  else if (name.length > 200) fail("name", "Name must be 200 characters or fewer.");

  const email = raw.email.trim();
  if (email === "") fail("email", "Email is required.");
  else if (email.length > 320) fail("email", "Email must be 320 characters or fewer.");
  else if (!z.email().safeParse(email).success) fail("email", "Enter a valid email address.");

  const phone = optionalText(raw.phone);
  if (phone !== undefined && phone.length > 40) {
    fail("phone", "Phone must be 40 characters or fewer.");
  }

  const company = optionalText(raw.company);
  if (company !== undefined && company.length > 200) {
    fail("company", "Company must be 200 characters or fewer.");
  }

  const statusText = raw.status.trim() === "" ? DEFAULTS.status : raw.status.trim();
  if (!IMPORTABLE_STATUSES.includes(statusText as (typeof IMPORTABLE_STATUSES)[number])) {
    fail("status", "Status must be active or inactive.");
  }

  const balanceText =
    raw.balanceMinor.trim() === "" ? DEFAULTS.balanceMinor : raw.balanceMinor.trim();
  if (!BALANCE_PATTERN.test(balanceText)) {
    fail(
      "balanceMinor",
      "Balance must be a whole number in minor units, with an optional leading minus sign.",
    );
  }
  const balanceMinor = Number(balanceText);
  if (
    BALANCE_PATTERN.test(balanceText) &&
    (!Number.isSafeInteger(balanceMinor) || Math.abs(balanceMinor) > MAX_BALANCE_MINOR)
  ) {
    fail(
      "balanceMinor",
      `Balance must be between -${MAX_BALANCE_MINOR} and ${MAX_BALANCE_MINOR} minor units.`,
    );
  }

  const currencyText = raw.currency.trim() === "" ? DEFAULTS.currency : raw.currency.trim();
  if (currencyText.length !== 3) fail("currency", "Currency must be exactly three characters.");

  const notes = raw.notes;
  if (notes.length > 2000) fail("notes", "Notes must be 2000 characters or fewer.");

  if (issues.length > 0) return { issues };

  const draft: CustomerImportDraft = {
    lineNumber,
    name,
    email,
    ...(phone === undefined ? {} : { phone }),
    ...(company === undefined ? {} : { company }),
    status: statusText as CustomerImportDraft["status"],
    balanceMinor,
    currency: currencyText,
    ...(notes.trim() === "" ? {} : { notes }),
  };
  return { draft, issues };
}

/** Within-file duplicates, reported on every row after the first occurrence. */
function withinFileIssues(rows: readonly ImportRowInput[]): CustomerImportIssue[] {
  const seen = new Map<string, number>();
  const issues: CustomerImportIssue[] = [];
  for (const row of rows) {
    const email = row.values.email.trim();
    if (email === "") continue;
    const first = seen.get(email);
    if (first === undefined) {
      seen.set(email, row.lineNumber);
      continue;
    }
    issues.push({
      lineNumber: row.lineNumber,
      field: "email",
      message: `Email duplicates line ${first} in this file.`,
    });
  }
  return issues;
}

/** Validates every row, then reports emails that already exist in the database. */
async function validateImport(
  db: Parameters<typeof customerQueries>[0],
  rows: readonly ImportRowInput[],
): Promise<{
  drafts: CustomerImportDraft[];
  issues: CustomerImportIssue[];
  existingEmails: Set<string>;
}> {
  const issues = withinFileIssues(rows);
  const drafts: CustomerImportDraft[] = [];
  for (const row of rows) {
    const result = readImportRow(row);
    issues.push(...result.issues);
    if (result.draft) drafts.push(result.draft);
  }

  const candidates = [...new Set(drafts.map((draft) => draft.email))];
  const existingEmails = await customerQueries(db).existingEmails(candidates);
  for (const draft of drafts) {
    if (existingEmails.has(draft.email)) {
      issues.push({
        lineNumber: draft.lineNumber,
        field: "email",
        message: "Email already belongs to an existing Customer.",
      });
    }
  }

  issues.sort((a, b) => a.lineNumber - b.lineNumber);
  return { drafts, issues, existingEmails };
}

function toCustomerInsert(draft: CustomerImportDraft) {
  const { lineNumber: _lineNumber, ...values } = draft;
  return { ...values, id: crypto.randomUUID() };
}

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

  /**
   * Validates every row and returns the bounded sample plus every issue by its
   * original line number. Writes nothing.
   */
  importPreview: protectedProcedure.input(customerImportInput).mutation(async ({ ctx, input }) => {
    const { drafts, issues } = await validateImport(ctx.db, input.rows);
    return {
      total: input.rows.length,
      sample: drafts.slice(0, PREVIEW_SAMPLE_ROWS),
      issues,
    };
  }),

  /**
   * Revalidates server-side and inserts only new Customers. A conflict that
   * appeared after preview (or a concurrent unique violation) returns the
   * affected line numbers with zero rows written.
   */
  importConfirm: protectedProcedure.input(customerImportInput).mutation(async ({ ctx, input }) => {
    const { drafts, issues, existingEmails } = await validateImport(ctx.db, input.rows);
    const conflictingLines = new Set(issues.map((issue) => issue.lineNumber));
    const databaseConflicts = drafts
      .filter((draft) => existingEmails.has(draft.email))
      .map((draft) => draft.lineNumber);

    if (issues.length === 0) {
      try {
        const { created } = await customerQueries(ctx.db).importMany(drafts.map(toCustomerInsert));
        if (created.length === drafts.length) return { ok: true as const, created: created.length };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // The unique index is the final race check: another writer stored one
        // of these emails between the lookup and the insert.
      }
    }

    for (const lineNumber of databaseConflicts) conflictingLines.add(lineNumber);
    return {
      ok: false as const,
      conflictLineNumbers: [...conflictingLines].sort((a, b) => a - b),
    };
  }),

  // Destructive: administrators only. Proves the role gate end to end (docs/adr/0003).
  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => customerQueries(ctx.db).remove(input.id)),

  stats: protectedProcedure.query(({ ctx }) => customerQueries(ctx.db).stats()),
});
