# monorepo-boilerplate

TypeScript monorepo: React + TanStack Router web app, Hono + tRPC server, Drizzle on Postgres, Better Auth, shadcn/ui primitives in `packages/ui`.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **PWA** - Progressive Web App support
- **Vite+** - Unified Vite toolchain, workspace task runner, linting, and formatting

## What ships for internal / admin tools

The template is aimed at internal tools, so it ships a shell, reusable blocks, and one working reference flow rather than a pile of components:

| Tier       | Where                        | Contents                                                                                                                                          |
| :--------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primitives | `packages/ui/src/components` | 60+ shadcn/ui atoms (base-sera style)                                                                                                             |
| Blocks     | `packages/ui/src/components` | `data-table`, `list-toolbar`, `bulk-action-bar`, `confirmation-dialog`, `page-header`, `kpi-card`, `chart-card`, `form-fields`, `upload-dropzone` |
| Screens    | `apps/web/src/routes`        | Dashboard, Customers, Customer detail, Settings, login                                                                                            |

The App Shell follows shadcn's official `sidebar-07` block (collapsible sidebar with sub-items, header breadcrumbs, user menu), adapted for a single-tenant app with real sessions and typed router links.

Blocks are controlled and router-free: `DataTable` takes pagination and sorting props and never reads the URL, so `packages/ui` does not depend on nuqs, TanStack Router, or tRPC.

**The stack per concern**, so nothing overlaps:

| Concern                    | Library                                                              |
| :------------------------- | :------------------------------------------------------------------- |
| API calls and server cache | TanStack Query over tRPC (`createTRPCOptionsProxy`)                  |
| List state in the URL      | `nuqs` (`use-data-table-search-params.ts` bridges it to `DataTable`) |
| Form state and validation  | TanStack Form + zod                                                  |
| Tables                     | TanStack Table **v9.3.1**, pinned exactly                            |
| Cross-route UI preferences | `zustand` with `persist`                                             |

**DataTable** supports server-driven mode (the Customers screen: the API sorts, filters, and pages) and client-driven mode (`_auth/demo/blocks`: the block sorts an in-memory array). Both use one component with `manualPagination` / `manualSorting`.

**Bulk Actions:** Combine `ListToolbar`, optional page-scoped `DataTable` selection, `BulkActionBar`, and `ConfirmationDialog`. Customers owns search, filters, selection, and the mutation. Archive keeps customer records and attachments and hides them from the default list; use the Archived filter and choose Active or Inactive in the edit drawer to restore one customer.

To run the Customers archive integration tests, apply the schema to a disposable Postgres database with `DATABASE_URL=<test-url> bun run db:push`, then run `CUSTOMERS_TEST_DATABASE_URL=<test-url> bun test ./packages/api/src/routers/customers.integration.test.ts`. Never point this suite at a persistent database.

**Forms** ship as typed fields over TanStack Form: text (with counter), number with unit, currency (edits major units, stores integer minor units), textarea, plus an upload dropzone with preview, progress, and cancellation.

**Money** is always an integer count of currency minor units plus an ISO code; `packages/ui/src/lib/format.ts` is the only formatter, with locale and currency injected.

**Uploads** post to the server's `POST /uploads`, which writes through a `StorageAdapter` seam (`packages/storage`) and serves and stores provider-relative paths. Swap in S3 by implementing the interface; screens only pass an `upload` callback.

**Auth** is Better Auth with the `admin` plugin enabled: `role`, `banned`, `banExpires`, and session impersonation are available, with `adminProcedure` in `packages/api/src/procedures.ts` for gated procedures.

## Getting Started

### New project from this template

```bash
bun create iqbal-codes/monorepo-boilerplate my-app
cd my-app
bun run rename my-app   # optional: replace the template scope and name
bun run setup           # env files, Postgres in Docker, schema push, 53 seed customers
bun run dev
```

`bun create` downloads a tarball, so there is no upstream history and no remote to reset. It runs `bun install`, which creates `apps/web/.env` and `apps/server/.env` from the committed `.env.example` files and generates a random `BETTER_AUTH_SECRET`. Nothing else is required to type-check.

`bun run rename <name>` replaces the `@monorepo-boilerplate` package scope, the root package name, page titles, and the PWA manifest. `bun run rename @acme` changes only the scope.

### Working in this repository

```bash
bun install
bun run setup   # idempotent: safe to re-run after schema changes
bun run dev
```

`bun run setup` is the one-shot local bootstrap: it creates missing env files, starts the bundled Postgres, waits for its healthcheck, applies the Drizzle schema, and seeds the reference flow. Nothing is interactive on a fresh database.

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Start the bundled Postgres: `bun run setup` does this and the remaining steps in one go (or point `DATABASE_URL` in `apps/server/.env` at your own database and run the steps below manually).
2. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Extend a **block** when you need a new composition (a table variant, an upload transport, a dashboard widget) — do not reach for a new primitive unless the control itself is missing. See `GLOSSARY.md` for the Primitive / Block / Screen vocabulary and `docs/adr/` for the boundaries that are deliberate (why `DataTable` never reads the URL, why asset paths are relative).

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@monorepo-boilerplate/ui/components/button";
```

`Tooltip` needs `TooltipProvider` above the tree; the root route (`apps/web/src/routes/__root.tsx`) already provides it.

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: bun run docker:build
- Start: bun run docker:up
- Logs: bun run docker:logs
- Stop: bun run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

## Git Hooks and Formatting

- Optional native Vite+ hooks: `bun run hooks:setup`
- Docs: [Vite+ commit hooks](https://viteplus.dev/guide/commit-hooks)
- Run checks: `bun run check`

## Project Structure

```
monorepo-boilerplate/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Hono, TRPC)
├── packages/
│   ├── ui/          # Primitives, blocks, formatting, and styles
│   ├── api/         # tRPC procedures and context
│   ├── auth/        # Better Auth configuration (admin plugin enabled)
│   ├── db/          # Schema, queries, and the deterministic seed
│   ├── storage/     # Upload StorageAdapter seam
│   └── config/      # Shared TypeScript config
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run env:init`: Create missing `.env` files from `.env.example` and generate an auth secret
- `bun run rename`: Replace the template scope and project name with your own
- `bun run db:start`: Start Postgres in Docker (`db:stop`, `db:down` to stop)
- `bun run db:push`: Push schema changes to database
- `bun run db:seed`: Load the deterministic Customers reference data
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Vite+ format/lint checks and workspace TypeScript checks
- `bun run lint`: Run Vite+ lint checks
- `bun run format`: Run Vite+ formatting
- `bun run staged`: Run Vite+ checks against staged files
- `bun run hooks:setup`: Install Vite+ native Git hooks with `vp config`
- `cd apps/web && bun run generate-pwa-assets`: Generate PWA assets
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack

## Better Auth Schema Generation

After changing auth plugins or schema options, run `bun run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.
