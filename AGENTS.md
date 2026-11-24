# AGENTS.md

TypeScript monorepo on Bun workspaces. Package scope: `@monorepo-boilerplate`.

| Path               | Holds                                                    |
| :----------------- | :------------------------------------------------------- |
| `apps/web`         | React 19 + TanStack Router SPA, Vite+, PWA               |
| `apps/server`      | Hono: Better Auth at `/api/auth/*`, tRPC at `/trpc/*`    |
| `packages/ui`      | shadcn/ui primitives and Tailwind tokens                 |
| `packages/api`     | tRPC procedures and context                              |
| `packages/auth`    | Better Auth factory: `createAuth(env, db)`, admin plugin |
| `packages/db`      | Drizzle schema, queries, seed, client factory            |
| `packages/storage` | Upload `StorageAdapter` seam and local-disk adapter      |
| `packages/config`  | Shared `tsconfig.base.json`                              |

Business logic lives in `packages/*`; `apps/server` only wires it. `bun run rename <name>` is the only supported way to change the scope and project name.

## Bootstrap

```bash
bun install      # postinstall writes apps/*/.env from .env.example, generates BETTER_AUTH_SECRET
bun run db:start # Postgres 18 in Docker
bun run db:push  # apply packages/db schema to it
bun run db:seed  # 53 deterministic customers for the reference flow
bun run dev      # web :3001, server :3000
```

`postinstall` never overwrites an existing `.env`. `.env.schema` is the committed source of truth per app; regenerate the `src/env.ts` types with `bun run env:generate` after editing one. Compose publishes Postgres on a fixed 5432, so one checkout per host can run it.

Varlock owns env loading (`bunfig.toml` sets `env = false`). Run standalone Bun/Node tools from the owning app directory so they load that app's schema.

## Verification

**Gate:** `bun run check-types` — `vp build` for `apps/web`, then `tsc --noEmit` in every workspace. Passing means the app compiles. A slice's Verification Command is `bun run check-types` unless the slice needs something narrower.

`bun run check` is the gate plus `vp` format and lint over the whole tree; files outside your change are already unformatted there, so scope it to your paths: `bunx --bun vp check <paths>`.

No workspace defines a `test` script. The only tests belong to the factory harness; run them with an explicit `./` path (Bun treats a bare path as a name filter):

```bash
bun test ./.archon/workflows/factory/.shared ./.archon/workflows/factory/factory-slice/scripts
```

13 tests cover contract parsing, PR formatting, and the mechanical gate — keep them green when touching those files.

## Interface tiers

Three tiers, defined in `GLOSSARY.md` and enforced by imports:

| Tier      | Lives in                                                                                                              | Knows about                         |
| :-------- | :-------------------------------------------------------------------------------------------------------------------- | :---------------------------------- |
| Primitive | `packages/ui/src/components/*` (shadcn atoms)                                                                         | its own accessibility semantics     |
| Block     | `packages/ui/src/components/{data-table,page-header,kpi-card,chart-card,form,upload-dropzone}` | no domain, no router, no URL state  |
| Screen    | `apps/web/src/routes`, `apps/web/src/components/<domain>`                                                             | domain, tRPC, nuqs, columns, fields |

- The App Shell follows shadcn's official `sidebar-07` block, adapted in `apps/web/src/components/{app-sidebar,app-topbar}.tsx` + `components/sidebar/{nav-main,nav-shortcuts,nav-user}.tsx`. Deliberate adaptations: no `TeamSwitcher` (single-tenant, ADR 0003), real session instead of sample data, typed router links instead of `<a href="#">`. To re-sync with upstream: `npx shadcn@latest add sidebar-07` into a scratch app and diff.
- Blocks are **controlled and router-free**. `DataTable` takes pagination/sorting props and never reads the URL; `apps/web/src/lib/use-data-table-search-params.ts` is the only bridge from nuqs to it (docs/adr/0002).
- `packages/ui` does not import `nuqs`, TanStack Router, or tRPC. If a block needs navigation, it takes a `renderLink` callback.
- Zustand holds UI preferences only (`apps/web/src/lib/ui-prefs-store.ts`). Server data belongs in TanStack Query, list parameters in the URL, form state in TanStack Form.
- Uploaded files are stored as provider-relative paths and resolved by `apps/web/src/lib/asset-url.ts` at render time (docs/adr/0004).

## Reference flow and demo routes

The Customers flow (list → drawer form → detail → avatar upload) is permanent and must keep compiling and working. `_auth/demo/fields` and `_auth/demo/blocks` only exhibit blocks and may be deleted with `rm -rf apps/web/src/routes/_auth/demo`.

`bun run db:seed` writes 53 idempotent customers; row counts feed the pagination-boundary screenshots.

## Conventions

- No `any` in new code; narrow `unknown` instead.
- Import across packages by workspace scope (`@monorepo-boilerplate/ui/components/button`); `@/*` is `apps/web/src/*`.
- Shared primitives go in `packages/ui` (`npx shadcn@latest add <name> -c packages/ui`); app-specific blocks stay in `apps/web`. Tokens: `packages/ui/src/styles/globals.css`.
- Web routes are file-based under `apps/web/src/routes/`; `routeTree.gen.ts` regenerates on dev and build.
- `packages/db/src/schema/auth.ts` is generated by `bun run auth:generate` and committed — rerun it after changing auth plugins or schema options. The `admin` plugin is enabled (`role`, `banned`, `banExpires`, `session.impersonatedBy`); use `adminProcedure` from `packages/api/src/procedures.ts`.
- `@tanstack/react-table` is pinned at **v9.3.1**: `useTable` + explicit `tableFeatures(...)`, not `useReactTable`. Read the header comment in `data-table.tsx` before copying v8 examples.
- Money crosses every boundary as an integer number of currency minor units plus an ISO code; format with `packages/ui/src/lib/format.ts`, never `toLocaleString`.
- `packages/db/src/migrations/` starts empty, so `db:push` is the schema path; `db:generate`/`db:migrate` apply once migration files exist.

## Archon Factory

`.archon/workflows/factory/` holds `factory-slice`, `factory-refine`, and `factory-learn`, copied from `~/.archon/factory-pack/`; upsert from that pack to change one.

- Slice contracts declare **Owned / Allowed Paths** and a **Verification Command**.
- Web UI slices that need browser checks use `.archon/ui-preview.sh`: it serves a free port in 4100–4199 and prints `URL=` and `PID=`.

## Pull Requests

Branch from `master`. State the verification you ran; do not claim checks you did not execute.
