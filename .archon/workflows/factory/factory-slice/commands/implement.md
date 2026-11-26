# Implement Slice (Initial TDD Pass Within Owned Paths)

Deliver the accepted slice contract in `$INPUTS.contract_path` cleanly via TDD inside this isolated worktree. After you finish, your changes will be pushed to a Draft PR and handed over to `factory:review` (Mechanical Gate + independent QA reviewers).

## Rules

1. **Read repo standards, contract, and anchored specs first:**
   - Read repository guidance and follow the architecture, modularity, and UI rules it declares. Ground tooling in the approved spec and repository configuration. For a new project, use the agreed stack choices and surface unresolved decisions in the contract.
   - Read `$INPUTS.contract_path` in full and any linked UI brief.
   - If a product screen in scope has visual artifacts in `$INPUTS.contract_path` or `ui-design-brief.md` (links to image files or screenshots from any design tool), **open and inspect those image files with your file-reading tool before coding** and use them to match layout, proportions, and visual hierarchy while implementing all `Required UI States` with the project’s existing UI conventions.
   - Read only the referenced sections of linked design docs, `Archetype Reference`, and directory `README.md` contracts along your target paths.
   - If an `Archetype Reference` is listed, mirror its folder/layer conventions (while strictly applying any newer standards in `AGENTS.md`).
   - Use the framework and UI implementation choices established by the repository or approved spec. If an unresolved choice is required to build the slice, return `blocked: true` and name the decision.
   - For **Work Type: scaffold**, follow the versioned official setup sequence in **Scaffold Handoff** before adding project wiring. Generate in scratch if needed to preserve the checkout, then integrate the relevant output inside owned folders. If the approved setup cannot work within those boundaries, return `blocked: true` with the conflict instead of hand-writing a replacement scaffold.
   - Derive permitted behavior from this slice’s deliverables, acceptance criteria, and referenced spec section. Use the UI brief for the screens and states named by this slice.
   - For an entry-path smoke preview, render a static app name at each requested route. Build interactive demos, sample domain data, and product flows only when the slice explicitly owns them.
2. **Strict Boundary Discipline & Modular Decomposition:**
   - Create and modify files **strictly within `Owned / Allowed Paths`**.
   - Keep entrypoints focused on mounting the app. If required behavior needs component files outside ownership, return `blocked: true` and name the needed path.
   - Never touch any file listed in `Forbidden Shared Files`.
   - When `Owned / Allowed Paths` grants a feature/module directory glob (e.g. `features/<slice>/**`, `routes/**`), decompose complex pages and modules into focused modules with thin entrypoints, following the local architecture.
   - If the slice changes dependencies, update the corresponding lockfile within the resolved ownership boundaries.
   - If completing the task genuinely cannot be done without editing a forbidden or unowned file, stop immediately and return `blocked: true` naming the exact file and technical reason.
3. **TDD & Domain-Appropriate UI Execution:**
   - For behavior changes, write failing tests at the declared `Test Seam(s)` first, then implement and refactor. For scaffolds, use the upstream generator for the baseline and verify the integration checks in the handoff; do not use guessed filenames as tests of scaffold correctness.
   - For product UI within the slice, implement the contract’s flows, states, and layout. Reuse the project’s components and style conventions where they exist. Preserve accessible names, keyboard/focus behavior, readable contrast, and recovery from errors on the supported devices.
   - Verify calls and data formats across the boundaries changed by the slice. Use the owning contracts and domain helpers.
   - Avoid speculative abstractions (no YAGNI), silent fallbacks, or hand-synced duplicate types when an owning schema/contract already exists.
4. **Local Verification & Visual Inspection Before Handing Off to QA:**
   - Prepare the worktree with the repository’s documented dependency and test-environment setup. Keep tracked changes within the slice boundaries.
   - Run the resolved verification command `$INPUTS.verification_command`.
   - Ensure every check passes cleanly and all changes are saved on disk (the publisher will commit and open the Draft PR).
   - **Self-captured & visually inspected UI evidence (when `$INPUTS.has_ui` is `true` and `$INPUTS.preview_cmd` is non-empty):**
     - Boot `$INPUTS.preview_cmd`, parse `URL=...` and `PID=...` (always `kill "$PID"` in a trap or cleanup block before finishing).
     - Use the repository’s browser verification tooling when documented, or an available browser tool. Exercise the changed flows, including overlays, on the devices and viewports in the contract or repo guidance. Check for unexpected runtime and request failures, inaccessible controls, clipping, and unintended overflow.
     - Save 2–4 screenshots to `$ARTIFACTS_DIR/evidence/impl-<state>.png` (covering `impl-desktop.png`, `impl-mobile.png`, plus `impl-dialog.png` or `impl-empty.png`/`impl-error.png` as applicable), **open and visually inspect those PNGs with your file-reading tool**, and fix any layout/clipping/contrast defects before handing off.
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
- `done`: `true` when implementation and local verification finished (or when permanently blocked).
- `blocked`: `true` only if an explicit boundary or missing prerequisite makes completion impossible without operator intervention.
- `summary`: concise summary of deliverables completed and verification results.
