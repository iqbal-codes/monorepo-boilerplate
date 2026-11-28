# Capture Before Evidence (Modified Existing UI Only)

Capture **Before** screenshots of existing UI surfaces on `$INPUTS.base_sha` **only when this slice actually modifies existing rendered UI** (layout, styling, copy, or existing controls/sections). You are strictly read-only (`mutates_checkout: false`): never modify repository files or commit anything.

## Inputs
- Slice contract: `$INPUTS.contract_path`
- Preview runner command: `$INPUTS.preview_cmd`
- Output directory: `$ARTIFACTS_DIR/evidence/`

## Procedure

1. Read `$INPUTS.contract_path` and determine whether this slice **modifies existing UI surfaces** or is **purely additive** (adds a new route, new modal/drawer/dialog, or a new standalone component/showcase section on an existing page without altering the existing UI).
   - **Additive-only fast skip:** If no existing rendered UI surface is being redesigned or altered, do **not** start the preview server and do **not** capture unrelated baseline pages/tabs. Write a concise note to `$ARTIFACTS_DIR/evidence/before.md` stating why no Before screenshot applies, and return `captured: false`, `screenshots: []`, `summary: "Additive UI change — no existing UI surface modified."`.
2. When existing UI surfaces *will* change, start the isolated preview server by running `$INPUTS.preview_cmd`. Read `URL=...` and `PID=...` from its output. Always kill `PID` in a cleanup trap or before exiting so no background server leaks.
3. Visit **only** the existing routes, sections, and viewports that this slice will modify:
   - Capture focused shots of what is changing (include narrow mobile only when responsive layout changes), saved to `$ARTIFACTS_DIR/evidence/before-<slug>.png`.
4. Stop the preview server (`kill "$PID"` and verify it exited).
5. Write `$ARTIFACTS_DIR/evidence/before.md` listing each filename, route, viewport, and framing so `implement` and `ux-verify` can match the exact `<slug>` for Before/After comparison (optionally write `before-manifest.json`).

## Stop Rule

If the slice is purely additive (no existing UI modified), browser tooling is unavailable, the preview server fails to boot, or the target route does not exist yet on `$INPUTS.base_sha`, stop the server cleanly (if started), write the reason to `$ARTIFACTS_DIR/evidence/before.md`, and return `captured: false` with `screenshots: []`. Never invent or fake screenshots.

## Output

Return the required JSON:
- `captured`: `true` if at least one `before-*.png` file was written and verified non-empty; else `false`.
- `screenshots`: list of filenames written under `$ARTIFACTS_DIR/evidence/` (e.g. `["before-customer-header.png"]`).
- `summary`: one concise sentence describing the baseline UI state (or why Before capture was skipped for an additive change).
