import { and, asc, count, desc, eq, ilike, inArray, ne, or, sum, sql } from "drizzle-orm";

import type { Database } from "../index";
import {
  customer,
  customerEvent,
  type Customer,
  type CustomerEvent,
  type NewCustomer,
  type NewCustomerEvent,
} from "../schema/customer";

const sortableColumns = {
  name: customer.name,
  company: customer.company,
  status: customer.status,
  balanceMinor: customer.balanceMinor,
  createdAt: customer.createdAt,
} as const;

export type SortableColumn = keyof typeof sortableColumns;

export type CustomerEventActor = {
  id?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

/**
 * The list scope shared by `customers.list` and `customers.export`: what to
 * match and how to order it. Paging and selection are never part of an export.
 */
export type CustomerScopeQuery = {
  search?: string | undefined;
  status?: "all" | "active" | "inactive" | "archived" | undefined;
  sortBy?: SortableColumn | undefined;
  sortDir?: "asc" | "desc" | undefined;
};

export type CustomerListQuery = CustomerScopeQuery & {
  pageIndex: number;
  pageSize: number;
};

/**
 * Hard cap on exported Customers. `exportRows` reads one extra row so the API
 * can reject an over-limit export without a separate count query.
 */
export const CUSTOMER_EXPORT_LIMIT = 10_000;

export interface ImportManyResult {
  /** Inserted Customers, in input order. Empty whenever `conflictEmails` is non-empty. */
  created: Customer[];
  /**
   * Emails that were already stored (any status) when the transaction re-read
   * them, byte-exact. When this is non-empty the batch was a no-op.
   */
  conflictEmails: string[];
}

export interface CustomerQueries {
  list(query: CustomerListQuery): Promise<{ rows: Customer[]; rowCount: number }>;
  /**
   * One query over the shared scope, projected to the export columns and
   * ordered like the list. Returns at most `CUSTOMER_EXPORT_LIMIT + 1` rows so
   * the caller can detect an over-limit export.
   */
  exportRows(query: CustomerScopeQuery): Promise<CustomerExportRow[]>;
  byId(id: string): Promise<Customer | null>;
  create(values: NewCustomer, actor?: CustomerEventActor): Promise<Customer>;
  update(
    id: string,
    patch: Partial<NewCustomer>,
    actor?: CustomerEventActor,
  ): Promise<Customer | null>;
  archiveMany(
    ids: readonly string[],
    actor?: CustomerEventActor,
  ): Promise<{ count: number } | null>;
  remove(id: string): Promise<{ id: string }>;
  stats(): Promise<{ total: number; active: number; balanceMinor: number }>;
  /**
   * Every stored email that matches `emails` byte-for-byte. Archived Customers
   * are included: the unique index behind them still blocks a re-import.
   */
  existingEmails(emails: readonly string[]): Promise<Set<string>>;
  /**
   * Revalidates and inserts inside one transaction. All-or-nothing: if any input
   * email is already stored the transaction inserts nothing and names every
   * conflicting email, so an existing Customer is never updated and a partial
   * batch can never be committed.
   */
  importMany(rows: readonly NewCustomer[], actor?: CustomerEventActor): Promise<ImportManyResult>;
  listEvents(customerId: string): Promise<CustomerEvent[]>;
  addNote(
    input: { customerId: string; body: string },
    actor?: CustomerEventActor,
  ): Promise<CustomerEvent | null>;
  distinctTags(): Promise<string[]>;
}

/** Postgres unique-violation, raised by the `customer_email_unique` index. */
export const UNIQUE_VIOLATION = "23505";

/**
 * True for a Postgres unique violation. Drizzle wraps driver errors in a
 * `DrizzleQueryError`, so the SQLSTATE lives on `cause` (and can be nested more
 * than one level), not on the error the caller catches.
 */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function actorFields(actor?: CustomerEventActor) {
  return {
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? null,
    actorAvatarUrl: actor?.avatarUrl ?? null,
  };
}

function buildEvent(
  customerId: string,
  type: NewCustomerEvent["type"],
  summary: string,
  actor?: CustomerEventActor,
  extra?: { body?: string | null; metadata?: Record<string, unknown> | null },
): NewCustomerEvent {
  return {
    id: crypto.randomUUID(),
    customerId,
    type,
    ...actorFields(actor),
    summary,
    body: extra?.body ?? null,
    metadata: extra?.metadata ?? null,
  };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

const TRACKED_PROFILE_FIELDS = [
  "name",
  "email",
  "phone",
  "company",
  "balanceMinor",
  "currency",
  "notes",
] as const;

export type CustomerExportRow = {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: Customer["status"];
  /**
   * Exact decimal text from the database, not a JS number.
   *
   * `customer.balanceMinor` is a SQL `bigint`, which is wider than JavaScript's
   * safe integer range, and the number-mode codec would silently round anything
   * outside it. Projecting the column as text keeps the stored value exact, and
   * the API converts it only after a range check.
   */
  balanceMinor: string;
  currency: string;
  notes: string | null;
};

/**
 * Shared `where` for the list and the export, so the two criteria cannot drift.
 */
export function customerScopeWhere({
  search,
  status = "all",
}: Pick<CustomerScopeQuery, "search" | "status">) {
  const conditions = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(customer.name, pattern),
        ilike(customer.email, pattern),
        ilike(customer.company, pattern),
      ),
    );
  }
  conditions.push(status === "all" ? ne(customer.status, "archived") : eq(customer.status, status));
  return and(...conditions);
}

