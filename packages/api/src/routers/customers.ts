import {
  CUSTOMER_EXPORT_LIMIT,
  customerQueries,
  type CustomerListQuery,
} from "@monorepo-boilerplate/db/queries/customer";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { adminProcedure } from "../procedures";
import {
  confirmCustomerImport,
  reconcileCustomerImportStatus,
  validateImport,
} from "./customers-import";
import {
  CUSTOMER_EXPORT_COLUMNS,
  CUSTOMER_EXPORT_TOO_LARGE_MESSAGE,
  customerCreateInput,
  customerImportInput,
  customerImportStatusInput,
  customerListInput,
  customerScopeInput,
  customerUpdateInput,
  MAX_CUSTOMER_PAGE_SIZE,
  PREVIEW_SAMPLE_ROWS,
  toExportBalanceMinor,
} from "./customers.schemas";

export {
  CUSTOMER_EXPORT_COLUMNS,
  CUSTOMER_EXPORT_TOO_LARGE_MESSAGE,
  customerCreateInput,
  customerImportInput,
  customerImportRowInput,
  customerImportStatusInput,
  customerListInput,
  customerScopeInput,
  customerUpdateInput,
  storedAssetPathSchema,
  type CustomerScopeInput,
} from "./customers.schemas";
export {
  readImportRow,
  type CustomerImportDraft,
  type CustomerImportIssue,
} from "./customers-import";

function toActor(user: { id: string; name: string; image?: string | null }) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.image ?? null,
  };
}

export const customersRouter = router({
  list: protectedProcedure.input(customerListInput).query(({ ctx, input }) => {
    const query: CustomerListQuery = input;
    return customerQueries(ctx.db).list(query);
  }),

  tags: protectedProcedure.query(({ ctx }) => customerQueries(ctx.db).distinctTags()),

  events: router({
    list: protectedProcedure
      .input(z.object({ customerId: z.string().min(1) }))
      .query(({ ctx, input }) => customerQueries(ctx.db).listEvents(input.customerId)),

    addNote: protectedProcedure
      .input(
        z.object({
          customerId: z.string().min(1),
          body: z.string().trim().min(1, "Note cannot be empty.").max(2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const created = await customerQueries(ctx.db).addNote(input, toActor(ctx.session.user));
        if (!created) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Customer not found.",
          });
        }
        return created;
      }),
  }),

  /**
   * Opaque CSV payload for every Customer matching the list scope.
   *
   * Paging and selection are not inputs: an export is the whole filtered set.
   * The payload is UTF-8 JSON whose rows follow `CUSTOMER_EXPORT_COLUMNS`;
   * `balanceMinor` stays a JSON number so the worker never mistakes a negative
   * balance for formula-like text. The client generates the file in a worker so
   * neither the rows nor their stringification touch the main thread.
   *
   * The query projects the balance as exact decimal text and this procedure
   * range-checks it before any number conversion, so a stored value outside
   * JavaScript's safe integer range fails the export instead of rounding.
   */
  export: protectedProcedure.input(customerScopeInput).query(async ({ ctx, input }) => {
    const rows = await customerQueries(ctx.db).exportRows(input);
    if (rows.length > CUSTOMER_EXPORT_LIMIT) {
      throw new TRPCError({
        code: "PAYLOAD_TOO_LARGE",
        message: CUSTOMER_EXPORT_TOO_LARGE_MESSAGE,
      });
    }
    return JSON.stringify({
      headers: CUSTOMER_EXPORT_COLUMNS,
      rows: rows.map((row) =>
        CUSTOMER_EXPORT_COLUMNS.map((column) =>
          column === "balanceMinor" ? toExportBalanceMinor(row.balanceMinor) : row[column],
        ),
      ),
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => customerQueries(ctx.db).byId(input.id)),

  create: protectedProcedure.input(customerCreateInput).mutation(({ ctx, input }) => {
    return customerQueries(ctx.db).create(
      { ...input, id: crypto.randomUUID() },
      toActor(ctx.session.user),
    );
  }),

  update: protectedProcedure.input(customerUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    const updated = await customerQueries(ctx.db).update(id, patch, toActor(ctx.session.user));
    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Customer not found.",
      });
    }
    return updated;
  }),

  archiveMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(MAX_CUSTOMER_PAGE_SIZE) }))
    .mutation(async ({ ctx, input }) => {
      const archived = await customerQueries(ctx.db).archiveMany(
        input.ids,
        toActor(ctx.session.user),
      );
      if (!archived) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Some selected customers no longer exist.",
        });
      }
      return archived;
    }),

  /**
   * Validates every row and returns the bounded sample plus every issue by its
   * original line number. Writes nothing.
   */
  importPreview: protectedProcedure.input(customerImportInput).mutation(async ({ ctx, input }) => {
    const { drafts, issues } = await validateImport(ctx.db, input.rows);
    return {
      total: input.rows.length,
      sample: drafts.slice(0, PREVIEW_SAMPLE_ROWS),
      issues,
    };
  }),

  /**
   * Revalidates server-side and inserts only new Customers. A conflict that
   * appeared after preview (or a concurrent unique violation) returns the
   * affected line numbers with zero rows written. When `importId` is supplied,
   * repeated calls for the same user and `importId` replay the original
   * outcome so lost responses can be reconciled idempotently.
   */
  importConfirm: protectedProcedure.input(customerImportInput).mutation(({ ctx, input }) => {
    return confirmCustomerImport({
      db: ctx.db,
      userId: ctx.session.user.id,
      actor: toActor(ctx.session.user),
      rows: input.rows,
      importId: input.importId,
    });
  }),

  /**
   * Reconciles an import confirmation attempt after a lost response or
   * transport failure without writing any Customers.
   */
  importStatus: protectedProcedure.input(customerImportStatusInput).mutation(({ ctx, input }) => {
    return reconcileCustomerImportStatus({
      db: ctx.db,
      userId: ctx.session.user.id,
      importId: input.importId,
      emails: input.emails,
    });
  }),

  // Destructive: administrators only. Proves the role gate end to end (docs/adr/0003).
  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => customerQueries(ctx.db).remove(input.id)),

  stats: protectedProcedure.query(({ ctx }) => customerQueries(ctx.db).stats()),
});
