/**
 * Puts the QA escalation in the PR thread, so a maintainer can answer it from GitHub.
 * Deterministic (0 LLM tokens): the dispatcher reads the reply verb on this comment
 * thread and resolves the paused `escalate-rounds` wait.
 *
 * Keep these verbs in step with the `options:` of `escalate-rounds` in
 * `factory-slice.yaml` and `factory-pr-revise.yaml`, and with the mapping in
 * `dispatcher/dispatch-lib.ts`.
 */

import { mkdirSync } from 'node:fs';
import { emit, text } from '../../.shared/contract.ts';
import { postPrComment } from '../../.shared/github.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const repo = text(process.env.INPUTS_REPO);
const prNumber = Number.parseInt(text(process.env.INPUTS_PR_NUMBER) || '0', 10);
const reason = text(process.env.INPUTS_REASON) || 'unknown';
const summary = text(process.env.INPUTS_SUMMARY);

const body = [
  '<!-- archon-factory-escalation-prompt -->',
  `### ⏸️ QA Escalation (\`${reason}\`)`,
  summary,
  '',
  'A maintainer replies here and the dispatcher answers the paused run.',
  '- **`/leave-open`** — finish the run and keep the PR for manual follow-up.',
  '- **`/widen-reservation`** — end the run; widen `**Allowed Folders:**` and start a new run.',
  '- **`/split-slice`** — end the run; file the extra work as its own slice, then re-run this one.',
  '- **`/cancel`** — cancel the run.',
].join('\n');

// A posting failure leaves the run paused (the attention queue still answers it); it is
// reported rather than failing the node, so a GitHub hiccup cannot skip the escalation.
const posted = repo !== '' && prNumber > 0 ? postPrComment(repo, prNumber, body, artifactsDir) : false;

emit({ posted, summary: posted ? `escalation prompt posted to PR #${prNumber}` : 'escalation prompt not posted' });
