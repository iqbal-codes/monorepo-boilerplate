import { defineRelationsPart } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const assistantThreadStatus = pgEnum("assistant_thread_status", ["regular", "archived"]);

/**
 * Persisted Assistant Thread owned by a Better Auth user.
 */
export const assistantThread = pgTable(
  "assistant_thread",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    status: assistantThreadStatus("status").default("regular").notNull(),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("assistant_thread_user_updated_idx").on(table.userId, table.updatedAt)],
);

/**
 * Persisted message node in an Assistant Thread, stored via
 * `ThreadHistoryAdapter.withFormat` so AI SDK UIMessage branches round-trip cleanly.
 */
export const assistantMessage = pgTable(
  "assistant_message",
  {
    id: text("id").notNull(),
    threadId: text("thread_id")
      .notNull()
      .references(() => assistantThread.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    format: text("format").notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    seq: serial("seq").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.id] }),
    index("assistant_message_thread_seq_idx").on(table.threadId, table.seq),
  ],
);

export const assistantRelations = defineRelationsPart(
  { assistantThread, assistantMessage },
  (r) => ({
    assistantThread: {
      messages: r.many.assistantMessage({
        from: r.assistantThread.id,
        to: r.assistantMessage.threadId,
      }),
    },
    assistantMessage: {
      thread: r.one.assistantThread({
        from: r.assistantMessage.threadId,
        to: r.assistantThread.id,
      }),
    },
  }),
);

export type AssistantThread = typeof assistantThread.$inferSelect;
export type NewAssistantThread = typeof assistantThread.$inferInsert;
export type AssistantMessage = typeof assistantMessage.$inferSelect;
export type NewAssistantMessage = typeof assistantMessage.$inferInsert;
