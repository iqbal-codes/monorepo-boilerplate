// Decide whether finalize-pr may run and resolve effective round outputs across
// `rounds` and optional post-escalation `extra-rounds`. Kept out of `when:` because
// a skipped loop_group has no output, and dot-accessing it fails instead of skipping.
import { emit, text } from '../../.shared/contract.ts';

const roundsReady = text(process.env.INPUTS_ROUNDS_READY) === 'true';
const roundsReason = text(process.env.INPUTS_ROUNDS_REASON);
const roundsSummary = text(process.env.INPUTS_ROUNDS_SUMMARY);
const roundsRound = Number.parseInt(text(process.env.INPUTS_ROUNDS_ROUND) || '0', 10) || 0;
const roundsDiffStat = text(process.env.INPUTS_ROUNDS_DIFF_STAT);
const roundsHasUi = text(process.env.INPUTS_ROUNDS_HAS_UI) === 'true';

const escalationDecision = text(process.env.INPUTS_ESCALATION_DECISION);
const finalDecision = text(process.env.INPUTS_FINAL_DECISION);

const extraRanStr = text(process.env.INPUTS_EXTRA_RAN);
const extraRan = extraRanStr === 'true' || extraRanStr === 'false';
const extraReady = text(process.env.INPUTS_EXTRA_READY) === 'true';
const extraReason = text(process.env.INPUTS_EXTRA_REASON);
const extraSummary = text(process.env.INPUTS_EXTRA_SUMMARY);
const extraRound = Number.parseInt(text(process.env.INPUTS_EXTRA_ROUND) || '0', 10) || 0;
const extraDiffStat = text(process.env.INPUTS_EXTRA_DIFF_STAT);
const extraHasUi = text(process.env.INPUTS_EXTRA_HAS_UI) === 'true';

const effectiveReady = extraRan ? extraReady : roundsReady;
const effectiveReason = extraRan ? extraReason : roundsReason;
const effectiveSummary = extraRan ? extraSummary : roundsSummary;
const effectiveRound = extraRan ? extraRound : roundsRound;
const effectiveDiffStat = extraRan ? extraDiffStat : roundsDiffStat;
const effectiveHasUi = extraRan ? extraHasUi : roundsHasUi;

// `leave-open` is the only escalation answer that still finalizes the PR (evidence,
// body, merge policy with rounds_ready=false). Re-scoping ends the run untouched.
const finalize =
  effectiveReady || escalationDecision === 'leave-open' || finalDecision === 'leave-open';

emit({
  finalize,
  effective_ready: effectiveReady,
  effective_reason: effectiveReason,
  effective_summary: effectiveSummary,
  effective_round: effectiveRound,
  effective_diff_stat: effectiveDiffStat,
  effective_has_ui: effectiveHasUi,
});
