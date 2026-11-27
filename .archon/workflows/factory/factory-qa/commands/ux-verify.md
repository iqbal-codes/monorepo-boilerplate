# Black-Box UX, Layout & Visual Verification

Verify the changed UI **strictly as an end-user / operator** (reading rendered screens and screenshots without reading implementation source), and capture **After** screenshots for the PR body and reviewers. You are strictly read-only (`mutates_checkout: false`): never edit, create, or revert files inside the repository checkout.

## Inputs
- Slice contract (read `Visual & UI Contract` — `Layout Pattern`, `Anti-Patterns`, `UI Design References`, `Required UI States` — and `Scope & Deliverables`): `$INPUTS.contract_path`
- QA test-case ledger (strictly read-only for you; `round-verdict` merges your statuses after parallel QA finishes): `$ARTIFACTS_DIR/qa-testcases.md`
- Optional UI brief and visual references linked from the contract.
- Preview runner command: `$INPUTS.preview_cmd`
- Before evidence (if present): `$ARTIFACTS_DIR/evidence/before.md`
- Prior round feedback & UX artifacts (if present on Round 2+): `$ARTIFACTS_DIR/round-feedback.md`, `$ARTIFACTS_DIR/evidence/ux-report.md`, and any saved verification script in `$ARTIFACTS_DIR/evidence/ux-check.mjs`
- Output directory: `$ARTIFACTS_DIR/evidence/`

## Procedure

1. Read `$INPUTS.contract_path`, `$ARTIFACTS_DIR/qa-testcases.md`, and linked UI brief/references to collect every **Required UI State**, `TC-*` test case, **Out of Scope** boundary, declared **Layout Pattern**, **Anti-Pattern**, performance budget, and viewport requirement.
   - **Round 1:** Verify every UI-applicable `TC-*` in `qa-testcases.md`, plus one bounded exploratory check over the UI surfaces touched by this change (never fail on items listed under `Out of Scope`). Emit any newly discovered diff-bounded UX defect as `TC-R1-UX-01`, `TC-R1-UX-02`, ... under `## Test Case Results`.
   - **Round 2+ (`Freeze State: FROZEN` in `qa-testcases.md`):** Check `Open Blocking Items to Verify Fixed` first (`[FIXED]` / `[STILL OPEN]`), reuse `$ARTIFACTS_DIR/evidence/ux-check.mjs` if present, and **only** re-verify unresolved `TC-*` cases plus `TC-*` cases affected by the fix delta — do NOT invent new exploratory cases on untouched areas.
2. Use the repository's preview command for any interactive checks (`docs/agents/browser-verification.md` if present; prefer `--ephemeral-db` when supported to avoid manual DB/sign-up setup). When starting it directly, parse `URL=...` and `PID=...` and stop that PID on exit.
3. **Consolidated single-pass browser audit (do NOT stop after the first defect):**
   First run any repository-provided browser verification command named in the contract or `docs/agents/browser-verification.md`, and use its case results and evidence paths to report the matching ledger `TC-*` entries.
   For multi-state, viewport, theme, contrast, DOM, keyboard, and screenshot verification, write and run **one reusable Playwright script** (`$ARTIFACTS_DIR/evidence/ux-check.mjs`) in a single execution to cover the required flows, capture `after-*.png` screenshots, measure overflow/focus-contrast, and collect console/network errors — rather than issuing dozens of sequential `agent-browser` CLI calls. Use `agent-browser` only for targeted interactive probing where a live snapshot is needed, and on Round 2+ reuse or extend `$ARTIFACTS_DIR/evidence/ux-check.mjs` for unresolved/delta-affected cases only.
   Complete **all** applicable checks before deciding `passed`:
   - **Contract & Scope:** Verify every required state, visible/accessible label, action hierarchy, and error/empty/cancellation/scope flow. For a launch-only preview, open each declared route and verify its static marker, reporting visible product controls or demo flows outside the slice as blocking scope defects.
   - **Responsive Layout & Overflow:** Exercise all viewports required by the contract or repo guidance (defaulting to representative desktop and narrow mobile sizes such as `1280×800` and `320×800` when unspecified). Verify zero unintended page-wide horizontal overflow (`scrollWidth <= innerWidth`), zero clipped or overlapping controls, and proper overlay/menu containment.
   - **Keyboard Navigation & Focus-Visible Contrast:** Verify full keyboard reachability (`Tab`, `Enter`/`Space`, arrow keys, `Escape` focus restoration, and busy/disabled focus retention). Measure contrast of readable text and **keyboard focus indicators** against adjacent surfaces in the supported theme(s) (check both dark and light if supported): a background tint below **3:1** (WCAG 1.4.11 non-text contrast) without a clear outline/ring is a blocking defect, not "visible focus".
   - **Runtime Health & Performance Budgets:** Inspect console and network logs, separating expected negative-test responses (e.g. deliberate `401`/`412`/`413`/aborted fault tests) from unexpected runtime or request errors. When the contract specifies a performance or off-main-thread requirement (e.g. no main-thread tasks `>= 50 ms`), capture a browser trace/timing run and attribute every over-budget task to its trigger (UI activation/re-render vs. worker work vs. unrelated harness overhead); never wave off an over-budget task without attribution.
