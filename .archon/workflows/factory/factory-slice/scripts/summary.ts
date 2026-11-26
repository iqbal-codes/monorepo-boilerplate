/**
 * Terminal run summary for factory-slice (`returns: { node: summary, outcome: delivered }`).
 */

import { emit, text } from '../../.shared/contract.ts';

const prUrl = text(process.env.INPUTS_PR_URL);
const implBlocked = text(process.env.INPUTS_IMPL_BLOCKED) === 'true';
const implSummary = text(process.env.INPUTS_IMPL_SUMMARY);
const roundsReady = text(process.env.INPUTS_ROUNDS_READY) === 'true';
const mergeDecision = text(process.env.INPUTS_MERGE_DECISION);
const merged = text(process.env.INPUTS_MERGED) === 'true';
const ciStatus = text(process.env.INPUTS_CI_STATUS);
const prSummary = text(process.env.INPUTS_PR_SUMMARY);
const mergeSummary = text(process.env.INPUTS_MERGE_SUMMARY);

let status = 'completed';
if (implBlocked) {
  status = 'blocked';
} else if (merged) {
  status = 'merged';
} else if (mergeDecision === 'reject') {
  status = 'held_by_operator';
} else if (ciStatus === 'failed') {
  status = 'ci_failed';
} else if (ciStatus === 'pending') {
  status = 'ci_pending';
} else if (prUrl && roundsReady) {
  status = 'pr_open_ready';
} else if (prUrl) {
  status = 'pr_open_draft';
} else {
  status = 'incomplete';
}

const delivered = merged || status === 'pr_open_ready' || status === 'held_by_operator';
const summary =
  [implBlocked ? `Blocked: ${implSummary}` : '', prSummary, mergeSummary]
    .filter(Boolean)
    .join(' | ') || `Finished with status=${status}`;

emit({
  delivered,
  merged,
  pr_url: prUrl,
  status,
  summary,
});
