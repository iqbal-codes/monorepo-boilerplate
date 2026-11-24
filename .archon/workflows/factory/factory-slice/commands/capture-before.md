# Capture Before Evidence (Brownfield UI)

Capture **Before** screenshots of the existing UI surface on `$INPUTS.base_sha` before any code changes are made. You are strictly read-only (`mutates_checkout: false`): never modify repository files or commit anything.

## Inputs
- Slice contract: `$INPUTS.contract_path`
- Preview runner command: `$INPUTS.preview_cmd`
- Output directory: `$ARTIFACTS_DIR/evidence/`

## Procedure

1. Read `$INPUTS.contract_path` and identify the routes and UI states that this task will modify.
2. Start the isolated preview server by running `$INPUTS.preview_cmd`. Read `URL=...` and `PID=...` from its output. Always kill `PID` in a cleanup trap or before exiting so no background server leaks.
3. Use the repository’s browser tooling or an available browser tool to visit affected routes on `URL` as a user would:
   - Capture 1–3 representative states at the devices and viewports relevant to the contract and save them to `$ARTIFACTS_DIR/evidence/before-<slug>.png`.
4. Stop the preview server (`kill "$PID"` and verify it exited).
5. Write a concise summary of what existed before to `$ARTIFACTS_DIR/evidence/before.md`.

## Stop Rule

If browser tooling is unavailable, the preview server fails to boot, or the target route does not exist yet on `$INPUTS.base_sha`, stop the server cleanly, write the reason to `$ARTIFACTS_DIR/evidence/before.md`, and return `captured: false` with `screenshots: []`. Never invent or fake screenshots.

## Output

Return the required JSON:
- `captured`: `true` if at least one `before-*.png` file was written and verified non-empty; else `false`.
- `screenshots`: list of filenames written under `$ARTIFACTS_DIR/evidence/` (e.g. `["before-settings.png"]`).
- `summary`: one concise sentence describing the baseline UI state.