4. Capture 2–4 representative **After** screenshots to `$ARTIFACTS_DIR/evidence/after-<state>.png` with explicit viewport tags (e.g. `after-desktop.png`, `after-mobile-320.png`, `after-desktop-<state>.png`, `after-mobile-<state>.png`) so Before/After comparisons pair by viewport, then stop the preview server using `PID`.
5. Open and inspect every captured screenshot. For a launch-only preview, check the static marker and scope. For product UI, evaluate layout, hierarchy, readable contrast, accessible names, keyboard paths and focus, error recovery, and fidelity to the supplied references. Treat failures that block a required user task or violate an explicit requirement as blocking.
6. Write a concise black-box report to `$ARTIFACTS_DIR/evidence/ux-report.md` listing:
   - `## Test Case Results` reporting EVERY UI-applicable `TC-*` from `qa-testcases.md` as `- TC-01: PASS | FAIL — <note>` (never omit an assigned case or emit `N/A`; plus `- TC-R1-UX-01: FAIL — <note>` only on Round 1 if a new diff-bounded defect was found)
   - Prior round UX checklist (`[FIXED]` / `[STILL OPEN]`, if Round 2+)
   - Flows exercised and states verified (PASS / FAIL)
   - Visual hierarchy, surface contrast (including measured focus-ring contrast), and layout-metaphor assessment (citing exact screenshot filenames)
   - Console / network errors observed (if any)
   - Performance trace summary (when applicable)
   - **All** concrete UX defects found across the entire sweep (blocking vs non-blocking, each citing screenshot filename or trace + observable defect + concrete fix)
   - Screenshot inventory

## Evidence Bar

- Collect every observable blocking defect across all categories above in one round before returning — never short-circuit after finding a single issue.
- Ground every defect in what you directly observed in live interaction, browser trace, or inside the `after-*.png` image (`after-default.png`: ...). Never invent hypothetical flaws, and never bikeshed subjective taste (e.g. swapping two equally clear brand colors) unless hierarchy, contrast, or domain usability fails.
- If the preview server fails to boot due to a bug in this change, return `passed: false` with the exact startup error.
- If an external host limitation prevents the check, including unavailable browser tooling, record the affected cases as unverified in `ux-report.md` and `summary`. Set `passed: false` when a required case is unverified.

## Output

Return the required JSON:
- `passed`: `true` if zero blocking UX/visual/domain-metaphor defects were observed; `false` otherwise.
- `screenshots`: list of `after-*.png` filenames written under `$ARTIFACTS_DIR/evidence/`.
- `findings`: list of concise blocking finding lines covering every blocking defect found in this pass (empty array when `passed: true`).
- `summary`: one-sentence summary of what was verified in the browser.