/**
 * Shared ordering for the list and the export. `customer.id` is the tie-break
 * that keeps paging and exports stable when the sort key repeats.
 */
export function customerScopeOrderBy({
  sortBy = "createdAt",
  sortDir = "desc",
}: Pick<CustomerScopeQuery, "sortBy" | "sortDir">) {
  const direction = sortDir === "asc" ? asc : desc;
  return [direction(sortableColumns[sortBy]), asc(customer.id)];
}

export function customerQueries(db: Database): CustomerQueries {
  return {
    async list({
      pageIndex,
      pageSize,
      search,
      status = "all",
      sortBy,
      sortDir,
    }: CustomerListQuery) {
      const where = customerScopeWhere({ search, status });
      const orderBy = customerScopeOrderBy({ sortBy, sortDir });

      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(customer)
          .where(where)
          .orderBy(...orderBy)
          .limit(pageSize)
          .offset(pageIndex * pageSize),
        db.select({ value: count() }).from(customer).where(where),
      ]);

      return { rows, rowCount: totals[0]?.value ?? 0 };
    },

    async exportRows({ search, status = "all", sortBy, sortDir }) {
      return db
        .select({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          company: customer.company,
          status: customer.status,
          balanceMinor: sql<string>`${customer.balanceMinor}::text`,
          currency: customer.currency,
          notes: customer.notes,
        })
        .from(customer)
        .where(customerScopeWhere({ search, status }))
        .orderBy(...customerScopeOrderBy({ sortBy, sortDir }))
        .limit(CUSTOMER_EXPORT_LIMIT + 1);
    },

    async byId(id: string) {
      const [row] = await db.select().from(customer).where(eq(customer.id, id)).limit(1);
      return row ?? null;
    },

    async create(values: NewCustomer, actor?: CustomerEventActor) {
      const normalizedValues: NewCustomer = {
        ...values,
        tags: normalizeTags(values.tags),
      };

      return db.transaction(async (tx) => {
        const [row] = await tx.insert(customer).values(normalizedValues).returning();
        if (!row) throw new Error("Customer insert returned no row");

        await tx.insert(customerEvent).values(
          buildEvent(row.id, "created", "Created customer", actor, {
            metadata: {
              status: row.status,
              ...(row.tags.length > 0 ? { tags: row.tags } : {}),
            },
          }),
        );

        return row;
      });
    },

    async update(id: string, patch: Partial<NewCustomer>, actor?: CustomerEventActor) {
      const normalizedPatch: Partial<NewCustomer> = {
        ...patch,
        ...(patch.tags !== undefined ? { tags: normalizeTags(patch.tags) } : {}),
      };

      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(customer)
          .where(eq(customer.id, id))
          .for("update");
        if (!existing) return null;

        const [updated] = await tx
          .update(customer)
          .set(normalizedPatch)
          .where(eq(customer.id, id))
          .returning();
        if (!updated) return null;

        const eventsToInsert: NewCustomerEvent[] = [];

        if (existing.avatarUrl !== updated.avatarUrl) {
          if (updated.avatarUrl === null) {
            eventsToInsert.push(
              buildEvent(id, "avatar_removed", "Removed avatar", actor, {
                metadata: { previousAvatarUrl: existing.avatarUrl },
              }),
            );
          } else {
            eventsToInsert.push(
              buildEvent(id, "avatar_updated", "Updated avatar", actor, {
                metadata: { avatarUrl: updated.avatarUrl },
              }),
            );
          }
        }

        let statusHandledByLifecycle = false;
        if (existing.status !== updated.status) {
          if (updated.status === "archived") {
            statusHandledByLifecycle = true;
            eventsToInsert.push(
              buildEvent(id, "archived", "Archived customer", actor, {
                metadata: { from: existing.status, to: "archived" },
              }),
            );
          } else if (existing.status === "archived") {
            statusHandledByLifecycle = true;
            eventsToInsert.push(
              buildEvent(id, "restored", `Restored customer as ${updated.status}`, actor, {
                metadata: { from: "archived", to: updated.status },
              }),
            );
          }
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const field of TRACKED_PROFILE_FIELDS) {
          if (existing[field] !== updated[field]) {
            changes[field] = { from: existing[field], to: updated[field] };
          }
        }
        if (!arraysEqual(existing.tags, updated.tags)) {
          changes.tags = { from: existing.tags, to: updated.tags };
        }
        if (!statusHandledByLifecycle && existing.status !== updated.status) {
          changes.status = { from: existing.status, to: updated.status };
        }

        if (Object.keys(changes).length > 0) {
          eventsToInsert.push(
            buildEvent(id, "updated", "Updated customer details", actor, {
              metadata: { changes },
            }),
          );
        }

        if (eventsToInsert.length > 0) {
          await tx.insert(customerEvent).values(eventsToInsert);
        }

        return updated;
      });
    },

    async archiveMany(ids, actor?: CustomerEventActor) {
      const distinct = [...new Set(ids)];
      return db.transaction(async (tx) => {
        // Lock in a consistent order so a concurrent delete or archive cannot
        // invalidate the existence check before this transaction commits.
        const rows = await tx
          .select({ id: customer.id, status: customer.status })
          .from(customer)
          .where(inArray(customer.id, distinct))
          .orderBy(asc(customer.id))
          .for("update");
        if (rows.length !== distinct.length) return null;

        const archivable = rows.filter((row) => row.status !== "archived");
        if (archivable.length > 0) {
          await tx
            .update(customer)
            .set({ status: "archived" })
            .where(and(inArray(customer.id, distinct), ne(customer.status, "archived")));

          await tx.insert(customerEvent).values(
            archivable.map((row) =>
              buildEvent(row.id, "archived", "Archived customer", actor, {
                metadata: { from: row.status, to: "archived" },
              }),
            ),
          );
        }

        return { count: distinct.length };
      });
    },

    async remove(id: string) {
      await db.delete(customer).where(eq(customer.id, id));
      return { id };
    },

    async stats() {
      const [totals] = await db
        .select({
          total: count(),
          active: count(sql`case when ${customer.status} = 'active' then 1 end`),
          balanceMinor: sum(customer.balanceMinor),
        })
        .from(customer);

      return {
        total: totals?.total ?? 0,
        active: totals?.active ?? 0,
        balanceMinor: Number(totals?.balanceMinor ?? 0),
      };
    },

    async existingEmails(emails) {
      if (emails.length === 0) return new Set<string>();
      const rows = await db
        .select({ email: customer.email })
        .from(customer)
        .where(inArray(customer.email, [...emails]));
      return new Set(rows.map((row) => row.email));
    },

    async importMany(rows, actor?: CustomerEventActor) {
      if (rows.length === 0) return { created: [], conflictEmails: [] };

      const emails = [...new Set(rows.map((row) => row.email))];
      const duplicatedInBatch = new Set(
        rows.map((row) => row.email).filter((email, index, all) => all.indexOf(email) !== index),
      );

      try {
        // One transaction: re-read the stored emails for this batch, then insert
        // all of it. Any conflict aborts before the INSERT runs, so the batch is
        // all-or-nothing and no existing Customer is touched.
        return await db.transaction(async (tx) => {
          const stored = await tx
            .select({ email: customer.email })
            .from(customer)
            .where(inArray(customer.email, emails))
            .orderBy(asc(customer.email))
            .for("update");
          if (stored.length > 0) {
            return { created: [], conflictEmails: stored.map((row) => row.email) };
          }

          const created = await tx
            .insert(customer)
            .values(rows.map((row) => ({ ...row, tags: normalizeTags(row.tags) })))
            .returning();

          if (created.length > 0) {
            await tx.insert(customerEvent).values(
              created.map((row) =>
                buildEvent(row.id, "created", "Imported customer", actor, {
                  metadata: { source: "import", status: row.status },
                }),
              ),
            );
          }

          return { created, conflictEmails: [] };
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // The unique index is the final race check: a competing writer committed
        // between the re-read and the INSERT, or the batch itself repeats an
        // email. The transaction rolled back, so report what is now stored plus
        // any email this batch repeated.
        const nowStored = await db
          .select({ email: customer.email })
          .from(customer)
          .where(inArray(customer.email, emails));
        const conflictEmails = new Set([
          ...duplicatedInBatch,
          ...nowStored.map((row) => row.email),
        ]);
        return { created: [], conflictEmails: [...conflictEmails] };
      }
    },

    async listEvents(customerId: string) {
      return db
        .select()
        .from(customerEvent)
        .where(eq(customerEvent.customerId, customerId))
        .orderBy(asc(customerEvent.createdAt), asc(customerEvent.seq));
    },

    async addNote({ customerId, body }, actor?: CustomerEventActor) {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: customer.id })
          .from(customer)
          .where(eq(customer.id, customerId))
          .limit(1);
        if (!existing) return null;

        const [event] = await tx
          .insert(customerEvent)
          .values(buildEvent(customerId, "note", "Added a note", actor, { body }))
          .returning();
        if (!event) throw new Error("Customer event insert returned no row");
        return event;
      });
    },

    async distinctTags() {
      const result = await db.execute<{ tag: string }>(
        sql`select distinct tag from ${customer}, unnest(${customer.tags}) as tag order by tag asc`,
      );
      return result.rows.map((row) => row.tag);
    },
  };
}
