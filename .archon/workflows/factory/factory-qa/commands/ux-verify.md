# Black-Box UX Verification

Verify the changed UI from the end-user's perspective against the `TC-*` cases and `Required UI States` in `$INPUTS.contract_path`, and capture change-driven **After** screenshots for the PR. Approve (`passed: true`) once all UI `TC-*` pass with no broken flows or fatal runtime errors. You are strictly read-only (`mutates_checkout: false`).

## Inputs
- Slice contract: `$INPUTS.contract_path`
- Maintainer PR revision feedback (if present — overrides original contract details where they differ): `$ARTIFACTS_DIR/pr-feedback.md`
- QA test-case ledger (read-only; `round-verdict` merges statuses): `$ARTIFACTS_DIR/qa-testcases.md`
- Optional linked UI brief / visual references
- Preview runner command: `$INPUTS.preview_cmd`
- Before evidence (if present): `$ARTIFACTS_DIR/evidence/before.md`
- Prior round feedback & UX artifacts (Round 2+): `$ARTIFACTS_DIR/round-feedback.md`, `$ARTIFACTS_DIR/evidence/ux-report.md`, and `$ARTIFACTS_DIR/evidence/ux-check.mjs`
- Output directory: `$ARTIFACTS_DIR/evidence/`

## Procedure

1. **Collect contract scope:** Read `$INPUTS.contract_path`, `$ARTIFACTS_DIR/pr-feedback.md` (if present), `$ARTIFACTS_DIR/qa-testcases.md`, and any linked UI brief for `Required UI States`, UI `TC-*` (and any UI `TC-REV-*`) cases, explicit viewport/theme/accessibility/performance requirements, and `Out of Scope` exclusions.
   - **Round 1 (when `round-feedback.md` does not exist yet):** Verify every UI-applicable `TC-*` in `qa-testcases.md`. When `Freeze State` is `LOCKED_CONTRACT_ONLY` (`standard` tier), report only the contract `TC-*` IDs (do not add `TC-R1-*`). When `Freeze State` is `OPEN` (`strict` tier), emit `TC-R1-UX-01`, ... only for a concrete blocking failure observed directly in the changed UI.
   - **Round 2+ (`round-feedback.md` exists / `Freeze State: FROZEN`):** Verify `Open Blocking Items to Verify Fixed` first (`[FIXED]` / `[STILL OPEN]`), reuse `$ARTIFACTS_DIR/evidence/ux-check.mjs` if present, and re-verify only unresolved or delta-affected `TC-*` cases.
2. **Start preview cleanly:** Run `$INPUTS.preview_cmd` (or the command in `docs/agents/browser-verification.md` if present; prefer `--ephemeral-db` when supported). Parse `URL=...` and `PID=...`, and always stop `PID` before exiting.
3. **Run one consolidated browser pass:**
   - Run any repo-provided browser verification script named in the contract first and map its results to matching `TC-*` entries.
   - Otherwise run **one reusable Playwright script** (`$ARTIFACTS_DIR/evidence/ux-check.mjs`) covering all required UI `TC-*` flows, capturing `after-*.png` screenshots, and recording unexpected console/page/network errors (distinguishing expected negative-test HTTP statuses). Use `agent-browser` only for quick interactive probes.
   - Verify these categories **as applicable to the contract**:
     - **Contract States & Interactions (always):** Every required UI state, visible label, interactive flow, and error/empty state works end-to-end without crashes, broken renders, or blocked controls. For launch-only previews, verify static route markers and flag unrequested product controls.
     - **Layout & Overflow:** Check desktop viewport (e.g. `1280×800`) for clipped, overlapping, or unusable controls and unintended horizontal overflow. Check narrow mobile (`320×800`) or additional viewports **when required by the contract or when responsive/mobile layout changed**.
     - **Accessibility, Theme & Performance (when required):** Verify keyboard reachability, dark/light theme contrast, or performance budgets **when specified in the contract or repo guidance** (always flag broken keyboard traps or completely unreadable text).
4. **Capture change-driven After screenshots** to `$ARTIFACTS_DIR/evidence/after-<slug>.png` (proportional to scope, typically 1–4 non-redundant shots proving what changed), then stop the preview server (`PID`):
   - When `$ARTIFACTS_DIR/evidence/before.md` lists `before-<slug>.png` baselines, match the same `<slug>`, route, viewport, and framing for apples-to-apples comparisons.
   - Optionally write `$ARTIFACTS_DIR/evidence/after-manifest.json` (`[{ "file": "after-...", "label": "...", "pairKey": "..." }]`) and delete obsolete `after-*.png` from earlier rounds if renamed.
5. **Inspect every captured PNG** with your file-reading tool. Ground every blocking finding in direct observation (`after-<slug>.png` or live runtime log). Treat failures that break a `TC-*`, block a user task, or violate an explicit contract requirement as **blocking**; record subjective visual polish as **non-blocking**.
6. **Write `$ARTIFACTS_DIR/evidence/ux-report.md`** containing:
   - `## Test Case Results`: EVERY UI-applicable `TC-*` as `- TC-01: PASS | FAIL — <note>` (never omit an assigned case or emit `N/A`; add `- TC-R1-UX-01: FAIL — <note>` only on Round 1 when `Freeze State: OPEN` in `strict` mode for concrete blockers)
   - `## Prior Round Checklist` (`[FIXED]` / `[STILL OPEN]`, Round 2+ only)
   - States verified, console/network errors (if any), blocking vs. non-blocking findings, and screenshot inventory.

## External Failures
- If the preview server fails to boot due to this change, return `passed: false` with the exact startup error.
- If missing host browser tooling prevents verifying a required case, record it as unverified in `ux-report.md` and return `passed: false`.

## Output

Return the required JSON:
- `passed`: `true` when zero blocking defects remain and all required UI cases pass; `false` otherwise.
- `screenshots`: list of `after-*.png` filenames under `$ARTIFACTS_DIR/evidence/`.
- `findings`: concise blocking finding lines (empty array when `passed: true`).
- `summary`: one-sentence summary of what was verified.
