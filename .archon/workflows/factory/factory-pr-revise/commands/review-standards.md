# QA Axis 2: Standards, Archetype & Structural Hygiene

Adopt a strict, non-sycophantic **independent reviewer** posture in a completely fresh context. You are strictly read-only (`mutates_checkout: false`): never edit repository files.

## Inputs
- Slice contract: `$INPUTS.contract_path`
- Base commit: `$INPUTS.base_sha`
- Review mode: `$INPUTS.review_mode` (`standard` or `strict`)
- Smell baseline: `$PACK_DIR/.shared/smell-baseline.md`
- Prior implementer notes / round feedback (if present on Round 2+): `$ARTIFACTS_DIR/implementation.md`, `$ARTIFACTS_DIR/round-feedback.md`

## Scope & Evidence Bar

Inspect `git diff $INPUTS.base_sha` and any untracked files (`git ls-files --others --exclude-standard`), plus any repository steering docs (`AGENTS.md`, `CODING_STANDARDS.md`, `CONTRIBUTING.md`), directory `README.md` contracts along touched paths, and the `Archetype Reference` named in `$INPUTS.contract_path`.

Evaluate:

1. **Repository Standards & Archetype:** Check documented repository rules, directory contracts, and the applicable archetype. For UI files, assess compliance with the repository’s UI conventions and flag material accessibility or interaction defects.
   - For scaffold contracts, compare recorded generator commands, versions, working directories, and deviations against the linked upstream instructions and resulting integration. Require evidence that each promised boundary works; a green check or the presence of predicted filenames alone is insufficient.
2. **Modularity & Fowler Smell Baseline:** Read `$PACK_DIR/.shared/smell-baseline.md`. Check cohesive decomposition against the repository’s conventions and report material smells that hurt clarity or maintainability.
   - Treat an entrypoint that absorbs feature behavior because ownership is narrow as [P1]. Remove excess behavior from the slice or require an ownership correction for approved behavior before passing review.
3. **Boundary Contracts & Single Source of Truth:** Verify changed integrations against their real counterparts. Check that shared formats, validation, and domain rules come from the owning contracts. In standard mode, also check for hand-synced boundary pairs and hidden failures. In strict mode, Axis 3 covers that deeper review.

**Strict proof rule:** Cite exact `file:line`, concrete consequence, and smallest correction. Skip anything linter/formatter/typechecker already enforces.

## Output

1. Write your report to `$ARTIFACTS_DIR/review/standards.md` (under 400 words). If strictly zero `[P0]`/`[P1]` blocking findings exist, write `[✅ LGTM]` followed by a brief "Verified Clean" list. Otherwise list findings tagged `[P0]`/`[P1]` (blocking) or `[P2]`/`[P3]` (non-blocking note).
2. Return the required JSON:
   - `lgtm`: `true` ONLY when `blocking_count == 0`.
   - `blocking_count`: count of `[P0]` + `[P1]` findings.
   - `summary`: one concise sentence summarizing the verdict.
