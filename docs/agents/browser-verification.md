# Browser E2E & UX Verification

Load this guide when booting `.archon/ui-preview.sh` (or `--with-api`) for interactive UI inspection or writing/running Playwright E2E checks against the web app.

## Tool Selection (`agent-browser` vs Playwright)

- **Interactive UI inspection, UX verification, and screenshots (`capture-before`, `implement`, `fix`, `ux-verify`):** Prefer `agent-browser` (`open`, `snapshot`, `set viewport`, `set media light|dark`, `screenshot`, `console`, `errors`) whenever available on `PATH`.
- **Persistent E2E regression tests & CDP tracing:** Use Playwright only when writing or running automated E2E test suites (such as `vp run test:browser:customers` in `scripts/test-browser-customers.ts`) or when a verification specifically needs network route interception (`context.route`) or Chromium CDP `Tracing`.

## Customers Regression Command

Install Chromium with `bunx playwright install chromium`. Run `vp run test:browser:customers` with Docker running. The command creates a disposable PostgreSQL container on an ephemeral port, applies the schema, seeds Customers, and starts the full-stack preview. It stops the preview and the container on exit.

On a host with PostgreSQL already provisioned, set `CUSTOMERS_BROWSER_DATABASE_URL` to an empty disposable database. The runner checks that the public schema is empty. The caller owns that database's lifecycle.

Use `--case focus`, `--case export-cancel`, `--case import-response-loss`, or `--case unicode-tag-reload` to replay a single case. The Unicode case also requires Docker: it serves a production build through `nginx:alpine` with `apps/web/nginx.conf` and verifies long filter URLs reload, list the matching customer, and export successfully. The command prints the path to its JSON results and failure traces. In an Archon run it writes them under `$ARTIFACTS_DIR/evidence/`.

## Preview & Disposable Database

1. **Recommended single-command bootstrap (zero manual `psql` or sign-up):**

   ```bash
   ./.archon/ui-preview.sh --with-api --ephemeral-db
   ```

   This starts an ephemeral `postgres:18` container, runs `db:push` + `db:seed` (writing **41** active/inactive and **12** archived customers with valid E.164 phone numbers), boots `apps/server` and `apps/web` on free ports, seeds the `E2E_EMAIL`/`E2E_PASSWORD` test account, and prints `URL=`, `PID=`, `API_URL=`, `E2E_EMAIL=`, `E2E_PASSWORD=`, and `EPHEMERAL_CONTAINER=`. Stopping the supervisor with `kill "$PID"` tears down both servers and stops the disposable Postgres container.

2. **Caller-managed database override:** create/push/seed your own database, then pass `PREVIEW_DATABASE_URL`:

   ```bash
   PREVIEW_DATABASE_URL="<test-url>" ./.archon/ui-preview.sh --with-api
   ```

   Always stop the preview cleanly in a `trap`/`finally` block with `kill "$PID"`.

## UI & Selector Conventions

- **`/sign-in` & `/sign-up`:** Dedicated sign-in (`apps/web/src/routes/sign-in.tsx`) and sign-up (`apps/web/src/routes/sign-up.tsx`) routes. On `/sign-in`, target `input[name="email"]` and `input[name="password"]` (the password toggle button also has an accessible label matching `Password`).
- **`DataTable`:** Sort headers use `aria-label="Sort by <Column>"` (e.g. `Sort by Customer`). Row checkboxes are Base UI elements with `role="checkbox"`, not native `<input type="checkbox">`.
- **Live regions:** Empty `<p role="status" className="sr-only">` / `<p role="alert" className="sr-only">` nodes stay in the DOM and match Playwright `visible` checks; scope active-message selectors with `:not(.sr-only)` or assert non-empty text.

## Bulk Flows & Performance Traces

- For operations handling large datasets (e.g. 10,000-row imports/exports), record a Chromium CDP `Tracing` session (`devtools.timeline,toplevel,blink.user_timing,v8.execute`) while typing in the toolbar search input. Confirm zero `CrRendererMain` `RunTask` events ≥ 50 ms and zero `TextResourceDecoder::Decode` / `background_url_loader` work on the Window main thread.
