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

export type CustomerListQuery = {
  pageIndex: number;
  pageSize: number;
  search?: string | undefined;
  status?: "all" | "active" | "inactive" | "archived" | undefined;
  sortBy?: SortableColumn | undefined;
  sortDir?: "asc" | "desc" | undefined;
};

export interface CustomerQueries {
  list(query: CustomerListQuery): Promise<{ rows: Customer[]; rowCount: number }>;
  byId(id: string): Promise<Customer | null>;
  create(values: NewCustomer): Promise<Customer>;
  update(id: string, patch: Partial<NewCustomer>): Promise<Customer>;
  archiveMany(ids: readonly string[]): Promise<{ count: number } | null>;
  remove(id: string): Promise<{ id: string }>;
  stats(): Promise<{ total: number; active: number; balanceMinor: number }>;
}

export function customerQueries(db: Database): CustomerQueries {
  return {
    async list({
      pageIndex,
      pageSize,
      search,
      status = "all",
      sortBy = "createdAt",
      sortDir = "desc",
    }: CustomerListQuery) {
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
      conditions.push(
        status === "all" ? ne(customer.status, "archived") : eq(customer.status, status),
      );
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const direction = sortDir === "asc" ? asc : desc;

      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(customer)
          .where(where)
          .orderBy(direction(sortableColumns[sortBy]), asc(customer.id))
          .limit(pageSize)
          .offset(pageIndex * pageSize),
        db.select({ value: count() }).from(customer).where(where),
      ]);

      return { rows, rowCount: totals[0]?.value ?? 0 };
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
