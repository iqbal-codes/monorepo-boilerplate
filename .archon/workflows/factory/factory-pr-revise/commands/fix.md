# Fix QA / Review Findings (Resuming Implementer Session)

You are resuming your prior implementation session for `$INPUTS.contract_path`. Mechanical Gate, UX verification, or independent QA reviewers found defects in your previous submission and sent the Draft PR back (`factory:changes-requested`).

## Latest Verdict Summary
$INPUTS.prev_summary

## Procedure

1. **Read repo standards & all round feedback BEFORE editing any file:**
   - Read `AGENTS.md` / `CODING_STANDARDS.md` (if present) so fixes conform to modularity and design-system rules.
   - Read `$ARTIFACTS_DIR/round-feedback.md`
   - Read `$ARTIFACTS_DIR/mechanical-gate.md` (if failed)
   - Read `$ARTIFACTS_DIR/evidence/ux-report.md` (if present and failed)
   - Read every report under `$ARTIFACTS_DIR/review/` (`spec.md`, `standards.md`, `seams-errors.md`)
   - Re-read `$INPUTS.contract_path` where boundaries or acceptance criteria are referenced.

2. **Address every `[P0]` / `[P1]` finding and failing gate at root cause:**
   - Fix boundary violations immediately (if an unowned or forbidden file was touched, revert it cleanly and solve within `Owned / Allowed Paths`—or return `blocked: true` only if genuinely impossible without crossing `Forbidden Shared Files`).
   - For a scope finding, remove unrequested behavior. If required work cannot be kept cohesive within owned paths, report the exact ownership conflict.
   - Fix failing tests/lint/typecheck without weakening assertions or deleting tests.
   - Fix every `[P0]` and `[P1]` QA defect cleanly; adopt valid `[P2]` suggestions when small and low-risk. For UX/UI fixes, use the contract, repo standards, and observations in the UX report.
   - If you determine a reviewer finding is factually false or already satisfied, document exact `file:line` counter-evidence in `$ARTIFACTS_DIR/implementation.md` under `## Declined Review Items` so the next fresh review round can verify it.

3. **Verify locally before handing back to `factory:review`:**
   - Prepare the worktree using the documented repository setup if needed, then run `$INPUTS.verification_command` and confirm exit code `0`.
   - When `$INPUTS.has_ui` is `true`, `$INPUTS.preview_cmd` is non-empty, and UI behavior or routes changed, re-verify fixed states and dialogs using `$INPUTS.preview_cmd` and the repository’s browser tooling or an available browser tool. Cover the supported devices and viewports, check interaction, accessibility and runtime health, stop the preview using `PID`, then save refreshed `$ARTIFACTS_DIR/evidence/impl-<state>.png` and visually inspect the PNGs.
   - Update `$ARTIFACTS_DIR/implementation.md` (keeping full fix & declined-item context for QA) AND refresh `$ARTIFACTS_DIR/pr-summary.md` (`## Summary` visual/diff-sketch + `## Merge Danger` One-way/Two-way door & Blast Radius) so the PR description reflects the final shape.
   - Ensure changes are saved on disk (the publisher script will commit and push cleanly to the Draft PR).

## Output

Return the required JSON:
- `done`: `true` when fixes and local verification finished (or when permanently blocked).
- `blocked`: `true` ONLY if a hard boundary conflict or missing prerequisite makes fixing impossible without operator intervention.
- `summary`: concise 1–2 sentence summary of the fixes made and verification result.
