import { defineRelationsPart } from "drizzle-orm";
import { bigint, char, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const customerStatus = pgEnum("customer_status", ["active", "inactive", "archived"]);

/**
 * Reference domain for the template. Money is stored as an integer number of
 * currency minor units (see GLOSSARY.md) so no boundary ever does float math.
 */
export const customer = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    company: text("company"),
    status: customerStatus("status").default("active").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).default(0).notNull(),
    currency: char("currency", { length: 3 }).default("USD").notNull(),
    avatarUrl: text("avatar_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("customer_name_idx").on(table.name),
    index("customer_created_at_idx").on(table.createdAt),
  ],
);

export const customerRelations = defineRelationsPart({ customer }, () => ({}));

export type Customer = typeof customer.$inferSelect;
export type NewCustomer = typeof customer.$inferInsert;
