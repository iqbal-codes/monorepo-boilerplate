# Fix QA / Review Findings (Fresh-Context Targeted Pass)

You are running a fresh, focused fix pass for `$INPUTS.contract_path`. Mechanical Gate, UX verification, or independent QA review found blocking defects in the previous PR revision and returned it (`factory:changes-requested`).

## Latest Verdict Summary
$INPUTS.prev_summary

## Operator Instructions
$INPUTS.operator_guidance

## Procedure

1. **Read only the round feedback, standards, and exact cited files BEFORE editing:**
   - Read `$ARTIFACTS_DIR/round-feedback.md` and `$ARTIFACTS_DIR/review/code.md`
   - Read `$ARTIFACTS_DIR/mechanical-gate.md` (if the mechanical gate failed)
   - Read `$ARTIFACTS_DIR/evidence/ux-report.md` (if UX verification failed)
   - Read `AGENTS.md`, `CODING_STANDARDS.md`, and any ADR referenced for the touched domain
   - Read `$INPUTS.contract_path` for the accepted outcome, acceptance criteria, and invariants
   - Read every row in `$ARTIFACTS_DIR/qa-testcases.md` — including already-passing `TC-*` and `TC-R1-*` items — and treat them as hard non-regression invariants while fixing
   - Open only the exact files and tests cited in the open blocking findings or operator instructions (skip broad exploratory reads across untouched modules)
   - Confirm ownership before editing: check `$INPUTS.allowed_folders` (`[]` adds no folder restriction) and `$INPUTS.forbidden_paths`. Before editing in a newly needed folder outside a nonempty reservation, stop and return `blocked: true` with the proposal; if a forbidden path is necessary, stop with `blocked: true` and name the exact path and reason.

2. **Address every `[P0]` / `[P1]` finding, operator instruction, and failing gate at root cause:**
   - Undo any boundary violations, then solve within permitted paths or report the conflict as above.
   - For scope findings, remove behavior outside the accepted slice regardless of where it was implemented.
   - Fix failing tests/lint/typecheck without weakening assertions or deleting tests.
   - Fix every `[P0]` and `[P1]` defect at its **state-machine or contract root cause** (not a narrow symptom patch), preserving every passing `TC-*` / `TC-R1-*` invariant; adopt small, low-risk `[P2]` suggestions when clean.
   - **Reproduce the exact failure sequence in a regression test:** when a finding cites an async race, deferred network request, error-then-retry sequence, or cancelled navigation/reload, write a focused regression test that reproduces that exact sequence — never substitute a happy-path mock that hides the bug. When a finding cites third-party library runtime behavior, check the relevant repo ADR or library source/types before assuming how it behaves.
   - If you determine a reviewer finding is factually false or already satisfied, document exact `file:line` counter-evidence in `$ARTIFACTS_DIR/implementation.md` under `## Declined Review Items` so the next review round can verify it.

3. **Verify locally before handing back to `factory:review`:**
   - Run `$INPUTS.verification_command` and confirm exit code `0`.
   - **Conditional browser check:** run `$INPUTS.preview_cmd` + the repository’s browser tooling **only when** `$INPUTS.has_ui` is `true`, `$INPUTS.preview_cmd` is non-empty, AND this round fixed a failing UX/visual/layout/route defect. When prior UX already passed and this round only changed non-visual logic, tests, or scripts covered by automated unit/integration tests, skip preview startup and screenshot loops. When you do run a preview, always stop it using `PID` and visually inspect any refreshed `$ARTIFACTS_DIR/evidence/impl-<state>.png`.
   - Update `$ARTIFACTS_DIR/implementation.md` (keeping full fix & declined-item context for QA) AND refresh `$ARTIFACTS_DIR/pr-summary.md` (`## Summary` visual/diff-sketch + `## Merge Danger` One-way/Two-way door & Blast Radius) so the PR description reflects the final shape.
   - Ensure changes are saved on disk (the publisher script will commit and push cleanly to the PR).

## Output

Return the required JSON:
- `done`: `true` when fixes and verification finished (or when blocked).
- `blocked`: `true` if a reservation expansion, hard path conflict, or missing prerequisite requires operator action.
- `summary`: concise fixes and verification results, or the exact blocker and rationale.
