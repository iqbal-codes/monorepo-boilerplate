# Address Human Maintainer PR Review Feedback

You are revising an existing Factory pull request (`$INPUTS.pr_url`) inside its isolated worktree based on maintainer feedback in `$INPUTS.feedback_path`.

## Procedure

1. **Read repository standards, contract, and human feedback first:**
   - Read `AGENTS.md` and `CODING_STANDARDS.md` (if present).
   - Read `$INPUTS.contract_path` in full (`Owned / Allowed Paths`, `Forbidden Shared Files`, acceptance criteria, UI requirements).
   - Read `$INPUTS.feedback_path` in full (`CHANGES_REQUESTED` reviews, inline diff comments, and `/fix` / `/revise` directives).

2. **Stay strictly within slice ownership boundaries:**
   - Edit and create files **only within `Owned / Allowed Paths`** and **never touch `Forbidden Shared Files`**.
   - If addressing the maintainer's request genuinely requires modifying a file outside `Owned / Allowed Paths` or inside `Forbidden Shared Files`, stop immediately and return `blocked: true` naming the exact file and reason.

3. **Implement all requested changes cleanly (TDD first for behavior changes):**
   - Address every review point and inline comment at root cause without weakening existing tests or bypassing standards.
   - Run `$INPUTS.verification_command` and confirm exit code `0`.
   - When `$INPUTS.has_ui` is `true` and `$INPUTS.preview_cmd` is non-empty, boot `$INPUTS.preview_cmd` (parse `URL=...` and `PID=...`, always `kill "$PID"` before exiting), verify the changed UI/viewports, and capture 2–4 refreshed screenshots to `$ARTIFACTS_DIR/evidence/impl-<state>.png` and visually inspect them.

4. **Write reviewer & PR notes:**
   - Write full technical notes to `$ARTIFACTS_DIR/implementation.md` mapping each maintainer request to the change and test/verification proof.
   - Write `$ARTIFACTS_DIR/pr-summary.md` (`## Summary` + `## Merge Danger`).
   - Save all changes on disk (do not commit or push—the publisher script handles committing and pushing to the PR branch).

## Output

Return the required JSON:
- `done`: `true` when revisions and verification finished (or when blocked).
- `blocked`: `true` only when boundary/prerequisite constraints make completion impossible without operator action.
- `summary`: concise 1–2 sentence summary of feedback addressed and checks passed.
