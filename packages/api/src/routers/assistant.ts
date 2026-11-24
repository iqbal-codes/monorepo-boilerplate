import { TRPCError } from "@trpc/server";
import { assistantQueries } from "@monorepo-boilerplate/db/queries/assistant";
import { assistantThreadStatus } from "@monorepo-boilerplate/db/schema/assistant";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

export const assistantRouter = router({
  listThreads: protectedProcedure.query(({ ctx }) => {
    return assistantQueries(ctx.db).listThreads(ctx.session.user.id);
  }),

  getThread: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const thread = await assistantQueries(ctx.db).getThread(ctx.session.user.id, input.id);
      if (!thread) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant thread not found" });
      }
      return thread;
    }),

  createThread: protectedProcedure
    .input(
      z
        .object({
          id: z.string().min(1).max(128).optional(),
          externalId: z.string().min(1).max(128).optional(),
          title: z.string().trim().min(1).max(200).optional(),
        })
        .optional(),
    )
    .mutation(({ ctx, input }) => {
      return assistantQueries(ctx.db).createThread(ctx.session.user.id, input);
    }),

  renameThread: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await assistantQueries(ctx.db).renameThread(
        ctx.session.user.id,
        input.id,
        input.title,
      );
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant thread not found" });
      }
      return updated;
    }),

  setThreadStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.enum(assistantThreadStatus.enumValues),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await assistantQueries(ctx.db).setThreadStatus(
        ctx.session.user.id,
        input.id,
        input.status,
      );
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant thread not found" });
      }
      return updated;
    }),

  deleteThread: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await assistantQueries(ctx.db).deleteThread(ctx.session.user.id, input.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant thread not found" });
      }
      return deleted;
    }),

  listMessages: protectedProcedure
    .input(z.object({ threadId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const messages = await assistantQueries(ctx.db).listMessages(
        ctx.session.user.id,
        input.threadId,
      );
      if (!messages) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant thread not found" });
      }
      return messages;
    }),

  appendMessage: protectedProcedure
    .input(
      z.object({
        threadId: z.string().min(1),
        id: z.string().min(1).max(256),
        parentId: z.string().min(1).max(256).nullable(),
        format: z.string().min(1).max(64),
        content: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const saved = await assistantQueries(ctx.db).appendMessage(ctx.session.user.id, input);
      if (!saved) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assistant thread not found" });
      }
      return saved;
    }),
});
