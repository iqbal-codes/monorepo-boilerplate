import { defineRelationsPart, sql } from "drizzle-orm";
import {
  bigint,
  char,
  index,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const customerStatus = pgEnum("customer_status", ["active", "inactive", "archived"]);

export const customerEventType = pgEnum("customer_event_type", [
  "created",
  "updated",
  "archived",
  "restored",
  "avatar_updated",
  "avatar_removed",
  "note",
]);

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
    tags: text("tags")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
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

/**
 * Chronological audit & comment log for a Customer record.
 * Actor metadata is snapshotted so audit entries remain intact across user edits
 * or caller fixtures without requiring a hard foreign key to `user`.
 */
export const customerEvent = pgTable(
  "customer_event",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    type: customerEventType("type").notNull(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    actorAvatarUrl: text("actor_avatar_url"),
    summary: text("summary").notNull(),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    seq: serial("seq").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("customer_event_customer_created_idx").on(table.customerId, table.createdAt, table.seq),
  ],
);

export const customerRelations = defineRelationsPart({ customer, customerEvent }, (r) => ({
  customer: {
    events: r.many.customerEvent({
      from: r.customer.id,
      to: r.customerEvent.customerId,
    }),
  },
  customerEvent: {
    customer: r.one.customer({
      from: r.customerEvent.customerId,
      to: r.customer.id,
    }),
  },
}));

export type Customer = typeof customer.$inferSelect;
export type NewCustomer = typeof customer.$inferInsert;
export type CustomerEvent = typeof customerEvent.$inferSelect;
export type NewCustomerEvent = typeof customerEvent.$inferInsert;
export type CustomerEventType = (typeof customerEventType.enumValues)[number];
