# Address Human Maintainer PR Review Feedback

You are revising an existing Factory pull request (`$INPUTS.pr_url`) inside its isolated worktree based on maintainer feedback in `$INPUTS.feedback_path`.

## Procedure

1. **Read repository standards, contract, and human feedback first:**
   - Read `AGENTS.md` and `CODING_STANDARDS.md` (if present).
   - Read `$INPUTS.contract_path` in full and `$ARTIFACTS_DIR/qa-testcases.md` (if present) for the accepted outcome, acceptance criteria, invariants, and UI requirements.
   - Read `$INPUTS.feedback_path` in full (`CHANGES_REQUESTED` reviews, inline diff comments, and `/fix` / `/revise` directives).

2. **Confirm ownership before editing:**
   - Read `$INPUTS.allowed_folders` (JSON: a nonempty list limits edits to those folders; `[]` adds no folder restriction) and `$INPUTS.forbidden_paths` (repository protections plus slice prohibitions). `Work Areas` and legacy `Owned / Allowed Paths` are hints only. Review feedback does not change either boundary.
   - Identify the owning modules and confirm that each planned edit addresses the feedback for the accepted slice, stays within any reservation, and avoids forbidden paths. Repeat for new targets.
   - Before editing in a newly needed folder, propose its exact repo-relative path and explain why it is needed. If it expands a nonempty reservation, stop and return `blocked: true` with the proposal; do not expand the reservation yourself. If a forbidden path is necessary, stop with `blocked: true` and name the exact path and reason.

3. **Implement all requested changes cleanly (TDD first for behavior changes):**
   - Address every review point and inline comment at root cause without weakening existing tests or bypassing standards.
   - **Verify third-party library runtime behavior before writing state logic or mocks:** when touching auth/session hooks, router blockers, query/mutation lifecycles, or other external runtime APIs, check the relevant repo ADR (`docs/adr/`) or the installed package's source/types in `node_modules/<pkg>` and mirror those exact transitions in your tests instead of guessing.
   - Run `$INPUTS.verification_command` and confirm exit code `0`.
   - When `$INPUTS.has_ui` is `true` and `$INPUTS.preview_cmd` is non-empty, boot `$INPUTS.preview_cmd` (parse `URL=...` and `PID=...`, always `kill "$PID"` before exiting), verify the revised UI surfaces/states, and capture change-driven refreshed screenshots to `$ARTIFACTS_DIR/evidence/impl-<state>.png` (proportional to what changed — no fixed `desktop`/`mobile` quota; match any `before-<slug>.png` framing when modifying existing UI, and focus on the revised states/deliverables). Optionally update `$ARTIFACTS_DIR/evidence/impl-manifest.json` and visually inspect every captured PNG.

4. **Write reviewer & PR notes:**
   - Write full technical notes to `$ARTIFACTS_DIR/implementation.md` mapping each maintainer request to the change and test/verification proof.
   - Write `$ARTIFACTS_DIR/pr-summary.md` (`## Summary` + `## Merge Danger`).
   - Save all changes on disk (do not commit or push—the publisher script handles committing and pushing to the PR branch).

## Output

Return the required JSON:
- `done`: `true` when revisions and verification finished (or when blocked).
- `blocked`: `true` if a reservation expansion, hard path conflict, or missing prerequisite requires operator action.
- `summary`: concise feedback addressed and verification results, or the exact blocker and rationale.
