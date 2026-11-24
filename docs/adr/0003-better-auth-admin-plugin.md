# Authenticate with Better Auth's admin plugin, not a hand-rolled role column

Internal tools need to distinguish administrators from ordinary users within weeks, and they always grow user banning and impersonation. Better Auth 1.7 ships an `admin` plugin that adds `role`, `banned`, `banReason`, and `banExpires` to `user` and `impersonatedBy` to `session`.

Decided: enable the plugin in `packages/auth`, regenerate `packages/db/src/schema/auth.ts` with `bun run auth:generate`, expose `adminProcedure` in `packages/api`, and gate admin routes with a `_admin` guard in the web app.

## Considered Options

- **Hand-added `role` column**: the auth schema is generated, so the next `auth:generate` discards it.
- **No roles**: forces every consumer to retrofit guards into routes and procedures they already wrote.

## Consequences

Adding the plugin widens the `Session` type in `packages/auth`, which flows into the API context and every session read in the web app. The tenant model stays single-tenant: the `organization` plugin is deliberately not enabled.
