# Bulk archive Customers with reusable list Blocks

- **Slice ID:** `SL-L1-01`
- **Phase:** `L1`
- **Risk Tier:** `strict`
- **Blocked By:** None
- **Archetype Reference:** Existing Customers Reference Flow
- **Verification Command:** `bun run check-types`

## Owned / Allowed Paths

- `packages/ui/src/components/data-table.tsx`
- `packages/ui/src/components/list-toolbar.tsx`
- `packages/ui/src/components/bulk-action-bar.tsx`
- `packages/ui/src/components/confirmation-dialog.tsx`
- `apps/web/src/routes/_auth/customers/**`
- `apps/web/src/components/customers/**`
- `apps/web/src/lib/use-data-table-search-params.ts`
- `packages/api/src/routers/customers.ts`
- `packages/api/src/routers/customers.integration.test.ts`
- `packages/db/src/queries/customer.ts`
- `README.md`

## Forbidden Shared Files

- `apps/web/src/routeTree.gen.ts`
- `apps/server/**`
- `packages/auth/**`
- `packages/db/src/schema/**`
- `packages/db/src/migrations/**`
- `packages/ui/src/styles/**`
- `.archon/**`
- `**/package.json`
- `bun.lock`
- `docker-compose.yml`

## Implementation

- Extend the controlled DataTable interface with optional selection by stable row ID. Existing consumers must continue to work without selection. Compose the new Blocks from existing primitives; no route, query, API, or customer dependencies in `packages/ui`.
- Replace the inline Customers toolbar with the List Toolbar. The Screen owns selection and resets it when the list criteria or page change. Snapshot the selected IDs at confirmation and prevent submission from stale result data.
- Add a protected Customers bulk archive procedure. Accept only an explicit nonempty collection of IDs bounded to the maximum page size. Handle duplicate IDs as one record. Use an atomic database operation that cannot commit a partial archive if a selected record is missing or deleted concurrently. Leave existing archived records unchanged. Do not expose an archive-all-by-filter operation.
- Exclude archived records from the default list, including its count. Keep an explicit Archived filter and individual restore with an explicit Active or Inactive choice. Keep existing admin-only deletion unchanged.
- Document the new Blocks and their use in the Reference Flow. Production deployment, staff access changes, and protected upload changes are separate gates, not changes to make in this slice.

## Acceptance criteria

- [ ] Ordinary signed-in staff can archive several selected Customers; unauthenticated requests cannot archive any.
- [ ] The operation is all-or-nothing for missing IDs, and succeeds when an included Customer is already archived. The only change to an archived Customer is its status and ordinary update metadata; its attachment stays attached.
- [ ] Changing search, filter, sort, page, or page size clears selection; selecting the header never selects an unseen row. Revisiting a page does not restore its old selection.
- [ ] Canceling changes no records. A failed request does not report success. The missing-record case refreshes the list and requires a fresh selection.
- [ ] Newly archived records disappear from the default results and can be found under Archived. Restoring one record requires an explicit Active or Inactive choice.
- [ ] Row checkboxes are keyboard-operable and do not trigger row editing. Readable controls and a working dialog are present on desktop and narrow layouts.

## Verification

- Prefer a tRPC caller using real disposable Postgres for atomicity, already-archived behavior, and the signed-out guard. Add a regression test for the uncertain transactional edge: include an existing and a missing ID in one call, then verify the existing Customer’s status did not change. Run it against a separately provisioned test database with `bun test ./packages/api/src/routers/customers.integration.test.ts`; do not run against a persistent or production database.
- Run the exact compile gate above. Exercise the Customers Screen with real dev API, a signed-in ordinary staff user, and disposable data with at least two pages. The existing preview hook serves the frontend only; run the API and test database separately and use an origin allowed by the dev auth configuration.
- [UI design brief](../ui-design-brief.md) defines the concrete state and keyboard checks.

**Required UI States:**

- Populated list with no selection, partial selection, and full current-page selection.
- Selection reset on page or criteria change; stale results not actionable.
- Confirmation, cancel, pending, success, missing record, and recoverable failure.
- Archived filter and explicit single-record restore.
- Existing empty and list error states.
