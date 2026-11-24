# Deployable internal-tool starter

## Problem

Developers can use the Customers Reference Flow to build and edit one record at a time, but have no reusable example of working on a set of records. The existing local Compose setup also does not establish that a business can safely ship the starter with real staff, records, and attachments.

## Scope

Ship a starter that developers adapt, not a finished business app. Each deployment serves one organization. Keep Customers as the one maintained Reference Flow; keep shared Blocks free of routing, data fetching, and domain rules.

## First slice: bulk archive

1. As a staff user, I can search and filter Customers, select individual rows or the current page, and see how many I selected.
2. As a staff user, I can review a confirmation for that exact set, cancel without changes, or archive it in one operation. No hidden or cross-page record can be included.
3. As a staff user, I know when an archive failed and can recover. If any selected Customer no longer exists, the operation archives none of them and the Screen refreshes the list for review. Already archived records count as success.
4. As a staff user, I can find archived Customers in the Archived filter, open their records and attachments as before, and restore a Customer individually by explicitly choosing Active or Inactive.
5. As a developer, I can reuse the List Toolbar, Bulk Action Bar, and Confirmation Dialog and opt into DataTable selection without introducing Customers, routing, or API dependencies into the UI package.

The Screen owns URL state, stable selected IDs, archive eligibility in the UI, and query refresh. Selection clears on search, filter, sort, page, and page-size changes. Never confirm against previous-page data while a new result is loading. The API authorizes ordinary signed-in staff and the database applies the all-or-nothing operation. Permanent deletion stays admin-only and is not a Bulk Action. Archive is a status change; it does not delete or move attachments. The default list excludes archived Customers.

- [UI design brief](ui-design-brief.md)
- [First slice contract](slices/SL-L1-01-bulk-archive-customers.md)

## Production readiness gates

Bulk archive can ship before these gates pass. Do not call the starter production-ready until all gates are verified together on a fresh instance.

- **Deploy:** Support single-host Docker Compose behind [one public HTTPS origin](../../adr/0006-one-public-origin-for-production-compose.md). Keep backend and Postgres private. Apply committed migrations to an empty database; do not automatically baseline an existing `db:push` install. Verify sign-in and the Customers flow, including persistence across container replacement.
- **Control access:** Disable public signup at the server in production. The Deployment Operator creates the first Administrator through a host command, with no default credential or public setup route. Administrators issue email-bound, expiring, single-use Staff Invitations and can revoke unused ones. Disable staff and terminate their access immediately; prevent disabling or demoting the last active Administrator. No email provider is required: invitations are delivered by the Administrator. Support host-only recovery for an existing Administrator and short-lived, single-use staff recovery links issued by an Administrator after out-of-band identity verification. Recovery invalidates existing sessions and never re-enables a disabled user.
- **Protect files:** A [stored asset path does not grant access](../../adr/0007-stored-asset-paths-do-not-grant-access.md). An unattached Draft Upload is readable only by its uploader and expires if abandoned. Attached files follow the Customer record’s access rules.
- **Prove recovery:** Pause writes while capturing Postgres and uploads. Store the matched pair encrypted off-host, restore both onto a fresh instance, and verify that a Customer and its attachment open.

## Out of scope

Shared multi-organization hosting, additional permanent Reference Flows, saved views, CSV export, bulk hard-delete, email delivery infrastructure, and multiple supported production hosting paths.
