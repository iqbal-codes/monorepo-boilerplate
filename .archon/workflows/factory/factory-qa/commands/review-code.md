# Consolidated QA Review: Code, Spec, Standards & Failure-Safety

Adopt a strict, non-sycophantic **independent reviewer** posture in a completely fresh context. You are strictly read-only (`mutates_checkout: false`): never edit repository files.

## Inputs
- Slice contract: `$INPUTS.contract_path`
- QA test-case ledger (read-only for you; `round-verdict` merges statuses after QA finishes): `$ARTIFACTS_DIR/qa-testcases.md`
- Base commit: `$INPUTS.base_sha`
- Review mode: `$INPUTS.review_mode` (`standard` or `strict`)
- Mechanical gate & static hygiene signals: `$ARTIFACTS_DIR/mechanical-gate.md`
- Current-round black-box UX report (already completed before you run when UX ran, or carried forward from an earlier passing round when `$INPUTS.has_ux_report` is `true`): `$ARTIFACTS_DIR/evidence/ux-report.md`
- Implementer notes (check declined rationales if present): `$ARTIFACTS_DIR/implementation.md`
- Prior round handoff checklist (if Round 2+): `$ARTIFACTS_DIR/round-feedback.md`
- Smell baseline: `$PACK_DIR/.shared/smell-baseline.md`

## Fast Pre-Flight, Tool Economy & Round 2+ Delta Rule

1. **Batch initial artifact reads first:** read `$ARTIFACTS_DIR/mechanical-gate.md` (already includes `diff_stat`, `Static Hygiene Signals`, and any `Delta Since Last Round`), `$INPUTS.contract_path`, `$ARTIFACTS_DIR/qa-testcases.md`, `$ARTIFACTS_DIR/implementation.md`, `$ARTIFACTS_DIR/evidence/ux-report.md` (if present), and `$ARTIFACTS_DIR/round-feedback.md` (if Round 2+).
2. **Keep tool outputs lean (prevent context bloat):**
   - Read targeted line ranges (`sed -n`, `rg -n`, or file-read slices) instead of concatenating multiple whole files into one shell command.
   - Never re-run the full verification suite that already passed in `mechanical-gate.md`; run a single focused test command only when proving a concrete defect or verifying a suspicious mock.
   - **Zero overlap with `ux-verify`:** trust `$ARTIFACTS_DIR/evidence/ux-report.md` for visual layout, responsive overflow, contrast, screenshots, and happy-path browser checks. Reserve ad-hoc Playwright/browser probes strictly for proving a white-box race condition, fault-path, or security/state defect that unit/DOM tests cannot conclusively prove.
3. **If Round 2+ (`Freeze State: FROZEN` in `qa-testcases.md` / `Reviewed SHA:` in `round-feedback.md`):**
   - Verify every item under `Open Blocking Items to Verify Fixed` first and mark each `[FIXED]` or `[STILL OPEN]` in `## Prior Round Checklist`.
   - Inspect `git diff <reviewed_sha>..HEAD` first. Only re-verify unresolved `TC-*` cases and files/boundaries touched by the fix delta — **do NOT add new exploratory test cases or re-audit untouched `Prior Verified Clean` areas** unless the fix delta reshaped architecture/boundaries.
4. **If Round 1** (or if the Round 2+ fix reshaped architecture/boundaries): inspect `git diff $INPUTS.base_sha` and untracked files (`git ls-files --others --exclude-standard`), plus direct callers/tests up to 2 hops where needed. Verify every `[Acceptance]` and non-UI `TC-*` in `qa-testcases.md` (and code/wiring/edge-case coverage for UI-related acceptance criteria) plus a bounded exploratory pass strictly on diff-touched files/flows (never fail on `Out of Scope` items). Emit newly discovered diff-bounded defects as `TC-R1-CODE-01`, ... (or `TC-R1-SEAM-01`, ... for strict seam/failure defects) under `## Test Case Results`.

## Scope & Evidence Bar

Evaluate all applicable parts in **one consolidated pass** over the diff:

### Part 1 — Spec, Correctness & Regression Protection
1. **Scope (blocking):** Map each added user action, domain state, and demo flow to a deliverable before evaluating coverage. Treat unrequested behavior as `[P1]` regardless of file location. `Work Areas` and legacy `Owned / Allowed Paths` are investigation hints, not a scope test. A launch-only shell preview should render static app markers at the requested routes; treat product controls or sample domain workflows in that preview as `[P1]` unless expressly required.
2. **Contract & Acceptance Coverage:** Every deliverable, edge case, invariant, app boundary, and `Required UI State` in `$INPUTS.contract_path` (and linked specs/UI briefs) is genuinely implemented — not stubbed, hardcoded, or skipped. Confirm any prior-round UX defects in `round-feedback.md` / `ux-report.md` are resolved in code and tests.
3. **Approved Implementation Choices:** Treat replacement of a required framework, UI library, or styling approach as `[P1]`, citing both the approved choice and the conflicting implementation.
4. **Behavioral Correctness:** Reachable inputs, state-machine transitions, concurrency/ordering, error/retry flows, and boundary conditions produce the specified outcome.
5. **Regression Protection (Test Value):** Check test **assertions** (not just titles or coverage %). Flag a gap ONLY when a realistic future edit could regress meaningful behavior while all current tests pass — and name the smallest valuable test.

