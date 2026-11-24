import { TRPCError } from "@trpc/server";

import { protectedProcedure } from "./index";

/**
 * Requires an authenticated session whose user role is `admin`.
 *
 * Roles come from Better Auth's `admin` plugin (see docs/adr/0003). A user with
 * no role is an ordinary user; `admin` is the only privileged role the template
 * defines.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.session.user.role;
  if (role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator role required",
      cause: "Insufficient role",
    });
  }
  return next({ ctx });
});

export const isAdmin = (role: string | null | undefined): boolean => role === "admin";
