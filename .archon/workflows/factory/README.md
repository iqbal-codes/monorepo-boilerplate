# Archon Factory Pack

Standalone workflows for refining requests, delivering scoped changes, and improving the harness. No external planning skill, dispatcher, or design-directory layout is required for manual runs.

## Workflows

| Workflow | What it does |
| :--- | :--- |
| **`factory-refine`** | Turn a raw request or GitHub issue into a repository-grounded slice contract; ask for approval or clarification when needed. |
| **`factory-slice`** | Implement a slice contract, check owned paths and run repository verification, open a draft PR, run independent QA, and apply the selected merge policy. |
| **`factory-pr-revise`** | Address maintainer `CHANGES_REQUESTED` reviews, inline comments, or `/fix` directives on an existing PR and re-run gates & QA. |
| **`factory-learn`** | Audit the harness and recent run evidence. Recommend one addition, update, consolidation, or removal; optionally open a draft PR for human review. |

## Copying to Another Repository

Use the onboarding helper from the repository root (or pass a target directory):

```bash
bash ~/.archon/factory-pack/init-repo.sh /path/to/repo --labels
```

This idempotently installs/updates `.archon/workflows/factory/`, scaffolds missing starter files (`.archon/config.yaml`, `.archon/sdlc/policy/maintainers.json`, `.archon/ui-preview.sh.example`, `AGENTS.md`, `CODING_STANDARDS.md`) without overwriting existing files, and optionally creates the GitHub `factory:*`, `risk:*`, and `phase:*` labels plus legacy alias labels for inbound tools.

To copy only the workflow pack manually without starter files:

```bash
mkdir -p .archon/workflows/factory
cp -a ~/.archon/factory-pack/{.shared,factory-refine,factory-slice,factory-pr-revise,factory-learn,README.md} .archon/workflows/factory/
```

To enable autonomous GitHub issue/PR polling (`archon-factory-dispatch.timer`):

```bash
bash ~/.archon/factory-pack/init-repo.sh /path/to/repo --labels --dispatch
```

The dispatcher verifies every GitHub author against `.archon/sdlc/policy/maintainers.json` (fail-closed when empty) and drives the factory-owned `factory:*` state machine, defaulting to `refine_mode=labeled` so non-Archon issues (`factory:human`, `factory:wontfix`, `factory:spec`, `factory:epic`, `wayfinder:*`, `[Epic Spec]`) are never touched:
- **Vague tickets (`factory:triage` / `factory:needs-info`)**: runs `factory-refine` (`approval_mode=github`), posts clarifying questions (`factory:needs-info`), and re-refines when a maintainer replies (or accepts `/approve` / `/reject`).
- **Ready issues (`factory:ready`)**: checks both native GitHub `blockedBy` and Markdown `Blocked by` edges; if the contract has `Owned / Allowed Paths` + `Verification Command`, dispatches `factory-slice` directly—otherwise grounds it via `factory-refine` first.
- **Blocked issues (`factory:blocked`)**: waits until every native or Markdown blocker is merged; reconciliation flips the issue back to `factory:ready` (or `factory:triage` when it still needs grounding).
- **PR change requests**: dispatches `factory-pr-revise` on maintainer `CHANGES_REQUESTED` reviews, inline diff comments, or `/fix` / `/revise` comments.
- **PR merge gates**: settles paused `merge-approval` gates when a maintainer comments `/approve` or `/merge` (or `/reject` / `/hold`).
- **Claims (`factory:in-progress`)**: applied to the issue for the whole life of a dispatched run (including pauses), removed when the run ends, and excluded from further dispatch. Failed/cancelled `factory-refine` runs release the claim and are retried on the next pass.

Matt Pocock's canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) and the old `stage:*` labels are accepted as **inbound aliases only**; the dispatcher normalizes them to `factory:*` and never emits them. See `.archon/workflows/factory/.shared/labels.ts`.

Use Archon 0.15+, Bun, and Git. Live agent nodes use Archon's built-in model tiers (`medium` / `large`), so configure a default assistant or tiers once on the host (`archon setup` or `archon ai default <provider> [<model>]`). GitHub issue and PR operations need authenticated `gh` with repository access. A local contract replaces the GitHub issue as the input; delivery to a GitHub PR still needs a GitHub remote. Install project dependencies and configure services in the worktree as documented by the repository.

Put the exact `Verification Command` in each new slice contract. Follow the repository’s worktree setup for dependencies, environment, and services. For existing contracts with an omitted command, the pack can resolve a declared `ci` or `test` script when the repository identifies its package manager in `package.json` or has an unambiguous lockfile.

A minimal Markdown contract can be written by hand; add acceptance criteria and relevant constraints so QA can verify the change:

