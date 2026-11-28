import {
  customerQueries,
  type CustomerEventActor,
} from "@monorepo-boilerplate/db/queries/customer";
import { z } from "zod";

import {
  customerCreateInput,
  customerImportRowInput,
  MAX_BALANCE_MINOR,
} from "./customers.schemas";

export type ImportConfirmOutcome =
  | { ok: true; created: number }
  | { ok: false; conflictLineNumbers: number[] };

const IMPORT_ID_TTL_MS = 15 * 60_000;
const MAX_COMPLETED_IMPORTS = 1_000;

const inFlightImports = new Map<string, Promise<ImportConfirmOutcome>>();
const completedImports = new Map<string, { result: ImportConfirmOutcome; expiresAt: number }>();

function getCompletedImport(key: string): ImportConfirmOutcome | null {
  const entry = completedImports.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    completedImports.delete(key);
    return null;
  }
  return entry.result;
}

function recordCompletedImport(key: string, result: ImportConfirmOutcome): void {
  const now = Date.now();
  for (const [entryKey, entry] of completedImports) {
    if (entry.expiresAt <= now) completedImports.delete(entryKey);
  }
  while (completedImports.size >= MAX_COMPLETED_IMPORTS) {
    const oldestKey = completedImports.keys().next().value;
    if (oldestKey === undefined) break;
    completedImports.delete(oldestKey);
  }
  completedImports.set(key, { result, expiresAt: now + IMPORT_ID_TTL_MS });
}

export type ImportRowInput = z.infer<typeof customerImportRowInput>;

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
export async function validateImport(
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

/**
 * Revalidates server-side, writes non-conflicting batches atomically, and
 * replays idempotent results by `(userId, importId)`.
 */
export async function confirmCustomerImport(opts: {
  db: Parameters<typeof customerQueries>[0];
  userId: string;
  actor: CustomerEventActor;
  rows: readonly ImportRowInput[];
  importId?: string;
}): Promise<ImportConfirmOutcome> {
  const attemptKey = opts.importId ? `${opts.userId}:${opts.importId}` : null;
  if (attemptKey) {
    const completed = getCompletedImport(attemptKey);
    if (completed) return completed;
    const inFlight = inFlightImports.get(attemptKey);
    if (inFlight) return await inFlight;
  }

  const execute = async (): Promise<ImportConfirmOutcome> => {
    const { drafts, issues, existingEmails } = await validateImport(opts.db, opts.rows);

    // Every issue already carries a line, so a row that failed validation is a
    // conflict line too. `existingEmails` is the pre-check view used for the
    // preview; it can be stale by the time the write runs.
    const conflictingLines = new Set(issues.map((issue) => issue.lineNumber));
    for (const draft of drafts) {
      if (existingEmails.has(draft.email)) conflictingLines.add(draft.lineNumber);
    }

    const linesFor = (emails: Iterable<string>) => {
      const wanted = new Set(emails);
      for (const draft of drafts) {
        if (wanted.has(draft.email)) conflictingLines.add(draft.lineNumber);
      }
      return [...conflictingLines].sort((a, b) => a - b);
    };

    if (issues.length === 0) {
      const { created, conflictEmails } = await customerQueries(opts.db).importMany(
        drafts.map(toCustomerInsert),
        opts.actor,
      );
      if (conflictEmails.length === 0 && created.length === drafts.length) {
        return { ok: true as const, created: created.length };
      }
      // Either the transaction's re-read or the unique index saw a conflict the
      // pre-check could not, and the batch rolled back in full.
      return { ok: false as const, conflictLineNumbers: linesFor(conflictEmails) };
    }

    return {
      ok: false as const,
      conflictLineNumbers: [...conflictingLines].sort((a, b) => a - b),
    };
  };

  if (!attemptKey) return await execute();

  const promise = execute().then((result) => {
    recordCompletedImport(attemptKey, result);
    return result;
  });
  inFlightImports.set(attemptKey, promise);
  try {
    return await promise;
  } finally {
    inFlightImports.delete(attemptKey);
  }
}

/**
 * Reconciles an import confirmation attempt after a lost response or transport
 * failure without writing any Customers.
 */
export async function reconcileCustomerImportStatus(opts: {
  db: Parameters<typeof customerQueries>[0];
  userId: string;
  importId: string;
  emails?: readonly string[];
}): Promise<
  | { status: "completed"; result: ImportConfirmOutcome }
  | { status: "ambiguous"; existingEmails: string[] }
  | { status: "not_found" }
> {
  const attemptKey = `${opts.userId}:${opts.importId}`;
  const inFlight = inFlightImports.get(attemptKey);
  if (inFlight) {
    return { status: "completed" as const, result: await inFlight };
  }
  const completed = getCompletedImport(attemptKey);
  if (completed) {
    return { status: "completed" as const, result: completed };
  }
  if (opts.emails && opts.emails.length > 0) {
    const existing = await customerQueries(opts.db).existingEmails([...opts.emails]);
    if (existing.size > 0) {
      return { status: "ambiguous" as const, existingEmails: [...existing] };
    }
  }
  return { status: "not_found" as const };
}
