# Authenticate with Better Auth's admin plugin, not a hand-rolled role column

Internal tools need to distinguish administrators from ordinary users within weeks, and they always grow user banning and impersonation. Better Auth 1.7 ships an `admin` plugin that adds `role`, `banned`, `banReason`, and `banExpires` to `user` and `impersonatedBy` to `session`.

Decided: enable the plugin in `packages/auth`, regenerate `packages/db/src/schema/auth.ts` with `bun run auth:generate`, expose `adminProcedure` in `packages/api`, and gate admin routes with a `_admin` guard in the web app.

## Considered Options

- **Hand-added `role` column**: the auth schema is generated, so the next `auth:generate` discards it.
- **No roles**: forces every consumer to retrofit guards into routes and procedures they already wrote.

## Consequences

Adding the plugin widens the `Session` type in `packages/auth`, which flows into the API context and every session read in the web app. The tenant model stays single-tenant: the `organization` plugin is deliberately not enabled.

## Runtime Session & Impersonation Gotchas (Better Auth 1.7)

Client code reading `authClient.useSession()` or calling `authClient.admin.stopImpersonating()` must account for these runtime behaviors without re-deriving them from `node_modules/better-auth`:

- **Expired/signed-out session returns `200` with `null`:** Treat a settled `null` response (`!isPending && !error`) as authoritative absence, never falling back to a route-seeded `initialSession`.
- **`refetch()` clears `error` when retry begins:** Better Auth clears the previous `401` error on retry (`client/query.mjs`), so latch `401` like settled `null` until a fresh non-null session arrives; otherwise `401 → Retry → 500` resurrects stale impersonation banners.
- **`stopImpersonating()` returns the restored admin identity directly:** Reset identity-bound client state (query cache and `<AssistantProvider>` subtree) immediately from the successful Stop response _before_ awaiting `refetch()`, `router.invalidate()`, or `window.location.reload()` (which a stalled GET or cancelled `beforeunload` can delay or abort).
