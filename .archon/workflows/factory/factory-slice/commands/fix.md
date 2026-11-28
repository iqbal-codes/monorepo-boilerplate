# Fix QA / Review Findings (Fresh-Context Targeted Pass)

You are running a fresh, focused fix pass for `$INPUTS.contract_path`. Mechanical Gate, UX verification, or QA review found blocking defects and returned the Draft PR (`factory:changes-requested`).

## Latest Verdict Summary
$INPUTS.prev_summary

## Operator Instructions
$INPUTS.operator_guidance

## Procedure

1. **Read only the round feedback, contract, and cited files before editing:**
   - Read `$ARTIFACTS_DIR/round-feedback.md`, `$ARTIFACTS_DIR/review/code.md`, `$ARTIFACTS_DIR/mechanical-gate.md` (if gate failed), and `$ARTIFACTS_DIR/evidence/ux-report.md` (if UX failed).
   - Read `$INPUTS.contract_path`, `$ARTIFACTS_DIR/qa-testcases.md` (keep every passing `TC-*` green), and `AGENTS.md` / `CODING_STANDARDS.md` (if present).
   - Open only the exact files and tests cited in open blocking findings or operator instructions.
   - Confirm ownership before editing: check `$INPUTS.allowed_folders` (`[]` adds no folder restriction) and `$INPUTS.forbidden_paths`. If a fix requires expanding a nonempty reservation or editing a forbidden path, stop and return `blocked: true` with the exact path and reason.

2. **Resolve every `[P0]` / `[P1]` finding, operator instruction, and failing gate cleanly:**
   - Undo any boundary violations first, then fix within permitted paths.
   - Fix failing tests/lint/typecheck without weakening assertions or deleting tests.
   - Fix each valid `[P0]`/`[P1]` at root cause and add a focused regression test reproducing the cited failure (check repo ADRs or installed library types/source when fixing third-party API behavior). Adopt small, low-risk `[P2]` suggestions only if clearly worthwhile.
   - **Declining invalid or out-of-scope findings:** If a finding is factually false, already satisfied, outside the slice contract, or rests on an unrealistic synthetic probe, document concise `file:line` counter-evidence in `$ARTIFACTS_DIR/implementation.md` under `## Declined Review Items` so the next round can close it.

3. **Verify locally before handing back to `factory:review`:**
   - Run `$INPUTS.verification_command` and confirm exit code `0`.
   - **Conditional browser check:** Run `$INPUTS.preview_cmd` only when `$INPUTS.has_ui` is `true`, `$INPUTS.preview_cmd` is non-empty, AND this round fixed a UX/visual/layout/route defect (skip when prior UX passed and edits are non-visual). Always stop `PID`, refresh affected `$ARTIFACTS_DIR/evidence/impl-<slug>.png` shots (matching `before-<slug>.png` framing when applicable), and inspect refreshed PNGs.
   - Update `$ARTIFACTS_DIR/implementation.md` (include fix notes and any `## Declined Review Items`) and refresh `$ARTIFACTS_DIR/pr-summary.md` (`## Summary`, `## Evidence`, `## Merge Danger`).
   - Save all changes on disk (the publisher script commits and pushes).

## Output

Return the required JSON:
- `done`: `true` when fixes and verification finished (or when blocked).
- `blocked`: `true` if a reservation expansion, hard path conflict, or missing prerequisite requires operator action.
- `summary`: concise fixes and verification results, or the exact blocker and rationale.
