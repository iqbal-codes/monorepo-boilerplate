# AGENTS.md

Project conventions for humans and agents working in this repository.

## What This Is

TypeScript monorepo built with Bun workspaces.

| Path | Contents |
| :--- | :--- |
| `apps/web` | React 19 + TanStack Router SPA, Vite+, PWA |
| `apps/server` | Hono API on Bun, tRPC router, Better Auth handler |
| `packages/ui` | Shared shadcn/ui primitives and Tailwind tokens |
| `packages/api` | tRPC procedures and context |
| `packages/auth` | Better Auth configuration |
| `packages/db` | Drizzle schema and client factory |
| `packages/config` | Shared TypeScript config |

Package names use the `@monorepo-boilerplate/*` scope. `bun run rename <name>` replaces it; do not hand-edit the scope across files.

## Setup

```bash
bun install          # also runs varlock codegen and scripts/env-init.ts
bun run db:start     # Postgres in Docker
bun run db:push
bun run dev          # web on :3001, server on :3000
```

`bun install`'s `postinstall` creates `apps/web/.env` and `apps/server/.env` from the committed `.env.example` files and generates a random `BETTER_AUTH_SECRET`. `.env` is ignored; never commit it. `.env.schema` files are the source of truth for each app's variables and are committed.

## Verification

Always run the narrowest command that exercises the change, then the repository gate:

```bash
bun run check-types   # tsc across all workspaces, plus a web build
bun run check         # vp format/lint checks and workspace type checks
```

`bun run check-types` is the repository-wide verification command. It runs `vp build` for `apps/web` before `tsc --noEmit`, so a passing run means the app compiles.

There is no test runner configured. Do not add one as a side effect of an unrelated change.

## Conventions

- TypeScript strict mode; no `any` in new code.
- Imports use the workspace scope (`@monorepo-boilerplate/ui/components/button`), not relative paths into `packages/`.
- `@/*` resolves to `apps/web/src/*` inside the web app.
- UI primitives live in `packages/ui`; app-specific blocks stay in `apps/web`. Add primitives with `npx shadcn@latest add <name> -c packages/ui`.
- Design tokens are in `packages/ui/src/styles/globals.css`.
- Formatting and linting go through Vite+ (`vp`). Do not introduce a second formatter or linter.
- Generated files are not committed: `apps/web/src/routeTree.gen.ts`, `apps/*/src/env.ts`, `packages/db/src/env.ts`.

## Environment and Services

- Bun 1.4.5 (`packageManager` in the root `package.json`).
- Postgres 18 via `docker compose` (`bun run db:start`). Compose reads `POSTGRES_DB` (default `app`) and `POSTGRES_PASSWORD` (default `password`), so two projects on one host do not collide.
- `DATABASE_URL` in `apps/server/.env` points at your database; the default matches the compose service.
- Varlock owns environment loading: `bunfig.toml` disables Bun's automatic `.env` loading. Run standalone Bun/Node tools from the owning app directory so they load that app's schema.

## Archon Factory

This repository is onboarded to the Archon Software Factory. `.archon/workflows/factory/` holds the `factory-slice` and `factory-refine` workflows; do not edit them in place — they are copied from `~/.archon/factory-pack/`.

- Maintainer allowlist: `.archon/sdlc/policy/maintainers.json`.
- Upsert an existing workflow file from the canonical pack instead of editing it here.
- Slice contracts declare `Owned / Allowed Paths` and a `Verification Command`; use `bun run check-types` unless the slice needs something narrower.
- Web UI slices that need browser checks use `.archon/ui-preview.sh`, which prints `URL=` and `PID=`.

## Pull Requests

- Branch from the default integration branch (`master`).
- Keep a PR to one cohesive change; put unrelated cleanup in its own PR.
- State the verification you actually ran. Do not claim checks you did not execute.
