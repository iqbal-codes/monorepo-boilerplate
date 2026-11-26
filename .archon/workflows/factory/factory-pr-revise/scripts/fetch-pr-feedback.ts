/**
 * Fetches an open GitHub PR, verifies maintainer authority against
 * `.archon/sdlc/policy/maintainers.json`, collects actionable human feedback
 * (`CHANGES_REQUESTED` reviews, inline review comments, and `/fix`/`/revise` comments),
 * resolves the governing slice contract, checks out the PR branch, and writes
 * `$ARTIFACTS_DIR/contract.md` + `$ARTIFACTS_DIR/pr-feedback.md`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectGitRepo,
  emit,
  extractLinkedIssueNumber,
  parseSliceContract,
  resolvePreviewCommand,
  runCmd,
  text,
  validateSliceContract,
} from '../../.shared/contract.ts';
import { setFactoryState } from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';
import { isMaintainer, loadMaintainers } from '../../.shared/maintainers.ts';

interface PrReview {
  id?: number;
  author?: { login?: string };
  state?: string;
  body?: string;
  submittedAt?: string;
}

interface PrComment {
  id?: string | number;
  author?: { login?: string };
  body?: string;
  createdAt?: string;
}

interface InlineComment {
  id: number;
  path: string;
  line?: number | null;
  original_line?: number | null;
  diff_hunk?: string;
  body?: string;
  created_at?: string;
  user?: { login?: string } | null;
  in_reply_to_id?: number;
}

interface PrPayload {
  number: number;
  url: string;
  title: string;
  body: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  commits?: { committedDate?: string; oid?: string }[];
  reviews?: PrReview[];
  comments?: PrComment[];
}

export function isRevisionDirective(body: string): boolean {
  return /^\s*\/(?:fix|revise|change)\b/im.test(body);
}

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(join(artifactsDir, 'evidence'), { recursive: true });
mkdirSync(join(artifactsDir, 'review'), { recursive: true });

const prInput = text(process.env.INPUTS_PR);
const issueInput = text(process.env.INPUTS_ISSUE);
const specFileInput = text(process.env.INPUTS_SPEC_FILE);
const repoInput = text(process.env.INPUTS_REPO) || detectGitRepo();
const previewInput = text(process.env.INPUTS_PREVIEW_CMD);
const userArgs = text(process.env.ARGUMENTS);

function failClosed(reason: string, extra: Partial<{
  prNumber: number;
  prUrl: string;
  issueNumber: number;
  title: string;
  baseBranch: string;
  branchName: string;
}> = {}): never {
  const contractPath = join(artifactsDir, 'contract.md');
  const feedbackPath = join(artifactsDir, 'pr-feedback.md');
  if (!existsSync(contractPath)) writeFileSync(contractPath, '', 'utf8');
  if (!existsSync(feedbackPath)) writeFileSync(feedbackPath, `# PR Revision Blocked\n\n${reason}\n`, 'utf8');
  emit({
    ready: false,
    cancel_reason: reason,
    repo: repoInput,
    pr_number: extra.prNumber ?? 0,
    pr_url: extra.prUrl ?? '',
    issue_number: extra.issueNumber ?? 0,
    title: extra.title ?? 'PR Revision',
    slice_id: '',
    phase: '',
    risk_tier: 'standard',
    review_mode: 'standard',
    has_ui: false,
    run_ux: false,
    preview_cmd: '',
    base_branch: extra.baseBranch ?? 'main',
    base_sha: 'HEAD',
    branch_name: extra.branchName ?? '',
    verification_command: '',
    owned_paths: [],
    forbidden_paths: [],
    contract_path: contractPath,
    feedback_path: feedbackPath,
    before_summary: '',
    feedback_summary: reason,
  });
  process.exit(0);
}

const prMatch = (prInput || userArgs).match(/#?(\d+)/);
const prNumber = prMatch ? Number.parseInt(prMatch[1], 10) : 0;
if (!prNumber || !repoInput) {
  failClosed('Missing PR number or GitHub owner/repo.');
}

const maintainers = loadMaintainers();
if (maintainers.size === 0) {
  failClosed('No valid maintainer logins configured in .archon/sdlc/policy/maintainers.json.');
}

const prRaw = runCmd([
  'gh',
  'pr',
  'view',
  String(prNumber),
  '--repo',
  repoInput,
  '--json',
  'number,url,title,body,state,isDraft,headRefName,baseRefName,headRefOid,commits,reviews,comments',
]);
const pr = JSON.parse(prRaw.stdout) as PrPayload;

if (pr.state !== 'OPEN') {
  failClosed(`PR #${prNumber} is ${pr.state}, not OPEN.`, {
    prNumber: pr.number,
    prUrl: pr.url,
    title: pr.title,
    baseBranch: pr.baseRefName,
    branchName: pr.headRefName,
  });
}

const inlineRaw = runCmd(
  ['gh', 'api', `repos/${repoInput}/pulls/${prNumber}/comments`, '--paginate'],
  { allowFail: true }
);
let inlineComments: InlineComment[] = [];
if (inlineRaw.code === 0 && inlineRaw.stdout) {
  try {
    inlineComments = JSON.parse(inlineRaw.stdout) as InlineComment[];
  } catch {
    inlineComments = [];
  }
}

const lastReviseMarker = [...(pr.comments ?? [])]
  .filter((c) => (c.body ?? '').includes('<!-- archon-factory-revise-done -->') || /### 🔄 Implementer Update/i.test(c.body ?? ''))
  .map((c) => Date.parse(c.createdAt ?? ''))
  .filter(Number.isFinite)
  .sort((a, b) => a - b)
  .at(-1) ?? 0;

const lastCommitTs = (pr.commits ?? [])
  .map((c) => Date.parse(c.committedDate ?? ''))
  .filter(Number.isFinite)
  .sort((a, b) => a - b)
  .at(-1) ?? 0;

const sinceTs = Math.max(lastReviseMarker, 0);

const maintainerReviews = (pr.reviews ?? []).filter((r) => {
  if (!isMaintainer(r.author?.login, maintainers)) return false;
  if (r.state !== 'CHANGES_REQUESTED') return false;
  const ts = Date.parse(r.submittedAt ?? '');
  return !Number.isFinite(ts) || ts >= sinceTs;
});

const maintainerInline = inlineComments.filter((c) => {
  if (!isMaintainer(c.user?.login, maintainers)) return false;
  const ts = Date.parse(c.created_at ?? '');
  return !Number.isFinite(ts) || ts >= Math.min(sinceTs || ts, lastCommitTs || ts);
});

const maintainerDirectives = (pr.comments ?? []).filter((c) => {
  if (!isMaintainer(c.author?.login, maintainers)) return false;
  const body = c.body ?? '';
  if (!isRevisionDirective(body)) return false;
  const ts = Date.parse(c.createdAt ?? '');
  return !Number.isFinite(ts) || ts >= sinceTs;
});

if (
  maintainerReviews.length === 0 &&
  maintainerInline.length === 0 &&
  maintainerDirectives.length === 0
) {
  failClosed('No actionable maintainer CHANGES_REQUESTED review, inline comment, or /fix directive found.', {
    prNumber: pr.number,
    prUrl: pr.url,
    title: pr.title,
    baseBranch: pr.baseRefName,
    branchName: pr.headRefName,
  });
}

// Resolve governing slice contract
const linkedIssue = Number.parseInt(issueInput.replace(/^#/, ''), 10) || extractLinkedIssueNumber(pr.body ?? '');
let contractMarkdown = '';
let rawTitle = pr.title;
let labels: string[] = [];

if (specFileInput) {
  if (!existsSync(specFileInput)) {
    failClosed(`spec_file not found: ${specFileInput}`, {
      prNumber: pr.number,
      prUrl: pr.url,
      issueNumber: linkedIssue,
      title: pr.title,
      baseBranch: pr.baseRefName,
      branchName: pr.headRefName,
    });
  }
  contractMarkdown = readFileSync(specFileInput, 'utf8');
} else if (linkedIssue > 0) {
  const ghIssue = runCmd([
    'gh',
    'issue',
    'view',
    String(linkedIssue),
    '--repo',
    repoInput,
    '--json',
    'title,body,labels,url',
  ]);
  const issueData = JSON.parse(ghIssue.stdout) as {
    title: string;
    body: string;
    labels: { name: string }[];
    url: string;
  };
  rawTitle = issueData.title;
  labels = (issueData.labels ?? []).map((l) => l.name);
  contractMarkdown = `# ${issueData.title}\n\n> **GitHub Issue:** [#${linkedIssue}](${issueData.url})\n\n${issueData.body ?? ''}`;
} else if (userArgs && !/^\s*#?\d+\s*$/.test(userArgs)) {
  contractMarkdown = userArgs;
} else {
  failClosed(`PR #${prNumber} does not reference a linked issue (#N) and no spec_file was provided.`, {
    prNumber: pr.number,
    prUrl: pr.url,
    title: pr.title,
    baseBranch: pr.baseRefName,
    branchName: pr.headRefName,
  });
}

const parsed = parseSliceContract(contractMarkdown, { title: rawTitle, labels });
const readiness = validateSliceContract(parsed);
if (!readiness.ok) {
  failClosed(`Incomplete slice contract: ${readiness.errors.join('; ')}`, {
    prNumber: pr.number,
    prUrl: pr.url,
    issueNumber: linkedIssue,
    title: parsed.title,
    baseBranch: pr.baseRefName,
    branchName: pr.headRefName,
  });
}

// Ensure worktree sits on the PR head branch and compute base merge-base SHA for boundary gating
runCmd(['git', 'fetch', 'origin', pr.baseRefName, pr.headRefName]);
runCmd(['git', 'checkout', '-B', pr.headRefName, 'FETCH_HEAD']);
const currentHead = runCmd(['git', 'rev-parse', 'HEAD']).stdout;
const remoteHead = runCmd(['git', 'rev-parse', `origin/${pr.headRefName}`], { allowFail: true }).stdout;
if (remoteHead && currentHead !== remoteHead) {
  runCmd(['git', 'reset', '--hard', remoteHead]);
}
const baseSha =
  runCmd(['git', 'merge-base', `origin/${pr.baseRefName}`, 'HEAD'], { allowFail: true }).stdout ||
  runCmd(['git', 'rev-parse', `origin/${pr.baseRefName}`], { allowFail: true }).stdout ||
  'HEAD';

const contractPath = join(artifactsDir, 'contract.md');
writeFileSync(contractPath, contractMarkdown, 'utf8');

const feedbackLines: string[] = [
  `# Human Maintainer Feedback for PR #${pr.number}`,
  '',
  `- **PR:** [${pr.title}](${pr.url})`,
  `- **Branch:** \`${pr.headRefName}\` -> \`${pr.baseRefName}\``,
  `- **Linked Issue:** ${linkedIssue > 0 ? `#${linkedIssue}` : 'None'}`,
  '',
];

if (maintainerReviews.length > 0) {
  feedbackLines.push('## Reviews (`CHANGES_REQUESTED`)', '');
  for (const r of maintainerReviews) {
    feedbackLines.push(
      `### Review by @${r.author?.login ?? 'maintainer'} (${r.submittedAt ?? ''})`,
      r.body?.trim() || '_Requested changes with inline comments._',
      ''
    );
  }
}

if (maintainerInline.length > 0) {
  feedbackLines.push('## Inline Code Review Comments', '');
  for (const c of maintainerInline) {
    const loc = c.line || c.original_line ? `${c.path}:${c.line || c.original_line}` : c.path;
    feedbackLines.push(
      `- **\`${loc}\`** (@${c.user?.login ?? 'maintainer'}): ${c.body?.trim() ?? ''}`
    );
  }
  feedbackLines.push('');
}

if (maintainerDirectives.length > 0) {
  feedbackLines.push('## PR Comment Directives', '');
  for (const d of maintainerDirectives) {
    feedbackLines.push(
      `### Comment by @${d.author?.login ?? 'maintainer'} (${d.createdAt ?? ''})`,
      (d.body ?? '').trim(),
      ''
    );
  }
}

const feedbackPath = join(artifactsDir, 'pr-feedback.md');
writeFileSync(feedbackPath, feedbackLines.join('\n'), 'utf8');

setFactoryState(repoInput, { issueNumber: linkedIssue || undefined, prNumber: pr.number }, FACTORY_LABELS.inProgress);

const previewCmd = resolvePreviewCommand(previewInput);
const runUx = parsed.hasUi && previewCmd.length > 0;
const feedbackSummary = `${maintainerReviews.length} review(s), ${maintainerInline.length} inline comment(s), ${maintainerDirectives.length} directive(s)`;

emit({
  ready: true,
  cancel_reason: '',
  repo: repoInput,
  pr_number: pr.number,
  pr_url: pr.url,
  issue_number: linkedIssue,
  title: parsed.title,
  slice_id: parsed.sliceId,
  phase: parsed.phase,
  risk_tier: parsed.riskTier,
  review_mode: parsed.riskTier,
  has_ui: parsed.hasUi,
  run_ux: runUx,
  preview_cmd: previewCmd,
  base_branch: pr.baseRefName,
  base_sha: baseSha,
  branch_name: pr.headRefName,
  verification_command: readiness.verificationCommand,
  owned_paths: parsed.ownedPaths,
  forbidden_paths: parsed.forbiddenPaths,
  contract_path: contractPath,
  feedback_path: feedbackPath,
  before_summary: `PR #${pr.number} base ${pr.baseRefName} @ ${baseSha.slice(0, 7)}.`,
  feedback_summary: feedbackSummary,
});
