import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { emit, runCmd, text } from '../../.shared/contract.ts';
import { readPrSnapshot, redactExcerpt as excerpt } from '../../.shared/pr-evidence.ts';

const artifacts = text(process.env.ARTIFACTS_DIR);
const state = text(process.env.STATE_DIR);
if (!artifacts || !state) throw new Error('Factory Learn requires Archon artifact and state directories.');
const origin = runCmd(['git', 'remote', 'get-url', 'origin']).stdout;
const match = origin.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/i);
if (!match) throw new Error('Factory Learn requires a GitHub origin.');
const repo = match[1];
const base = runCmd(['git', 'rev-parse', 'HEAD']).stdout;
const snapshotPath = text(process.env.INPUTS_PR_SNAPSHOT);
const snapshot = snapshotPath ? readPrSnapshot(snapshotPath, repo) : null;
const common = runCmd(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir']).stdout;
const checkout = dirname(common);
const ledger = join(state, 'factory-learn', 'seen.json');
const seen = new Set<string>(existsSync(ledger) ? JSON.parse(readFileSync(ledger, 'utf8')) : []);
const names: Record<string, true> = { 'factory-slice': true, 'factory-refine': true };
const terminal: Record<string, true> = { completed: true, failed: true, cancelled: true };

type Run = {
  id: string; status: string; workflow_name: string; completed_at?: string;
  completed_outcome?: string; metadata?: { inputs?: { repo?: string; issue?: string }; workflow_source?: { origin?: string } };
};
const history = JSON.parse(runCmd(['archon', 'workflow', 'runs', '--cwd', checkout, '--json', '--limit', '60']).stdout) as { runs: Run[] };
if (!Array.isArray(history.runs)) throw new Error('Unexpected Archon history response.');
const batch = history.runs.filter((run) => {
  if (!/^[\w-]{1,100}$/.test(run.id) || seen.has(run.id) || !Object.hasOwn(names, run.workflow_name) || !Object.hasOwn(terminal, run.status)) return false;
  const recordedRepo = run.metadata?.inputs?.repo;
  if (recordedRepo) return recordedRepo.toLowerCase() === repo.toLowerCase();
  const source = run.metadata?.workflow_source?.origin;
  return !!source && existsSync(source) && realpathSync(source) === realpathSync(checkout);
}).slice(0, 12);

const evidence = batch.map((run) => {
  const issue = String(run.metadata?.inputs?.issue ?? '').replace(/^#/, '');
  const response = runCmd(['archon', 'workflow', 'get', run.id, '--cwd', checkout, '--json', '--verbose'], { allowFail: true });
  const details = response.code === 0 ? JSON.parse(response.stdout) : {};
  const nodes = Array.isArray(details.nodes) ? details.nodes : [];
  return {
    id: run.id, workflow: run.workflow_name, status: run.status, completed_at: run.completed_at,
    outcome: run.completed_outcome, issue: /^\d+$/.test(issue) ? Number(issue) : null,
    nodes: nodes.filter((node) => /^(?:mechanical-gate|ci-merge|review-|verdict|approve-contract|merge-approval|rounds|summary)/.test(node.nodeId ?? '')).slice(0, 16).map((node) => ({
      id: node.nodeId, state: node.state, summary: excerpt(node.error ?? node.outputPreview),
    })),
    qa: ['round-feedback.md', 'mechanical-gate.md'].flatMap((file) => {
      const result = runCmd(['archon', 'workflow', 'artifacts', run.id, file, '--cwd', checkout], { allowFail: true });
      return result.code === 0 ? [{ file, excerpt: excerpt(result.stdout) }] : [];
    }),
  };
});

const reviews = [];
for (const number of new Set(snapshot?.signals.map((signal) => signal.pr) ?? [])) {
  const pr = JSON.parse(runCmd(['gh', 'pr', 'view', String(number), '--repo', repo, '--json', 'number,url,title,state,reviewDecision,statusCheckRollup']).stdout);
  if (pr.number !== number || !Array.isArray(pr.statusCheckRollup)) throw new Error(`Unexpected detail for PR #${number}.`);
  reviews.push({ number, url: pr.url, title: excerpt(pr.title), state: pr.state, review_decision: pr.reviewDecision,
    checks: pr.statusCheckRollup.slice(0, 12).map((check) => ({ name: excerpt(check.name ?? check.context), result: check.conclusion ?? check.state })) });
}
const issues = new Set(evidence.flatMap((run) => run.issue ? [run.issue] : []));
for (const issue of [...issues].slice(0, 6)) {
  const result = runCmd(['gh', 'pr', 'list', '--repo', repo, '--state', 'all', '--limit', '12', '--search', `head:factory/issue-${issue}-`, '--json', 'number,url,headRefName,state,reviewDecision,reviews,statusCheckRollup'], { allowFail: true });
  if (result.code !== 0) continue;
  const prs = JSON.parse(result.stdout);
  if (!Array.isArray(prs)) continue;
  for (const pr of prs.filter((item) => item.headRefName?.startsWith(`factory/issue-${issue}-`)).slice(0, 2)) {
    reviews.push({ issue, number: pr.number, url: pr.url, state: pr.state, review_decision: pr.reviewDecision,
      maintainer_reviews: (pr.reviews ?? []).filter((review) => ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(review.authorAssociation) && review.state === 'CHANGES_REQUESTED').slice(-3).map((review) => ({ state: review.state, excerpt: excerpt(review.body) })),
      checks: (pr.statusCheckRollup ?? []).slice(0, 12).map((check) => ({ name: excerpt(check.name ?? check.context), result: check.conclusion ?? check.state })) });
  }
}
const harness = runCmd(['git', 'ls-tree', '-r', '--name-only', '-z', base]).stdout.split('\0').filter((path) => /(?:^|\/)(?:scripts|tests|skills|\.archon|\.github)\/|(?:^|\/)(?:AGENTS\.md|CODING_STANDARDS\.md|package\.json|Makefile)$|lint|guardrail/i.test(path)).slice(0, 250);
mkdirSync(artifacts, { recursive: true });
const evidencePath = join(artifacts, 'evidence.json');
writeFileSync(evidencePath, JSON.stringify({ repo, base_sha: base, run_ids: batch.map((run) => run.id), runs: evidence, pr_signals: snapshot?.signals ?? [], reviews, harness }, null, 2), { mode: 0o600 });
emit({ repo, base_sha: base, evidence_path: evidencePath });
