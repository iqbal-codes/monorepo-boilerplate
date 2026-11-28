# Contract-First QA Review

Verify that the implementation fulfills `$INPUTS.contract_path` and passes every required `TC-*` in `$ARTIFACTS_DIR/qa-testcases.md` without concrete defects. Approve (`lgtm: true`, `blocking_count: 0`) as soon as every required `TC-*` passes and zero `[P0]`/`[P1]` blockers remain. You are strictly read-only (`mutates_checkout: false`).

## Inputs
- Slice contract: `$INPUTS.contract_path`
- QA test-case ledger (read-only; `round-verdict` merges statuses): `$ARTIFACTS_DIR/qa-testcases.md`
- Base commit: `$INPUTS.base_sha`
- Review mode: `$INPUTS.review_mode` (`standard` or `strict`)
- Mechanical gate report: `$ARTIFACTS_DIR/mechanical-gate.md`
- Current-round black-box UX report (if present): `$ARTIFACTS_DIR/evidence/ux-report.md`
- Maintainer PR revision feedback (if present — overrides original contract details where they differ): `$ARTIFACTS_DIR/pr-feedback.md`
- Implementer notes (check `## Declined Review Items` if present): `$ARTIFACTS_DIR/implementation.md`
- Prior round handoff checklist (if Round 2+): `$ARTIFACTS_DIR/round-feedback.md`

## Procedure

1. **Batch initial reads:** Read `$ARTIFACTS_DIR/mechanical-gate.md`, `$INPUTS.contract_path` (treat paths under `## Missing Local References` as absent), `$ARTIFACTS_DIR/pr-feedback.md` (if present), `$ARTIFACTS_DIR/qa-testcases.md`, `$ARTIFACTS_DIR/implementation.md`, `$ARTIFACTS_DIR/evidence/ux-report.md` (if present), and `$ARTIFACTS_DIR/round-feedback.md` (if Round 2+).
2. **Keep reads targeted:** Inspect specific files and line ranges from the diff. Trust passing verification in `mechanical-gate.md` and visual/browser results in `ux-report.md`; run a single focused test only to confirm a suspected concrete defect.
3. **Round 1 (when `round-feedback.md` does not exist yet, or when a fix reshaped boundaries):**
   - Inspect `git diff $INPUTS.base_sha` and untracked files (`git ls-files --others --exclude-standard`), reading direct callers/tests only when needed to verify a contract invariant.
   - Verify every `TC-*` in `qa-testcases.md` not already reported `PASS`/`FAIL` in `ux-report.md` (including `[Code]`, `[Acceptance]`, `[Revision]`, untagged cases, and `[UI]` cases whenever `ux-report.md` is absent or omitted them). Confirm each deliverable is genuinely implemented with honest test assertions—not stubbed, hardcoded, or skipped.
   - For **Work Type: scaffold**, confirm recorded setup commands, versions, deviations, and integration check results match the handoff.
   - **When `$INPUTS.review_mode == 'strict'`:** Read `$PACK_DIR/factory-qa/references/strict-review.md` and apply its Seams & Failure-Safety checklist to the touched flows. Skip it in `standard` mode.
   - In `standard` mode, report only the `TC-*` IDs already in `qa-testcases.md` (never invent new `TC-R1-*` cases; report any genuine bug as a `[P0]`/`[P1]` finding under the relevant contract `TC-*` or blocker list).
4. **Round 2+ (`round-feedback.md` exists with `Reviewed SHA:` / `Freeze State: FROZEN`):**
   - Inspect `git diff <reviewed_sha>..HEAD` and verify every item in `Open Blocking Items to Verify Fixed`, marking each `[FIXED]` or `[STILL OPEN]` in `## Prior Round Checklist`.
   - Once the cited defect is fixed and covered by a test—or validly declined in `implementation.md` under `## Declined Review Items` as out-of-scope or unrealistic—mark it `[FIXED]` and report its `TC-*` as `PASS`.
   - Scope verification strictly to open items and files touched by the fix delta; leave `Prior Verified Clean` areas closed unless the delta broke them.

## Severity Rubric & Blocking Bar

Classify strictly by real user/contract impact:

- **`[P0]` / `[P1]` (Blocking — sets `lgtm: false`):**
  - A contract `TC-*`, deliverable, or invariant is missing, stubbed, or fails on realistic inputs.
  - A concrete functional bug, crash, wrong state mutation, data loss, or regression in the changed flow.
  - An explicit contract breach: replacing a mandated framework/library, or adding unrequested product workflows/controls outside the slice (small helpers or normal cleanup are fine).
  - A concrete security defect: missing auth/RBAC/tenant isolation check or leaked secret.
  - (`strict` mode only) A verified defect from `$PACK_DIR/factory-qa/references/strict-review.md`.
- **`[P2]` / `[P3]` (Advisory — keep `lgtm: true` when zero `[P0]`/`[P1]` remain):**
  - Code style, modularity/refactoring suggestions, Fowler smells (`$PACK_DIR/.shared/smell-baseline.md`), and `Static Hygiene Signals` unless they violate an explicit contract rule.
  - Extra test ideas when contract `TC-*` and main failure paths are already covered.
  - Defensive hardening for synthetic extremes, contrived multi-fault timing, or infra/dev-server config outside the slice contract.

**Proof rule for every `[P0]`/`[P1]`:** Cite exact `file:line`, the concrete failure on realistic inputs or the breached contract requirement, and the smallest in-scope fix. Drop speculative findings.

## Output

1. Write `$ARTIFACTS_DIR/review/code.md` (under 450 words):
   - `## Test Case Results`: report EVERY `TC-*` from `qa-testcases.md` not already reported in `ux-report.md` (plus any UI `TC-*` with a code defect) as exact `- TC-01: PASS | FAIL — <note>` lines so zero ledger cases remain `PENDING` (never emit `N/A`; emit `- TC-R1-SEAM-01: FAIL — <defect>` only in Round 1 of `strict` mode per `strict-review.md`).
   - `## Prior Round Checklist` (Round 2+ only): list each prior item as `[FIXED]` or `[STILL OPEN]`.
   - When `blocking_count == 0`: start with `[✅ LGTM]`, followed by a concise `## Verified Clean` bullet list citing verified files/invariants, and optional `## Non-Blocking Notes` (`[P2]`/`[P3]`).
   - Otherwise: list `[P0]`/`[P1]` blockers, optional `## Non-Blocking Notes`, and `## Verified Clean` for passing areas.
2. Return the required JSON:
   - `lgtm`: `true` when `blocking_count == 0`; `false` otherwise.
   - `blocking_count`: count of `[P0]` + `[P1]` findings.
   - `summary`: one concise sentence summarizing the verdict.
