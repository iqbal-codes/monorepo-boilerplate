# Implement Slice (Initial TDD Pass)

Deliver the accepted slice contract in `$INPUTS.contract_path` cleanly via TDD inside this isolated worktree. After you finish, your changes will be pushed to a Draft PR and handed over to `factory:review` (Mechanical Gate + independent QA reviewers).

## Rules

1. **Read repo standards, contract, and anchored specs first:**
   - Read repository guidance and follow the architecture, modularity, and UI rules it declares. Ground tooling in the approved spec and repository configuration. For a new project, use the agreed stack choices and surface unresolved decisions in the contract.
   - Read `$INPUTS.contract_path` in full, `$ARTIFACTS_DIR/qa-testcases.md` (if present), and any linked UI brief.
   - If a product screen in scope has visual artifacts in `$INPUTS.contract_path` or `ui-design-brief.md` (links to image files or screenshots from any design tool), **open and inspect those image files with your file-reading tool before coding** and use them to match layout, proportions, and visual hierarchy while implementing all `Required UI States` with the project’s existing UI conventions.
   - Read only the referenced sections of linked design docs, `Archetype Reference`, and directory `README.md` contracts along your target paths.
   - If an `Archetype Reference` is listed, mirror its folder/layer conventions (while strictly applying any newer standards in `AGENTS.md`).
   - Use the framework and UI implementation choices established by the repository or approved spec. If an unresolved choice is required to build the slice, return `blocked: true` and name the decision.
   - For **Work Type: scaffold**, follow the official versioned setup in **Scaffold Handoff**. Generate in scratch if needed to inventory output, then integrate relevant files under the ownership rules below. Report a boundary conflict instead of hand-writing a replacement scaffold.
   - Derive permitted behavior from this slice’s deliverables, acceptance criteria, and referenced spec section. Use the UI brief for the screens and states named by this slice.
   - For an entry-path smoke preview, render a static app name at each requested route. Build interactive demos, sample data, and product flows only when required by the accepted behavior.
2. **Confirm ownership before editing:**
   - Read `$INPUTS.allowed_folders` (JSON: a nonempty list limits edits to those folders; `[]` adds no folder restriction) and `$INPUTS.forbidden_paths` (repository protections plus slice prohibitions). `Work Areas` and legacy `Owned / Allowed Paths` are hints only.
   - Identify the owning modules and confirm that each planned edit serves the accepted behavior, stays within any reservation, and avoids forbidden paths. Repeat for new targets, including tests, lockfiles, and generator output.
   - Before editing in a newly needed folder, propose its exact repo-relative path and explain why it is needed. If it expands a nonempty reservation, stop and return `blocked: true` with the proposal; do not expand the reservation yourself. If a forbidden path is necessary, stop with `blocked: true` and name the exact path and reason.
   - Keep entrypoints thin and decompose complex modules according to repository conventions. Update the corresponding lockfile when dependencies change, subject to the same ownership rules.
3. **TDD & Domain-Appropriate UI Execution:**
   - For behavior changes, write failing tests at the declared `Test Seam(s)` covering every applicable `TC-*` in `$ARTIFACTS_DIR/qa-testcases.md` first, then implement and refactor (leaving `Out of Scope` baseline behavior untouched). For scaffolds, use the upstream generator for the baseline and verify the integration checks in the handoff; do not use guessed filenames as tests of scaffold correctness.
   - For product UI within the slice, implement the contract’s flows, states, and layout. Reuse the project’s components and style conventions where they exist. Preserve accessible names, keyboard/focus behavior, readable contrast, and recovery from errors on the supported devices.
   - Verify calls and data formats across the boundaries changed by the slice. Use the owning contracts and domain helpers.
   - Avoid speculative abstractions (no YAGNI), silent fallbacks, or hand-synced duplicate types when an owning schema/contract already exists.
4. **Local Verification & Visual Inspection Before Handing Off to QA:**
   - Prepare the worktree with the repository’s documented dependency and test-environment setup. Keep tracked changes within the slice boundaries.
   - Run the resolved verification command `$INPUTS.verification_command`.
   - Ensure every check passes cleanly and all changes are saved on disk (the publisher will commit and open the Draft PR).
   - **Self-captured & visually inspected UI evidence (when `$INPUTS.has_ui` is `true` and `$INPUTS.preview_cmd` is non-empty):**
     - Boot `$INPUTS.preview_cmd`, parse `URL=...` and `PID=...` (always `kill "$PID"` in a trap or cleanup block before finishing).
     - Use `agent-browser` (when installed) for interactive verification, viewport/theme checks, and capturing evidence screenshots; reserve Playwright or other browser test runners for writing/running persistent E2E tests or checks requiring network interception or CDP tracing. Exercise the changed flows, including overlays, on the devices and viewports in the contract or repo guidance. Check for unexpected runtime and request failures, inaccessible controls, clipping, and unintended overflow.
     - Save 2–4 screenshots to `$ARTIFACTS_DIR/evidence/impl-<state>.png` using explicit viewport names (e.g. `impl-desktop.png`, `impl-mobile-320.png`, plus `impl-desktop-dialog.png` or `impl-desktop-error.png` / `impl-empty.png` as applicable), **open and visually inspect those PNGs with your file-reading tool**, and fix any layout/clipping/contrast defects before handing off.
5. **Implementation Notes & Compact PR Summary (`/pr` style):**
   - Write full technical notes to `$ARTIFACTS_DIR/implementation.md` (for QA reviewers: `## Overview`, `## Key Changes & Behavior`, `## Verification Results`, `## Risks & Trade-offs`).
   - For scaffolds, record setup commands, versions and working directories actually used, deviations with reasons, and results of the handoff integration checks. Include the concise setup evidence in the PR summary.
   - Also write a compact, human-scannable PR digest to `$ARTIFACTS_DIR/pr-summary.md` (use the smallest clear visual):
     ```markdown
     ## Summary
     <Choose the smallest clear visual: `diff` sketch of component/file/control-flow changes, shallow file tree, state pseudocode, or Mermaid `sequenceDiagram`; keep prose brief>

     ## Merge Danger
     **Door:** <One-way | Two-way> — <brief rollback note>
     **Blast Radius:** <One word: Low | UI | API | Auth | Schema | Sync> — <concise potential ramification>
     ```

## Output

Return the required JSON:
- `done`: `true` when implementation and verification finished (or when blocked).
- `blocked`: `true` if a reservation expansion, hard path conflict, or missing prerequisite requires operator action.
- `summary`: concise deliverables and verification results, or the exact blocker and rationale.
