/**
 * The only place the Customers file contract lives.
 *
 * Declares the eight template columns in order, the blank-cell defaults, the row
 * rules derived from `customerCreateInput` (without `avatarUrl`, with `status`
 * narrowed to the two importable values), and bridges the two tRPC procedures
 * while preserving each record's original `lineNumber`.
 *
 * The rules here are the creation API's rules restated for the browser: they
 * cannot be imported from `@monorepo-boilerplate/api` without pulling the server
 * router (and its database queries) into the client bundle. The server
 * revalidates every row against the owning schema, so a drift here can only cost
 * a round trip, never a bad write.
 */
import {
  ImportBlock,
  type ImportConfirmResult,
  type ImportIssue,
  type ImportRecord,
} from "@monorepo-boilerplate/ui/components/import-block";
import { z } from "zod";

import { trpcClient } from "@/utils/trpc";

const IMPORT_STATUSES = ["active", "inactive"] as const;

const MAX_BALANCE_MINOR = 9_007_199_254_740_991;

/** Optional `-` followed by digits: no separators, decimal point, or exponent. */
const BALANCE_PATTERN = /^-?\d+$/;

const emailSchema = z.email();

export const CUSTOMER_IMPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "company",
  "status",
  "balanceMinor",
  "currency",
  "notes",
] as const;

export const CUSTOMER_IMPORT_DEFAULTS = {
  status: "active",
  balanceMinor: "0",
  currency: "USD",
} as const;

export const CUSTOMER_IMPORT_FILENAME = "customers-template.csv";

function optionalText(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Applies the creation rules to every parsed record, keyed by the record's
 * original line. Balances are never coerced or rounded: an ambiguous amount is
 * rejected so nobody imports an amount they did not type.
 *
 * Phone deliberately has no E.164 refinement (`customer-form-drawer.tsx` adds
 * one); the import contract is the creation API, which bounds `phone` to a
 * trimmed 40-character string.
 */
export function validateCustomerImportRows(records: readonly ImportRecord[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const firstLineByEmail = new Map<string, number>();

  for (const record of records) {
    const { lineNumber, values } = record;
    const fail = (field: string, message: string) => issues.push({ lineNumber, field, message });

    const name = (values.name ?? "").trim();
    if (name === "") fail("name", "Name is required.");
    else if (name.length > 200) fail("name", "Name must be 200 characters or fewer.");

    const email = (values.email ?? "").trim();
    if (email === "") {
      fail("email", "Email is required.");
    } else if (email.length > 320) {
      fail("email", "Email must be 320 characters or fewer.");
    } else if (!emailSchema.safeParse(email).success) {
      fail("email", "Enter a valid email address.");
    } else {
      const first = firstLineByEmail.get(email);
      if (first === undefined) firstLineByEmail.set(email, lineNumber);
      else fail("email", `Email duplicates line ${first} in this file.`);
    }

    const phone = optionalText(values.phone);
    if (phone !== undefined && phone.length > 40) {
      fail("phone", "Phone must be 40 characters or fewer.");
    }

    const company = optionalText(values.company);
    if (company !== undefined && company.length > 200) {
      fail("company", "Company must be 200 characters or fewer.");
    }

    const status = (values.status ?? "").trim();
    if (!IMPORT_STATUSES.includes(status as (typeof IMPORT_STATUSES)[number])) {
      fail("status", "Status must be active or inactive.");
    }

    const balance = (values.balanceMinor ?? "").trim();
    if (!BALANCE_PATTERN.test(balance)) {
      fail(
        "balanceMinor",
        "Balance must be a whole number in minor units, with an optional leading minus sign.",
      );
    } else {
      const balanceMinor = Number(balance);
      if (!Number.isSafeInteger(balanceMinor) || Math.abs(balanceMinor) > MAX_BALANCE_MINOR) {
        fail(
          "balanceMinor",
          `Balance must be between -${MAX_BALANCE_MINOR} and ${MAX_BALANCE_MINOR} minor units.`,
        );
      }
    }

    if ((values.currency ?? "").trim().length !== 3) {
      fail("currency", "Currency must be exactly three characters.");
    }

    if ((values.notes ?? "").length > 2000) {
      fail("notes", "Notes must be 2000 characters or fewer.");
    }
  }

  return issues;
}

function toProcedureRows(records: readonly ImportRecord[]) {
  return records.map((record) => ({
    lineNumber: record.lineNumber,
    values: {
      name: record.values.name ?? "",
      email: record.values.email ?? "",
      phone: record.values.phone ?? "",
      company: record.values.company ?? "",
      status: record.values.status ?? "",
      balanceMinor: record.values.balanceMinor ?? "",
      currency: record.values.currency ?? "",
      notes: record.values.notes ?? "",
    },
  }));
}

export function CustomerImport({
  onImported,
  triggerLabel = "Import CSV",
  size,
  className,
  open,
  onOpenChange,
  hideTrigger,
}: {
  /** Called with the created count once the batch is stored. */
  onImported: (created: number) => void;
  triggerLabel?: string;
  size?: "default" | "sm";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  return (
    <ImportBlock
      contract={{ columns: CUSTOMER_IMPORT_COLUMNS, filename: CUSTOMER_IMPORT_FILENAME }}
      defaults={CUSTOMER_IMPORT_DEFAULTS}
      triggerLabel={triggerLabel}
      size={size}
      className={className}
      open={open}
      onOpenChange={onOpenChange}
      hideTrigger={hideTrigger}
      validate={async (records) => {
        // Field rules are local, so a broken row is reported without a request.
        // Only a locally clean file asks the API about saved Customers, which
        // keeps one owner per issue instead of duplicating every message.
        const local = validateCustomerImportRows(records);
        if (local.length > 0) return local;

        const preview = await trpcClient.customers.importPreview.mutate({
          rows: toProcedureRows(records),
        });
        return preview.issues;
      }}
      confirm={async (records): Promise<ImportConfirmResult> => {
        const result = await trpcClient.customers.importConfirm.mutate({
          rows: toProcedureRows(records),
        });
        if (!result.ok) return { ok: false, conflictLineNumbers: result.conflictLineNumbers };
        onImported(result.created);
        return { ok: true, created: result.created };
      }}
    />
  );
}
