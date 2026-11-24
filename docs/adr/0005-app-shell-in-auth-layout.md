# Mount the App Shell in the authenticated layout

The shell wraps every authenticated screen and nothing else. It is rendered by `apps/web/src/routes/_auth/route.tsx`, the layout that already guards on a session, so login and the public page stay shell-free without conditional logic inside the shell.

The shell's markup follows shadcn's official `sidebar-07` block (collapsible sidebar with sub-items, header breadcrumbs, footer user menu) rather than a hand-built frame, so it matches upstream and can be re-synced. Two parts of that block are deliberately dropped: the `TeamSwitcher` (single-tenant, ADR 0003) and the billing menu items.

Navigation is a static, hand-ordered config in `apps/web/src/lib/nav.ts`. Deriving it from the route tree would produce an alphabetical flat list and cannot express grouping, icons, ordering, or admin-only entries.

## Considered Options

- **Shell in `__root.tsx` that hides itself on public routes**: one mount point, but every new public route needs an exception and the shell renders through a flash of wrong chrome.
- **Route-derived navigation**: no config to maintain, but order, grouping, icons, and permissions are unrecoverable.

## Consequences

A new screen appears in the sidebar only after it is added to `nav.ts`; `to` values stay literal so a removed route fails the type check. Screens name themselves in the top bar via `staticData.pageTitle`, which keeps route names out of the layout; detail routes override it at runtime through `usePageTitle()` once the record loads.
