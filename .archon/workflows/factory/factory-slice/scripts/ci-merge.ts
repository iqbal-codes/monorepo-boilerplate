/**
 * Deterministic CI poll + head-pinned squash merge (0 LLM tokens).
 * Never merges an unverified head: uses `--match-head-commit <head_sha>`.
 */

import { emit, runCmd, text } from '../../.shared/contract.ts';

const repo = text(process.env.INPUTS_REPO);
const prNumber = text(process.env.INPUTS_PR_NUMBER);
const headSha = text(process.env.INPUTS_HEAD_SHA);
const maxWaitSec = Number.parseInt(text(process.env.INPUTS_CI_WAIT_SECONDS) || '600', 10);

if (!repo || !prNumber || prNumber === '0') {
  emit({
    merged: false,
    ci_status: 'skipped',
    summary: 'No PR number available to merge.',
  });
  process.exit(0);
}

// Reconcile manual GitHub merges/closes cleanly so paused checkpoint runs settle without failing
const prStateRes = runCmd(
  ['gh', 'pr', 'view', prNumber, '--repo', repo, '--json', 'state'],
  { allowFail: true }
);
if (prStateRes.code === 0 && prStateRes.stdout) {
  try {
    const prState = (JSON.parse(prStateRes.stdout) as { state?: string }).state;
    if (prState === 'MERGED') {
      emit({
        merged: true,
        ci_status: 'green',
        summary: `PR #${prNumber} was already merged manually on GitHub.`,
      });
      process.exit(0);
    }
    if (prState === 'CLOSED') {
      emit({
        merged: false,
        ci_status: 'skipped',
        summary: `PR #${prNumber} was closed without merging on GitHub.`,
      });
      process.exit(0);
    }
  } catch {
    // proceed to normal check polling
  }
}

interface CheckRun {
  name?: string;
  state?: string;
  bucket?: string;
}

function inspectChecks(): 'green' | 'failed' | 'pending' | 'none' {
  const res = runCmd(
    ['gh', 'pr', 'checks', prNumber, '--repo', repo, '--json', 'name,state,bucket'],
    { allowFail: true }
  );
  if (res.code !== 0 || !res.stdout) return 'none';
  try {
    const checks = JSON.parse(res.stdout) as CheckRun[];
    if (checks.length === 0) return 'none';
    if (checks.some((c) => c.bucket === 'fail' || c.bucket === 'cancel')) return 'failed';
    if (checks.some((c) => c.bucket === 'pending')) return 'pending';
    return 'green';
  } catch {
    return 'pending';
  }
}

let ciStatus: 'green' | 'failed' | 'pending' | 'skipped' = 'skipped';

if (maxWaitSec <= 0) {
  ciStatus = 'skipped';
} else {
  const deadline = Date.now() + maxWaitSec * 1000;
  let state = inspectChecks();
  // Brief grace period for GitHub Actions to register check runs on a freshly pushed PR
  const registerGrace = Date.now() + 20_000;
  while ((state === 'pending' || (state === 'none' && Date.now() < registerGrace)) && Date.now() < deadline) {
    Bun.sleepSync(10_000);
    state = inspectChecks();
  }
  ciStatus = state === 'none' ? 'skipped' : state;
}

if (ciStatus === 'failed') {
  emit({
    merged: false,
    ci_status: 'failed',
    summary: `CI checks failed on PR #${prNumber} at ${headSha.slice(0, 7)}.`,
  });
  process.exit(0);
}

if (ciStatus === 'pending') {
  emit({
    merged: false,
    ci_status: 'pending',
    summary: `CI checks still pending after ${maxWaitSec}s on PR #${prNumber}; leaving open for next pass.`,
  });
  process.exit(0);
}

const mergeArgs = [
  'gh',
  'pr',
  'merge',
  prNumber,
  '--repo',
  repo,
  '--squash',
  '--delete-branch',
];
if (headSha) {
  mergeArgs.push('--match-head-commit', headSha);
}

const merged = runCmd(mergeArgs, { allowFail: true });
if (merged.code !== 0) {
  emit({
    merged: false,
    ci_status: ciStatus,
    summary: `Merge refused on PR #${prNumber}: ${merged.stderr || merged.stdout}`,
  });
  process.exit(0);
}

emit({
  merged: true,
  ci_status: ciStatus,
  summary: `Squash-merged PR #${prNumber} pinned to ${headSha.slice(0, 7)} (CI: ${ciStatus}).`,
});