### Part 2 — Standards, Archetype & Structural Hygiene
6. **Repository Standards & Archetype:** Check `AGENTS.md`, `CODING_STANDARDS.md`, relevant `docs/adr/*`, directory `README.md` contracts along touched paths, and the `Archetype Reference` in `$INPUTS.contract_path`. Use `Static Hygiene Signals` in `$ARTIFACTS_DIR/mechanical-gate.md` rather than re-grepping from scratch. For UI files, consult `better-interface` / `modern-web-guidance` only when new UI/DOM/CSS patterns need verification; flag material accessibility or interaction defects missed by black-box UX. For scaffolds, verify recorded generator commands, versions, deviations, and boundary checks.
7. **Modularity & Fowler Smell Baseline:** Apply `$PACK_DIR/.shared/smell-baseline.md`. Treat an entrypoint that absorbs feature behavior instead of delegating to the owning module as `[P1]`. Flag monolith files or design-system bypasses per repo rules.
8. **Boundary Contracts & Single Source of Truth:** Verify shared formats, validation, and domain rules come from owning contracts (no hand-synced duplicate schemas/enums) and catch silent fallbacks that mask real failures.

### Part 3 — Seams & Failure-Safety (ONLY when `$INPUTS.review_mode == 'strict'`)
When `review_mode` is `strict`, extend the same pass to hunt cross-boundary and failure-safety defects in touched flows (skip this section when `review_mode` is `standard`):
- **Seams at boundaries** (HTTP/JSON, DB/SQL, storage, SSE/events, auth/RBAC, cross-package contracts):
  - *Hand-synced pairs:* schema, enum, constant, or interface re-declared locally instead of imported/derived from its owning module (quote both sides with `file:line`).
  - *Missing validation routes:* guard/auth/tenant check added on one entry path while a sibling path skips it.
  - *Rehydrate / resume field drops:* fields written on the primary path that are silently lost or mis-defaulted on read/replay/reconcile.
  - *Reachable invalid states:* public constructor, parser, or mutation admitting an invalid state downstream code mishandles.
- **Failure visibility & containment:**
  - *False success / ambiguous absence:* catch/fallback hiding an error behind an empty result or `200 OK`, or conflating authoritative `401`/null with transient failure.
  - *Partial writes / surviving side effects:* multi-step mutations or identity switches leaving stale/corrupted state on mid-flight error, stall, or cancelled navigation/reload.
  - *Blast radius / tenant isolation:* one failing item aborting unrelated items, or missing tenant/role scope permitting cross-tenant/cross-user data exposure.
  - *Secrets in error text:* raw errors/logs leaking tokens, cookies, credentials, or DSNs.

**Strict proof rule:** Every blocking finding (`[P0]` or `[P1]`) MUST cite:
- Exact `file:line` and quoted code/spec line (for seams: both sides; for failures: failure source, suppression/escape point, concrete consequence)
- Concrete reachable failure, plausible regression, or contract/standard violation (drop speculation resting on "might")
- Smallest fix

Skip anything tooling (`lint`/`typecheck`/`format`) already enforces and skip stylistic nits.

## Output

1. Write your report to `$ARTIFACTS_DIR/review/code.md` (under 550 words):
   - Include `## Test Case Results` reporting EVERY `[Acceptance]` and non-UI `TC-*` from `qa-testcases.md` (and any UI `TC-*` where you found a code/edge-case defect) using exact `- TC-01: PASS | FAIL — <note>` lines (never omit a required case or emit `N/A`; plus any Round-1 `- TC-R1-CODE-01: FAIL — <defect>` or `- TC-R1-SEAM-01: FAIL — <defect>`).
   - If Round 2+, include `## Prior Round Checklist` listing each prior item as `[FIXED]` or `[STILL OPEN]`.
   - If strictly zero `[P0]`/`[P1]` blocking findings exist, write `[✅ LGTM]` followed by a concise `## Verified Clean` bullet list citing checked invariants, files/boundaries, and assertions (so subsequent rounds do not re-audit untouched areas from zero).
   - Otherwise list findings tagged `[P0]`/`[P1]` (blocking) or `[P2]`/`[P3]` (non-blocking note), plus a brief `## Verified Clean` list for areas that already passed cleanly.
2. Return the required JSON:
   - `lgtm`: `true` ONLY when `blocking_count == 0`.
   - `blocking_count`: count of `[P0]` + `[P1]` findings.
   - `summary`: one concise sentence summarizing the verdict.
