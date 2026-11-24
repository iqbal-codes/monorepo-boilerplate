# Refine Raw Request into Slice Contract

Ground the raw/vague request in `$INPUTS.request_path` against the live repository and turn it into an executable **Slice Contract** that `factory-slice` can build without ambiguity. You are strictly read-only (`mutates_checkout: false`): never modify repository files.

## Procedure

1. Read `$INPUTS.request_path` in full (including any crash stack trace, error logs, screenshots, or user comments).
2. Inspect the live repository (relevant source files, callers, tests, documented setup and verification commands, project UI references if UI-scoped, and directory `README.md` contracts) to verify every assumption against current code. Use the existing repository conventions and approved project decisions for design, stack, setup, and checks. For a greenfield project, surface undecided choices that affect this request as open questions.
3. Classify:
   - **`risk_tier`**: `strict` if touching auth, RBAC, tenant isolation, money/ledger, persistence/migrations, offline sync, concurrency, or public API contracts; otherwise `standard`.
   - **`has_ui`**: `true` if user-facing UI components/pages/styles change; otherwise `false`.
   - **Work Type:** `scaffold` when creating a repository/workspace or bootstrapping a new app from upstream tooling; omit for ordinary changes. Follow the `scaffold-repo` handoff procedure below for scaffold work.
4. Write the complete structured contract to `$ARTIFACTS_DIR/refined-contract.md` using this exact format (so `factory-slice`'s deterministic parser reads it cleanly):

```markdown
# <Concise Outcome Title>

## Metadata & Dependencies
- **Risk Tier:** `<standard|strict>`
- **Blocked By:** `None` (or `#<N>`)

## File Ownership Boundaries
- **Owned / Allowed Paths:**
  - `<smallest cohesive feature or generator destination folders, including test locations; name exact files only for genuinely file-specific work or necessary root config>`
- **Forbidden Shared Files (Do Not Modify):**
  - `<shared entrypoints/lockfiles that must stay untouched>`

## Problem & Desired Outcome
<2–4 crisp lines grounded in live code citing exact file:line references and error/crash trigger if bug report>

## Scope & Deliverables
1. <List each requested deliverable. For a route startup check, list the paths and static markers. Include feature interactions only when requested.>

## Visual & UI Contract (Tool-Agnostic)
- **Shell / Auth Boundary:** `<navigation context and access rules, if applicable>`
- **Layout Pattern:** `<Exact spatial composition & interaction metaphor, or N/A>`
- **Anti-Patterns (Reject):** `<specific patterns that would violate the approved flow; omit if none>`
- **UI Implementation Constraints:** `<repo-defined UI conventions and reuse rules, if applicable>`
- **UI Design References:** `<links or paths to relevant UI briefs and visual references, else N/A>`
- **Required UI States:**
  - <required state and observable behavior on the supported devices or viewports>
  <!-- List only relevant states. For a non-UI slice, use a single N/A bullet. -->

## Acceptance Criteria & Verification Gate
- **Test Seam(s):** <highest public seam>
- **Verification Command:** `<exact runnable repo command>`
- [ ] *(If bug/crash report)* Regression test reproduces the reported failure/stack condition red -> green
- [ ] <concrete verifiable acceptance criterion>
```

5. Set `ready: true` when scope, expected behavior, and verification are settled. For scaffold work, the handoff below must also be complete. Otherwise set `ready: false`, record the blocking decisions or missing evidence in `open_questions`, and leave the draft as an artifact.

## Scaffold Handoff (scaffold only)

Add `` - **Work Type:** `scaffold` `` under Metadata & Dependencies. Use `scaffold-repo` in handoff mode if installed; the requirements below also apply on hosts without that skill. Inspect the destination and carry forward approved stack, versions, workspace layout, and UI decisions. Check version-specific official documentation or CLI help. Resolve required choices before marking ready. Keep this checkout read-only; use scratch only if a generator compatibility check is needed.

Add a `## Scaffold Handoff` section to the contract with these labeled bullets (each starts with an inline value):

- **Official Sources:** Version-specific upstream links for the setup steps.
- **Setup Sequence:** Ordered commands, versions, working directories, prerequisites, and generator destinations. Name the wiring left to the project and use scratch generation if an upstream tool requires an empty destination. Describe generated areas, not a required inventory of filenames.
- **Integration Checks:** Observable checks for each promised boundary; include the clean-checkout `Verification Command` in the contract. If a design system is selected, include initialization, theme/provider setup, and build/open checks for each consuming app.

Ask for a decision only when an unresolved choice affects the scaffold. Record which checks were run in scratch and which are planned for delivery.

## Output

Return the required JSON:
- `ready`: `true` if zero blocking ambiguities remain; `false` if `open_questions` needs operator input.
- `title`: concise outcome title.
- `risk_tier`: `"standard"` or `"strict"`.
- `has_ui`: boolean.
- `open_questions`: array of concise operator questions (empty when `ready: true`).
- `contract_path`: exact path `$ARTIFACTS_DIR/refined-contract.md`.
- `summary`: 1–2 sentence summary of the grounded scope and target files.
