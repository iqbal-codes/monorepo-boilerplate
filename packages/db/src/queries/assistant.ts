import { and, asc, desc, eq } from "drizzle-orm";

import type { Database } from "../index";
import {
  assistantMessage,
  assistantThread,
  type AssistantMessage,
  type AssistantThread,
} from "../schema/assistant";

export interface AssistantQueries {
  listThreads(userId: string): Promise<AssistantThread[]>;
  getThread(userId: string, threadId: string): Promise<AssistantThread | null>;
  createThread(
    userId: string,
    input?: { id?: string; externalId?: string; title?: string },
  ): Promise<AssistantThread>;
  renameThread(userId: string, threadId: string, title: string): Promise<AssistantThread | null>;
  setThreadStatus(
    userId: string,
    threadId: string,
    status: "regular" | "archived",
  ): Promise<AssistantThread | null>;
  deleteThread(userId: string, threadId: string): Promise<{ id: string } | null>;
  listMessages(userId: string, threadId: string): Promise<AssistantMessage[] | null>;
  appendMessage(
    userId: string,
    input: {
      threadId: string;
      id: string;
      parentId: string | null;
      format: string;
      content: unknown;
    },
  ): Promise<AssistantMessage | null>;
}

export function assistantQueries(db: Database): AssistantQueries {
  return {
    async listThreads(userId: string) {
      return db
        .select()
        .from(assistantThread)
        .where(eq(assistantThread.userId, userId))
        .orderBy(desc(assistantThread.updatedAt));
    },

    async getThread(userId: string, threadId: string) {
      const [row] = await db
        .select()
        .from(assistantThread)
        .where(and(eq(assistantThread.id, threadId), eq(assistantThread.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async createThread(
      userId: string,
      input?: { id?: string; externalId?: string; title?: string },
    ) {
      const id = input?.id ?? crypto.randomUUID();
      await db
        .insert(assistantThread)
        .values({
          id,
          userId,
          title: input?.title ?? null,
          externalId: input?.externalId ?? null,
          status: "regular",
        })
        .onConflictDoNothing({ target: assistantThread.id });

      const [existing] = await db
        .select()
        .from(assistantThread)
        .where(and(eq(assistantThread.id, id), eq(assistantThread.userId, userId)))
        .limit(1);

      if (!existing) {
        throw new Error(`Assistant thread ${id} is unavailable for this user`);
      }
      return existing;
    },

    async renameThread(userId: string, threadId: string, title: string) {
      const [row] = await db
        .update(assistantThread)
        .set({ title })
        .where(and(eq(assistantThread.id, threadId), eq(assistantThread.userId, userId)))
        .returning();
      return row ?? null;
    },

    async setThreadStatus(userId: string, threadId: string, status: "regular" | "archived") {
      const [row] = await db
        .update(assistantThread)
        .set({ status })
        .where(and(eq(assistantThread.id, threadId), eq(assistantThread.userId, userId)))
        .returning();
      return row ?? null;
    },

    async deleteThread(userId: string, threadId: string) {
      const [row] = await db
        .delete(assistantThread)
        .where(and(eq(assistantThread.id, threadId), eq(assistantThread.userId, userId)))
        .returning({ id: assistantThread.id });
      return row ?? null;
    },

    async listMessages(userId: string, threadId: string) {
      const thread = await this.getThread(userId, threadId);
      if (!thread) return null;

      return db
        .select()
        .from(assistantMessage)
        .where(eq(assistantMessage.threadId, threadId))
        .orderBy(asc(assistantMessage.seq));
    },

    async appendMessage(userId, input) {
      const thread = await this.getThread(userId, input.threadId);
      if (!thread) return null;

      const [row] = await db
        .insert(assistantMessage)
        .values({
          id: input.id,
          threadId: input.threadId,
          parentId: input.parentId,
          format: input.format,
          content: input.content,
        })
        .onConflictDoUpdate({
          target: [assistantMessage.threadId, assistantMessage.id],
          set: {
            parentId: input.parentId,
            format: input.format,
            content: input.content,
          },
        })
        .returning();

      await db
        .update(assistantThread)
        .set({ updatedAt: new Date() })
        .where(eq(assistantThread.id, input.threadId));

      return row ?? null;
    },
  };
}
