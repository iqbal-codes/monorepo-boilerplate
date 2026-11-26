# Triage Labels

The engineering skills speak in terms of five canonical triage roles. This repo maps them to the Archon Factory state vocabulary (`factory:*`), which is the only label family the factory emits.

| Label in mattpocock/skills | Label in our tracker | Meaning                                              |
| -------------------------- | -------------------- | ---------------------------------------------------- |
| `needs-triage`             | `factory:triage`     | Raw issue awaiting `factory-refine` grounding        |
| `needs-info`               | `factory:needs-info` | Waiting on a maintainer answer before delivery       |
| `ready-for-agent`          | `factory:ready`      | Ready for the factory (refine if needed, then slice) |
| `ready-for-human`          | `factory:human`      | Requires human implementation or a decision          |
| `wontfix`                  | `factory:wontfix`    | Will not be actioned                                 |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), apply the `factory:*` string from this table.

## Full lifecycle (Archon-owned)

Do not set these by hand unless you are the operator resolving a stop:

| Label                           | State                                          |
| ------------------------------- | ---------------------------------------------- |
| `factory:triage`                | Needs refinement                               |
| `factory:needs-info`            | Clarification posted; waiting for a reply      |
| `factory:ready`                 | Grounded and unblocked; eligible for dispatch  |
| `factory:in-progress`           | Claimed by a live or paused Archon run         |
| `factory:blocked`               | Waiting on an open native or `Blocked by` edge |
| `factory:review`                | Draft PR open under gate/QA review             |
| `factory:changes-requested`     | QA sent the PR back to the implementer         |
| `factory:approved`              | Gate and independent QA passed                 |
| `factory:done`                  | Delivered and merged                           |
| `factory:human`                 | Needs human implementation or decision         |
| `factory:wontfix`               | Will not be actioned                           |
| `factory:hold`                  | Held by an operator                            |
| `factory:spec` / `factory:epic` | Non-delivery tracker; never auto-dispatched    |

## Inbound compatibility

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `spec`, `epic`, `blocked`, `hold`, `stage:implement`, `stage:review`, `stage:changes-requested`, and `stage:approved` are accepted as aliases and normalized by the dispatcher (`.shared/labels.ts` in the pack). They exist only so external skills such as `/to-tickets` keep working; prefer the `factory:*` string in anything new.

`risk:standard` / `risk:strict` and `phase:L0`–`L3` are orthogonal metadata, not lifecycle states.
