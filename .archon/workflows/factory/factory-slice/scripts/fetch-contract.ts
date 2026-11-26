/**
 * Fetches an slice contract (GitHub issue, local spec_file, or ARGUMENTS),
 * verifies Blocked By dependencies, parses boundaries & verification command,
 * and writes the canonical contract to $ARTIFACTS_DIR/contract.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectBaseBranch,
  detectGitRepo,
  emit,
  extractNativeBlockedByNumbers,
  hasTrackedOwnedFiles,
  parseSliceContract,
  resolvePreviewCommand,
  runCmd,
  text,
  validateSliceContract,
} from '../../.shared/contract.ts';
import { postIssueComment, setFactoryState } from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(join(artifactsDir, 'evidence'), { recursive: true });
mkdirSync(join(artifactsDir, 'review'), { recursive: true });

const issueInput = text(process.env.INPUTS_ISSUE);
const specFileInput = text(process.env.INPUTS_SPEC_FILE);
const repoInput = text(process.env.INPUTS_REPO) || detectGitRepo();
const baseBranch = text(process.env.INPUTS_BASE_BRANCH) || detectBaseBranch();
const previewInput = text(process.env.INPUTS_PREVIEW_CMD);
const userArgs = text(process.env.ARGUMENTS);

const baseSha =
  runCmd(['git', 'rev-parse', 'HEAD'], { allowFail: true }).stdout || 'HEAD';

let source: 'issue' | 'file' | 'arguments' = 'arguments';
let issueNumber = 0;
let rawTitle = '';
let labels: string[] = [];
let markdown = '';

let nativeBlockedBy: number[] = [];

if (issueInput) {
  source = 'issue';
  issueNumber = Number.parseInt(issueInput.replace(/^#/, ''), 10);
  if (!Number.isFinite(issueNumber) || issueNumber <= 0) {
    throw new Error(`Invalid issue number: ${issueInput}`);
  }
  if (!repoInput) {
    throw new Error('Could not determine GitHub owner/repo; pass --input repo=<owner/repo>.');
  }
  let gh = runCmd(
    [
      'gh',
      'issue',
      'view',
      String(issueNumber),
      '--repo',
      repoInput,
      '--json',
      'title,body,labels,url,blockedBy',
    ],
    { allowFail: true }
  );
  if (gh.code !== 0) {
    gh = runCmd([
      'gh',
      'issue',
      'view',
      String(issueNumber),
      '--repo',
      repoInput,
      '--json',
      'title,body,labels,url',
    ]);
  }
  const data = JSON.parse(gh.stdout) as {
    title: string;
    body: string;
    labels: { name: string }[];
    url: string;
    blockedBy?: unknown;
  };
  rawTitle = data.title;
  labels = (data.labels ?? []).map((l) => l.name);
  nativeBlockedBy = extractNativeBlockedByNumbers(data.blockedBy).all;
  markdown = `# ${data.title}\n\n> **GitHub Issue:** [#${issueNumber}](${data.url})\n\n${data.body ?? ''}`;
} else if (specFileInput) {
  source = 'file';
  if (!existsSync(specFileInput)) {
    throw new Error(`spec_file not found: ${specFileInput}`);
  }
  markdown = readFileSync(specFileInput, 'utf8');
} else if (userArgs) {
  source = 'arguments';
  markdown = userArgs;
} else {
  throw new Error('Provide --input issue=<N>, --input spec_file=<path>, or a task message.');
}

const parsed = parseSliceContract(markdown, { title: rawTitle, labels });
const readiness = validateSliceContract(parsed);
const contractOk = readiness.ok;
const contractError = readiness.errors.join('; ');

// Verify Blocked By dependencies (both Markdown and native GitHub blockedBy) when running from an issue
const allBlockers = [...new Set([...parsed.blockedBy, ...nativeBlockedBy])];
const unmetBlockers: string[] = [];
if (source === 'issue' && repoInput && allBlockers.length > 0) {
  for (const dep of allBlockers) {
    const check = runCmd(
      ['gh', 'issue', 'view', String(dep), '--repo', repoInput, '--json', 'state'],
      { allowFail: true }
    );
    if (check.code !== 0) {
      unmetBlockers.push(`#${dep} (unreadable)`);
      continue;
    }
    const state = (JSON.parse(check.stdout) as { state?: string }).state ?? 'OPEN';
    if (state !== 'CLOSED') {
      // Accept merged PRs on factory branches.
      const prs = runCmd(
        [
          'gh',
          'pr',
          'list',
          '--repo',
          repoInput,
          '--state',
          'merged',
          '--limit',
          '100',
          '--json',
          'headRefName',
        ],
        { allowFail: true }
      );
      let mergedMatch = false;
      if (prs.code === 0 && prs.stdout) {
        const list = JSON.parse(prs.stdout) as { headRefName: string }[];
        mergedMatch = list.some((p) =>
          new RegExp(`^factory/issue-${dep}(?:-|$)`).test(p.headRefName)
        );
      }
      if (!mergedMatch) unmetBlockers.push(`#${dep}`);
    }
  }
}

const previewCmd = resolvePreviewCommand(previewInput);

const runUx = parsed.hasUi && previewCmd.length > 0;
const captureBefore = runUx && hasTrackedOwnedFiles(parsed.ownedPaths);

const slugSource = (parsed.sliceId || parsed.title)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 36);
const branchName =
  issueNumber > 0 ? `factory/issue-${issueNumber}-${slugSource}` : `factory/${slugSource || 'task'}`;

const contractPath = join(artifactsDir, 'contract.md');
writeFileSync(contractPath, markdown, 'utf8');

if (source === 'issue' && repoInput && issueNumber > 0) {
  if (!contractOk) {
    // Fail-closed: drop `factory:ready` so vague/incomplete issues cannot loop into factory-slice
    setFactoryState(repoInput, { issueNumber }, FACTORY_LABELS.triage);
    postIssueComment(
      repoInput,
      issueNumber,
      [
        '> *Deterministic Contract Readiness Gate (`factory-slice`) blocked execution (0 LLM tokens).*',
        '',
        `**Reason:** ${contractError}`,
        '',
        'Removed `factory:ready` so this issue is not picked up without scope boundaries. Run `factory-refine` or add `**Owned / Allowed Paths:**` and `**Verification Command:**` before re-queueing.',
      ].join('\n'),
      artifactsDir
    );
  } else if (unmetBlockers.length === 0) {
    setFactoryState(repoInput, { issueNumber }, FACTORY_LABELS.inProgress);
  } else {
    setFactoryState(repoInput, { issueNumber }, FACTORY_LABELS.blocked);
  }
}

const beforeSummary = `Base ${baseBranch} @ ${baseSha.slice(0, 7)} (owned paths: ${parsed.ownedPaths.length}).`;

emit({
  source,
  repo: repoInput,
  issue_number: issueNumber,
  title: parsed.title,
  slice_id: parsed.sliceId,
  phase: parsed.phase,
  risk_tier: parsed.riskTier,
  review_mode: parsed.riskTier,
  contract_ok: contractOk,
  contract_error: contractError,
  has_ui: parsed.hasUi,
  run_ux: runUx,
  capture_before: captureBefore,
  preview_cmd: previewCmd,
  base_branch: baseBranch,
  base_sha: baseSha,
  branch_name: branchName,
  verification_command: readiness.verificationCommand,
  owned_paths: parsed.ownedPaths,
  forbidden_paths: parsed.forbiddenPaths,
  blockers_ok: unmetBlockers.length === 0,
  unmet_blockers: unmetBlockers,
  contract_path: contractPath,
  before_summary: beforeSummary,
});
