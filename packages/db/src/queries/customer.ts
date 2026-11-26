import { and, asc, count, desc, eq, ilike, inArray, ne, or, sum, sql } from "drizzle-orm";

import type { Database } from "../index";
import { customer, type Customer, type NewCustomer } from "../schema/customer";

const sortableColumns = {
  name: customer.name,
  company: customer.company,
  status: customer.status,
  balanceMinor: customer.balanceMinor,
  createdAt: customer.createdAt,
} as const;

export type SortableColumn = keyof typeof sortableColumns;

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

export interface CustomerQueries {
  list(query: CustomerListQuery): Promise<{ rows: Customer[]; rowCount: number }>;
  /**
   * One query over the shared scope, projected to the export columns and
   * ordered like the list. Returns at most `CUSTOMER_EXPORT_LIMIT + 1` rows so
   * the caller can detect an over-limit export.
   */
  exportRows(query: CustomerScopeQuery): Promise<CustomerExportRow[]>;
  byId(id: string): Promise<Customer | null>;
  create(values: NewCustomer): Promise<Customer>;
  update(id: string, patch: Partial<NewCustomer>): Promise<Customer>;
  archiveMany(ids: readonly string[]): Promise<{ count: number } | null>;
  remove(id: string): Promise<{ id: string }>;
  stats(): Promise<{ total: number; active: number; balanceMinor: number }>;
}

export type CustomerExportRow = {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: Customer["status"];
  balanceMinor: number;
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
          balanceMinor: customer.balanceMinor,
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

    async create(values: NewCustomer) {
      const [row] = await db.insert(customer).values(values).returning();
      if (!row) throw new Error("Customer insert returned no row");
      return row;
    },

    async update(id: string, patch: Partial<NewCustomer>) {
      const [row] = await db.update(customer).set(patch).where(eq(customer.id, id)).returning();
      if (!row) throw new Error(`Customer ${id} not found`);
      return row;
    },

    async archiveMany(ids) {
      const distinct = [...new Set(ids)];
      return db.transaction(async (tx) => {
        // Lock in a consistent order so a concurrent delete or archive cannot
        // invalidate the existence check before this transaction commits.
        const rows = await tx
          .select({ id: customer.id })
          .from(customer)
          .where(inArray(customer.id, distinct))
          .orderBy(asc(customer.id))
          .for("update");
        if (rows.length !== distinct.length) return null;

        await tx
          .update(customer)
          .set({ status: "archived" })
          .where(and(inArray(customer.id, distinct), ne(customer.status, "archived")));
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
  };
}
