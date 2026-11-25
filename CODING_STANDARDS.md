# Coding Standards

Reviewed on diffs alongside [GLOSSARY.md](./GLOSSARY.md) and [docs/adr/](./docs/adr/). Mechanical rules (`no-explicit-any`, unused variables, `packages/ui` import boundaries, formatting, and `tsc --noEmit`) are enforced by `bun run check`.

## Interface Tiers & State Placement

- **Controlled, router-free Blocks:** Blocks in `packages/ui` never read URL state, query clients, or domain types. `DataTable` takes pagination/sorting props and delegates URL bridging to `apps/web/src/lib/use-data-table-search-params.ts` ([ADR 0002](./docs/adr/0002-table-v9-and-controlled-blocks.md)). Navigation uses a `renderLink` callback prop.
- **Non-nested drag/keyboard activators:** In interactive card/row blocks (`KanbanBoard`, [ADR 0009](./docs/adr/0009-dnd-kit-react-and-controlled-kanban.md)), attach drag/keyboard activator `handleRef`s to a dedicated sibling `<button>`, never to a container holding nested interactive controls.
- **UI library placement:** Shared primitives and blocks belong in `packages/ui` (`npx shadcn@latest add <name> -c packages/ui`, tokens in `packages/ui/src/styles/globals.css`). Domain-coupled components live in `apps/web/src/components/<domain>`.
- **App Shell (`sidebar-07`):** Deliberate deviations from upstream `sidebar-07` in `apps/web/src/components/{app-sidebar,app-topbar}.tsx` and `components/sidebar/*` are: no `TeamSwitcher` (single-tenant, [ADR 0003](./docs/adr/0003-better-auth-admin-plugin.md)), real Better Auth session in `NavUser`, and typed TanStack Router links. Diff against `npx shadcn@latest add sidebar-07` in a scratch directory before overwriting.
- **State ownership:**
  - Server data -> TanStack Query / tRPC
  - List/filter/sort/page state -> URL via `nuqs`
  - Form state -> `useAppForm` (`createFormHook`) and `withForm` from `@monorepo-boilerplate/ui/components/form` ([ADR 0008](./docs/adr/0008-tanstack-form-composition-blocks.md))
  - UI preferences only -> Zustand (`apps/web/src/lib/ui-prefs-store.ts`)

## Boundaries & Domain Conventions

- **Money:** Exchange across every boundary as an integer number of currency minor units plus an ISO currency code. Format with `packages/ui/src/lib/format.ts`, never `toLocaleString`.
- **Form value shapes:** Store date-only fields as `"YYYY-MM-DD"`, datetime fields as UTC ISO-8601 strings, phones as E.164 strings, and uploads as provider-relative asset paths resolved at render time via `apps/web/src/lib/asset-url.ts` ([ADR 0004](./docs/adr/0004-store-asset-paths-relative.md)).
- **Tables (`@tanstack/react-table` v9.3.1):** Use `useTable` + explicit `tableFeatures(...)`, not v8 `useReactTable` (see `packages/ui/src/components/data-table.tsx`).
- **Server & Auth:** Keep domain logic in `packages/*`; `apps/server` only wires routes/adapters. Gate admin procedures with `adminProcedure` from `packages/api/src/procedures.ts`.
