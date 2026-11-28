# Strict Review Checklist (Seams & Failure-Safety)

Apply this checklist **only** when `$INPUTS.review_mode == 'strict'` (auth, RBAC, tenant isolation, money/ledger, persistence/migrations, offline sync, concurrency, or public API contracts).

Flag a finding as `[P0]`/`[P1]` only with exact `file:line` proof of a concrete reachable failure on realistic inputs. Record speculative or minor defensive hardening under `## Non-Blocking Notes` (`[P2]`).

## Cross-Boundary Seams
- **Hand-synced contracts:** Schema, enum, constant, or interface duplicated locally instead of imported from its owning module (cite both sides).
- **Missing validation/auth routes:** Guard, permission, or tenant check enforced on one entry path while a sibling path skips it.
- **Rehydrate / resume field drops:** Fields persisted on the write path that are silently lost or mis-defaulted on read, replay, or reconcile.
- **Reachable invalid states:** Public parser, constructor, or mutation admitting invalid state that downstream code mishandles.

## Failure Visibility & Containment
- **False success / silent fallback:** `catch` or fallback masking a real failure behind an empty result or `200 OK`, or conflating authoritative `401`/null with a transient failure.
- **Partial writes / surviving side effects:** Multi-step mutations or identity switches leaving corrupted or stale state after mid-flight failure.
- **Blast radius / tenant isolation:** One failing item aborting unrelated items, or missing tenant/role scope exposing cross-tenant/cross-user data.
- **Secrets in error text:** Raw errors or logs exposing tokens, cookies, credentials, or DSNs.

## Structural Hygiene (Advisory)
- Consult `$PACK_DIR/.shared/smell-baseline.md` when reviewing complex touched modules; report smells as `[P2]` notes unless they cause a concrete defect or violate an explicit repository rule.

## Round 1 Exploratory Ledger Entries (`strict` only)
- On Round 1 (`Freeze State: OPEN` in `qa-testcases.md`), emit `- TC-R1-SEAM-01: FAIL — <defect>` (or `- TC-R1-CODE-01: FAIL — <defect>`) under `## Test Case Results` **only** for a verified `[P0]`/`[P1]` defect from this checklist so Round 2 tracks its fix cleanly.
