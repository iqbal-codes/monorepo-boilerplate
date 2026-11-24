import { TRPCError } from "@trpc/server";
import { customerQueries, type CustomerListQuery } from "@monorepo-boilerplate/db/queries/customer";
import { customerStatus } from "@monorepo-boilerplate/db/schema/customer";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { adminProcedure } from "../procedures";

const MAX_CUSTOMER_PAGE_SIZE = 100;

export const customerListInput = z.object({
  pageIndex: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(MAX_CUSTOMER_PAGE_SIZE).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(["all", "active", "inactive", "archived"]).default("all"),
  sortBy: z.enum(["name", "company", "status", "balanceMinor", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const customerCreateInput = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(200).optional(),
  status: z.enum(customerStatus.enumValues).default("active"),
  balanceMinor: z.number().int().min(-9_007_199_254_740_991).max(9_007_199_254_740_991),
  currency: z.string().length(3).default("USD"),
  notes: z.string().max(2000).optional(),
  avatarUrl: z.string().max(2048).optional(),
});

export const customerUpdateInput = customerCreateInput.partial().extend({
  id: z.string().min(1),
});

export const customersRouter = router({
  list: protectedProcedure.input(customerListInput).query(({ ctx, input }) => {
    const query: CustomerListQuery = input;
    return customerQueries(ctx.db).list(query);
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => customerQueries(ctx.db).byId(input.id)),

  create: protectedProcedure.input(customerCreateInput).mutation(({ ctx, input }) => {
    return customerQueries(ctx.db).create({ ...input, id: crypto.randomUUID() });
  }),

  update: protectedProcedure.input(customerUpdateInput).mutation(({ ctx, input }) => {
    const { id, ...patch } = input;
    return customerQueries(ctx.db).update(id, patch);
  }),

  archiveMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(MAX_CUSTOMER_PAGE_SIZE) }))
    .mutation(async ({ ctx, input }) => {
      const archived = await customerQueries(ctx.db).archiveMany(input.ids);
      if (!archived) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some selected customers no longer exist.",
        });
      }
      return archived;
    }),

  // Destructive: administrators only. Proves the role gate end to end (docs/adr/0003).
  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => customerQueries(ctx.db).remove(input.id)),

  stats: protectedProcedure.query(({ ctx }) => customerQueries(ctx.db).stats()),
});
