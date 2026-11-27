/**
 * Fetches an slice contract (GitHub issue, local spec_file, or ARGUMENTS),
 * verifies Blocked By dependencies, parses boundaries & verification command,
 * and writes the canonical contract to $ARTIFACTS_DIR/contract.md.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  appendMissingDocRefsNote,
  buildQaTestCasesMarkdown,
  detectBaseBranch,
  detectGitRepo,
  emit,
  extractNativeBlockedByNumbers,
  hasTrackedWorkAreas,
  parseSliceContract,
  resolvePreviewCommand,
  runCmd,
  text,
  validateSliceContract,
} from '../../.shared/contract.ts';
import { postIssueComment, setFactoryState } from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';
import { assertReservation, fetchPolicyBase, parseDeliveryClaim, resolveForbiddenPaths } from '../../.shared/ownership.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(join(artifactsDir, 'evidence'), { recursive: true });
mkdirSync(join(artifactsDir, 'review'), { recursive: true });

const issueInput = text(process.env.INPUTS_ISSUE);
const specFileInput = text(process.env.INPUTS_SPEC_FILE);
const repoInput = text(process.env.INPUTS_REPO) || detectGitRepo();
const baseBranch = text(process.env.INPUTS_BASE_BRANCH) || detectBaseBranch();
const previewInput = text(process.env.INPUTS_PREVIEW_CMD);
const userArgs = text(process.env.ARGUMENTS);

const policyBase = fetchPolicyBase(baseBranch);
const baseSha = runCmd(['git', 'merge-base', policyBase, 'HEAD']).stdout;
const claim = parseDeliveryClaim(process.env.INPUTS_ALLOWED_FOLDERS, process.env.INPUTS_EXCLUSIVE);
const allowedFolders = claim.kind === 'reserved' ? claim.folders : [];

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

function bootstrapUiWorktree(): string {
  if (!existsSync('package.json')) return '';
  let installError = '';
  if (!existsSync('node_modules') && (existsSync('bun.lock') || existsSync('bun.lockb'))) {
    const install = runCmd(['bun', 'install', '--frozen-lockfile'], { allowFail: true });
    if (install.code !== 0) {
      const detail = (install.stderr || install.stdout).split(/\r?\n/)[0]?.trim();
      installError = detail || `bun install --frozen-lockfile exited ${install.code}`;
    }
  }
  if (!installError && existsSync('scripts/env-init.ts')) {
    runCmd(['bun', 'scripts/env-init.ts'], { allowFail: true });
  }
  return installError;
}

function checkBaselinePreviewReady(cmd: string, bootstrapError: string): { ok: boolean; reason: string } {
  if (!cmd) return { ok: false, reason: 'no preview hook' };
  if (bootstrapError) return { ok: false, reason: bootstrapError };
  const scriptPath = cmd.replace(/^\.\//, '').split(/\s+/)[0] ?? '';
  if (scriptPath && existsSync(scriptPath)) {
    const content = readFileSync(scriptPath, 'utf8');
    if (content.includes('--check')) {
      const probe = runCmd(['bash', '-lc', `${cmd} --check`], { allowFail: true });
      if (probe.code !== 0) {
        const detail = (probe.stderr || probe.stdout).split(/\r?\n/)[0]?.trim();
        return { ok: false, reason: detail || `preview preflight exited ${probe.code}` };
      }
      return { ok: true, reason: '' };
    }
  }
  if (existsSync('package.json') && !existsSync('node_modules')) {
    return { ok: false, reason: 'node_modules not installed on baseline worktree' };
  }
  return { ok: true, reason: '' };
}

const runUx = parsed.hasUi && previewCmd.length > 0;
const wantsCaptureBefore = runUx && hasTrackedWorkAreas(parsed.workAreas);
const bootstrapError =
  contractOk && unmetBlockers.length === 0 && (wantsCaptureBefore || parsed.hasUi)
    ? bootstrapUiWorktree()
    : '';
const baselinePreview = wantsCaptureBefore
  ? checkBaselinePreviewReady(previewCmd, bootstrapError)
  : { ok: false, reason: '' };
const captureBefore = baselinePreview.ok;
if (wantsCaptureBefore && !captureBefore) {
  writeFileSync(
    join(artifactsDir, 'evidence', 'before.md'),
    [
      '# Before Evidence (Skipped — Preflight)',
      '',
      `- **Base:** \`${baseBranch}\` @ \`${baseSha.slice(0, 7)}\``,
      `- **Reason:** ${baselinePreview.reason}`,
      '',
    ].join('\n'),
    'utf8'
  );
}
const forbiddenPaths = resolveForbiddenPaths(policyBase, parsed.forbiddenPaths);
const runId = text(process.env.INPUTS_RUN_ID);
if (contractOk && unmetBlockers.length === 0) assertReservation(runId, claim);

const slugSource = (parsed.sliceId || parsed.title)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 36);
const branchName =
  issueNumber > 0 ? `factory/issue-${issueNumber}-${slugSource}` : `factory/${slugSource || 'task'}-${runId}`;

const contractPath = join(artifactsDir, 'contract.md');
writeFileSync(contractPath, appendMissingDocRefsNote(markdown), 'utf8');
writeFileSync(join(artifactsDir, 'qa-testcases.md'), buildQaTestCasesMarkdown(parsed), 'utf8');

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
        'Removed `factory:ready`. Run `factory-refine` or supply observable acceptance criteria and a runnable verification command before re-queueing.',
      ].join('\n'),
      artifactsDir
    );
  } else if (unmetBlockers.length === 0) {
    setFactoryState(repoInput, { issueNumber }, FACTORY_LABELS.inProgress);
  } else {
    setFactoryState(repoInput, { issueNumber }, FACTORY_LABELS.blocked);
  }
}

const beforeSummary =
  wantsCaptureBefore && !captureBefore
    ? `Base ${baseBranch} @ ${baseSha.slice(0, 7)} (before capture skipped: ${baselinePreview.reason}).`
    : `Base ${baseBranch} @ ${baseSha.slice(0, 7)}.`;

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
  allowed_folders: allowedFolders,
  forbidden_paths: forbiddenPaths,
  blockers_ok: unmetBlockers.length === 0,
  unmet_blockers: unmetBlockers,
  contract_path: contractPath,
  before_summary: beforeSummary,
});