```markdown
# Reject blank search queries

- **Owned / Allowed Paths:**
  - `src/search/**`
- **Verification Command:** `go test ./src/search/...`
- [ ] A blank query returns a validation error without calling the search backend.
```

Phase (`L0–L3`), slice ID, linked UI briefs, and blocker issues (native GitHub `--blocked-by` or Markdown `Blocked by: #N`) are optional. `factory-refine` marks ready GitHub issues with `factory:ready` (or `factory:blocked` while a blocker is open) and `risk:<tier>` by default. Automatic issue admission, clarification replies, and `/approve` on GitHub require a dispatcher; without one, invoke the workflow manually and use Archon for approvals.

Use the smallest cohesive folders in `Owned / Allowed Paths`, including test locations. Use exact paths for genuinely file-specific work or necessary root configuration. `Forbidden Shared Files` overrides ownership when the two overlap.

### Scaffold contracts

When establishing a workspace or bootstrapping an app, add `Work Type: scaffold` in the form below. The handoff records versioned upstream setup, destination folders and integration checks; it does not prescribe the generator's file list.

```markdown
- **Work Type:** `scaffold`

## Scaffold Handoff
- **Official Sources:** <version-specific upstream links>
- **Setup Sequence:** <ordered commands, versions, working directories, prerequisites, and project wiring>
- **Integration Checks:** <observable checks for each app and integration>
```

Replace the placeholders and include an explicit clean-checkout `Verification Command` elsewhere in the contract. `factory-refine` checks the draft before adding `factory:ready`; an unresolved scaffold stays unready even if approval is skipped. `factory-slice` also rejects a declared scaffold with an incomplete handoff before implementation. These checks validate format; triage verifies the sources and QA reviews the actual commands and integration evidence.

## Optional UI Preview Hook (`.archon/ui-preview.sh`)

For web UI slices, declare the required states and supported viewports in the contract or a linked brief. `factory-slice` can run black-box UX verification and capture Before/After screenshots when the repository supplies `preview_cmd` or an executable `.archon/ui-preview.sh`. Use the project’s browser tool or one available in the run environment. Include verification for other UI platforms in the slice’s verification plan.

Contract for `.archon/ui-preview.sh`:
```bash
#!/usr/bin/env bash
# Starts an isolated preview server on an unused port (using ephemeral test DB/seed if needed).
# Must print two lines on stdout:
#   URL=http://127.0.0.1:<port>
#   PID=<server_pid>
```
The mechanical gate checks the implemented checkout for a hook added by the slice. It skips browser verification when the slice has no UI or there is no resolved preview command.

## PR Evidence Branch (`pr-evidence`)

When Before/After PNG screenshots exist in `$ARTIFACTS_DIR/evidence/`, `publish-pr.ts` commits them to an orphan branch named `pr-evidence` (never polluting `main` or the PR diff) and embeds them as a side-by-side Markdown table in the PR body using GitHub blob `?raw=true` links.

## Merge Modes (`factory-slice`)

- `ask` *(default)*: Always pauses before merge so the operator reviews the PR body first.
- `checkpoint`: Pauses for `L0` UI, `L1`, `L3`, and unphased UI slices. Other green PRs, including unphased non-UI and `L2`, can auto-merge after QA and CI gates.
- `auto`: Auto-merges all green PRs.
- `ui-ask`: Pauses before merging every UI PR (`L0–L3`) and auto-merges green non-UI PRs.
- `pr-only`: Opens the PR with full evidence and stops without merging.

## Usage

```bash
# Refine a vague GitHub issue or a local request
archon workflow run factory-refine --input issue=42 --detach
archon workflow run factory-refine 'Reject blank search queries'

# Deliver a ready GitHub issue or the saved local contract; leave PR unmerged
archon workflow run factory-slice --input issue=42 --input merge_mode=pr-only --detach
archon workflow run factory-slice --input spec_file=/path/to/slice-contract.md --input merge_mode=pr-only --detach

# Validate and run deterministic fixtures without calling a model or GitHub
archon validate workflows factory-slice
archon validate workflows factory-refine
archon validate workflows factory-learn
archon workflow test .archon/workflows/factory
```

## Factory Learn

Start in the repository with `archon workflow run factory-learn`. The default `proposal` mode saves `proposal.md` as a run artifact; inspect it with `archon workflow artifacts <run-id> proposal.md`. An audit can find obsolete or duplicate guardrails even without new failures. The collector uses repo-scoped run history, not transcripts. Keep enough Archon run history for the schedule cadence.

Schedule **the poller**, not the workflow or a merge event. Run it once a day per repository under the same host user and `ARCHON_HOME` as Archon. For Linux, use the following as the user service's `ExecStart`, with an absolute path to Bun and a daily timer. Keep `gh`, Git, Archon, `flock`, and the model provider CLI on the service's `PATH`.

```bash
bun ~/.archon/factory-pack/factory-learn/scripts/poll-prs.ts /absolute/path/to/repo
```

The poller scans PRs updated in the last 30 days and all open PRs. It ignores label churn, bot reviews, and `factory-learn/` branches. A merge, close without merge, or new or materially edited maintainer `CHANGES_REQUESTED` review can qualify. It batches up to 60 unseen signals per run and skips Archon entirely on an empty batch. One host-local lock per GitHub repository ID covers polling and the foreground run. Keep a single scheduler host per repo.

Successful analysis, including `no-change`, acknowledges only that run's snapshot in `$ARCHON_HOME/factory-learn-poll/<repo-id>/processed.json` (default home: `~/.archon`). Unacknowledged evidence can be retried while it is still in the lookback. A late review waits for the next poll. Scheduled runs use proposal mode; manual audits remain available without PR evidence, for example after a tooling migration. `render-binding.sh` generates a fire-only binding for operators, not a schedule.

Opt into draft mode only after the pilot: pass `--input mode=draft --input 'allowed_paths=["tests/harness/"]'` or use those string values in the binding. Supply a dedicated identity without merge or branch-protection bypass permissions, require human review and protected checks on the default branch, and isolate model tools from publisher credentials. A worktree alone is not a security sandbox. Draft mode only publishes changes to permitted local harness files in the same repo. Keep GitHub write credentials out of proposal-only pilots. Shared pack changes remain proposal-only until there is a designated, independently governed source repository.

The publisher checks the default branch requires approval via GitHub's branch protection endpoint. If that policy cannot be read or verified, keep proposal mode. Drafts use the create-only branch `factory-learn/proposal`; delete it after resolving the PR before publishing another. If creation fails after a push, inspect the branch and either open its draft manually or delete it before retrying.

## Existing Deployments

Keep copies in active repositories and their bindings untouched until you are ready to switch workflow definitions and merge defaults together. Existing Markdown contracts continue to work without renaming.
