# Browser E2E & UX Verification

Load this guide when booting `.archon/ui-preview.sh` (or `--with-api`) for interactive UI inspection or writing/running Playwright E2E checks against the web app.

## Tool Selection (`agent-browser` vs Playwright)

- **Interactive UI inspection, UX verification, and screenshots (`capture-before`, `implement`, `fix`, `ux-verify`):** Prefer `agent-browser` (`open`, `snapshot`, `set viewport`, `set media light|dark`, `screenshot`, `console`, `errors`) whenever available on `PATH`.
- **Persistent E2E regression tests & CDP tracing:** Use Playwright only when writing or running automated E2E test suites (such as `vp run test:browser:customers` in `scripts/test-browser-customers.ts`) or when a verification specifically needs network route interception (`context.route`) or Chromium CDP `Tracing`.

## Customers Regression Command

Install Chromium with `bunx playwright install chromium`. Run `vp run test:browser:customers` with Docker running. The command creates a disposable PostgreSQL container on an ephemeral port, applies the schema, seeds Customers, and starts the full-stack preview. It stops the preview and the container on exit.

On a host with PostgreSQL already provisioned, set `CUSTOMERS_BROWSER_DATABASE_URL` to an empty disposable database. The runner checks that the public schema is empty. The caller owns that database's lifecycle.

Use `--case focus`, `--case export-cancel`, or `--case import-response-loss` to replay a single case. The command prints the path to its JSON results and failure traces. In an Archon run it writes them under `$ARTIFACTS_DIR/evidence/`.

## Preview & Disposable Database

1. Create a disposable Postgres database on port `5432`, push the schema (`DATABASE_URL=<test-url> vp run db:push`), and seed (`DATABASE_URL=<test-url> vp run db:seed`, which writes **41** active/inactive and **12** archived customers).
2. Boot the isolated stack on free ports without touching `.env` or running dev servers:

   ```bash
   PREVIEW_DATABASE_URL="<test-url>" ./.archon/ui-preview.sh --with-api
   ```

3. Parse `URL=`, `PID=`, `E2E_EMAIL=`, and `E2E_PASSWORD=`. Stop both API and Web servers cleanly in a `trap`/`finally` block with `kill "$PID"`, then drop the disposable database.

## UI & Selector Conventions

- **`/sign-in` & `/sign-up`:** Dedicated sign-in (`apps/web/src/routes/sign-in.tsx`) and sign-up (`apps/web/src/routes/sign-up.tsx`) routes. On `/sign-in`, target `input[name="email"]` and `input[name="password"]` (the password toggle button also has an accessible label matching `Password`).
- **`DataTable`:** Sort headers use `aria-label="Sort by <Column>"` (e.g. `Sort by Customer`). Row checkboxes are Base UI elements with `role="checkbox"`, not native `<input type="checkbox">`.
- **Live regions:** Empty `<p role="status" className="sr-only">` / `<p role="alert" className="sr-only">` nodes stay in the DOM and match Playwright `visible` checks; scope active-message selectors with `:not(.sr-only)` or assert non-empty text.

## Bulk Flows & Performance Traces

- For operations handling large datasets (e.g. 10,000-row imports/exports), record a Chromium CDP `Tracing` session (`devtools.timeline,toplevel,blink.user_timing,v8.execute`) while typing in the toolbar search input. Confirm zero `CrRendererMain` `RunTask` events ≥ 50 ms and zero `TextResourceDecoder::Decode` / `background_url_loader` work on the Window main thread.
