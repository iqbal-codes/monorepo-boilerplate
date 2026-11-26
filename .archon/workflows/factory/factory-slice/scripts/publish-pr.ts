/**
 * Deterministic PR & stage publisher (0 LLM tokens) supporting 3 lifecycle modes:
 *   - `draft`    : Commit initial work, push branch, upload any `before-*.png` / `impl-*.png`
 *                  UI evidence to `pr-evidence`, open Draft PR with compact `/pr`-style body
 *                  (`## Summary`, `## Evidence`, `## Merge Danger`), and set `factory:review`.
 *   - `sync`     : Commit & push QA fix delta from resumed implementer, upload refreshed
 *                  evidence PNGs, post Round N update comment (never overwrites PR body), flip to `factory:review`.
 *   - `finalize` : Upload all evidence PNGs to `pr-evidence`, mark PR Ready when
 *                  `rounds_ready=true`, post Before/After QA evidence & merge prompt as a PR
 *                  comment when updating an existing PR (never overwrites original PR body).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { emit, runCmd, text } from '../../.shared/contract.ts';
import {
  findOpenPr,
  postPrComment,
  setFactoryState,
  syncBranchChanges,
} from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';
import {
  extractVerificationEvidenceLine,
  parsePrSummarySections,
} from '../../.shared/pr-format.ts';

interface UploadedImage {
  name: string;
  url: string;
}

interface UploadedEvidence {
  before: UploadedImage[];
  impl: UploadedImage[];
  after: UploadedImage[];
}

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
const evidenceDir = join(artifactsDir, 'evidence');

const modeRaw = text(process.env.INPUTS_MODE) || 'finalize';
const mode = (modeRaw === 'draft' || modeRaw === 'sync' ? modeRaw : 'finalize') as
  | 'draft'
  | 'sync'
  | 'finalize';

const repo = text(process.env.INPUTS_REPO);
const issueNumber = Number.parseInt(text(process.env.INPUTS_ISSUE_NUMBER) || '0', 10);
const title = text(process.env.INPUTS_TITLE);
const sliceId = text(process.env.INPUTS_SLICE_ID);
const phase = text(process.env.INPUTS_PHASE);
const riskTier = text(process.env.INPUTS_RISK_TIER) || 'standard';
const hasUi = text(process.env.INPUTS_HAS_UI) === 'true';
const baseBranch = text(process.env.INPUTS_BASE_BRANCH) || 'main';
const baseSha = text(process.env.INPUTS_BASE_SHA);
const branchName = text(process.env.INPUTS_BRANCH_NAME);
const beforeSummary = text(process.env.INPUTS_BEFORE_SUMMARY);
const beforeCaptureSummary = text(process.env.INPUTS_BEFORE_CAPTURE_SUMMARY);
const roundsReady = text(process.env.INPUTS_ROUNDS_READY) === 'true';
const roundsReason = text(process.env.INPUTS_ROUNDS_REASON);
const roundsSummary = text(process.env.INPUTS_ROUNDS_SUMMARY);
const implSummary = text(process.env.INPUTS_IMPL_SUMMARY);
const roundNum = Number.parseInt(text(process.env.INPUTS_ROUND) || '1', 10) || 1;
const diffStatInput = text(process.env.INPUTS_DIFF_STAT);
const mergeMode = text(process.env.INPUTS_MERGE_MODE) || 'ask';

function readSnippet(filePath: string, maxChars = 3000): string {
  if (!existsSync(filePath)) return '';
  const content = readFileSync(filePath, 'utf8').trim();
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n... (truncated)` : content;
}

function readCompactSummaryAndDanger(): { summaryBlock: string; dangerBlock: string } {
  const prSummaryRaw = readSnippet(join(artifactsDir, 'pr-summary.md'), 6000);
  const parsed = parsePrSummarySections(prSummaryRaw);
  const implRaw = readSnippet(join(artifactsDir, 'implementation.md'), 4000);

  let summaryBlock = parsed.summary;
  if (!summaryBlock && implRaw) {
    const overviewMatch = implRaw.match(/##\s+Overview[^\n]*\n([\s\S]*?)(?=\n##\s+|$)/i);
    summaryBlock = (overviewMatch?.[1] || implRaw).trim().slice(0, 1200);
  }

  let dangerBlock = parsed.mergeDanger;
  if (!dangerBlock) {
    const door = phase === 'L0' || phase === 'L1' || riskTier === 'strict'
      ? '**Door:** Two-way (guarded by `risk:strict` / schema checks — verify contracts before merge)'
      : '**Door:** Two-way — isolated slice, easy to revert';
    const blast = hasUi ? 'UI' : phase || 'Scoped';
    dangerBlock = `${door}\n**Blast Radius:** ${blast}`;
  }

  return {
    summaryBlock: summaryBlock || implSummary || 'See diff for changes.',
    dangerBlock,
  };
}

function formatDiffSection(diffStat: string): string {
  const lines = diffStat.split(/\r?\n/).filter(Boolean);
  const block = ['```text', diffStat, '```'].join('\n');
  if (lines.length > 15) {
    return `<details><summary>Changed Files (${lines[lines.length - 1]?.trim() || `${lines.length} lines`})</summary>\n\n${block}\n\n</details>`;
  }
  return block;
}

function uploadEvidenceImages(shortSha: string): UploadedEvidence {
  const empty: UploadedEvidence = { before: [], impl: [], after: [] };
  if (!repo || !existsSync(evidenceDir)) return empty;

  const pngs = readdirSync(evidenceDir)
    .filter((f) => /\.png$/i.test(f))
    .sort();
  if (pngs.length === 0) return empty;

  const folder = issueNumber > 0 ? `issue-${issueNumber}/${shortSha}` : `run/${shortSha}`;
  const scratchDir = join(artifactsDir, '.archon', 'scratch', 'pr-evidence');
  let pushed = false;

  for (let attempt = 0; attempt < 3 && !pushed; attempt++) {
    rmSync(scratchDir, { recursive: true, force: true });
    mkdirSync(scratchDir, { recursive: true });
    try {
      const fetchEv = runCmd(['git', 'fetch', 'origin', 'pr-evidence'], { allowFail: true });
      if (fetchEv.code === 0) {
        runCmd(['git', 'worktree', 'add', '--detach', scratchDir, 'FETCH_HEAD']);
        runCmd(['git', 'checkout', '-B', 'pr-evidence'], { cwd: scratchDir });
      } else {
        runCmd(['git', 'worktree', 'add', '--detach', scratchDir, 'HEAD']);
        runCmd(['git', 'checkout', '--orphan', 'pr-evidence'], { cwd: scratchDir });
        runCmd(['git', 'rm', '-rf', '.'], { cwd: scratchDir, allowFail: true });
      }

      const destDir = join(scratchDir, folder);
      mkdirSync(destDir, { recursive: true });
      for (const file of pngs) {
        copyFileSync(join(evidenceDir, file), join(destDir, file));
      }

      runCmd(['git', 'add', folder], { cwd: scratchDir });
      runCmd(
        ['git', 'commit', '-m', `evidence: ${sliceId || `issue-${issueNumber}`} @ ${shortSha}`],
        { cwd: scratchDir, allowFail: true }
      );
      const pushRes = runCmd(['git', 'push', 'origin', 'HEAD:refs/heads/pr-evidence'], {
        cwd: scratchDir,
        allowFail: true,
      });
      if (pushRes.code === 0) {
        pushed = true;
      }
    } finally {
      runCmd(['git', 'worktree', 'remove', '--force', scratchDir], { allowFail: true });
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  if (!pushed) return empty;

  const result: UploadedEvidence = { before: [], impl: [], after: [] };
  for (const file of pngs) {
    const url = `https://github.com/${repo}/blob/pr-evidence/${folder}/${file}?raw=true`;
    const lower = file.toLowerCase();
    if (lower.startsWith('before')) {
      result.before.push({ name: file, url });
    } else if (lower.startsWith('impl')) {
      result.impl.push({ name: file, url });
    } else {
      result.after.push({ name: file, url });
    }
  }
  return result;
}

function renderEvidenceSection(
  evidence: UploadedEvidence,
  resolvedBeforeSummary: string,
  fallbackAfterLine: string
): string[] {
  const lines: string[] = ['## Evidence'];
  const primaryAfter = evidence.after.length > 0 ? evidence.after : evidence.impl;
  const afterColumnTitle = evidence.after.length > 0 ? 'After (QA)' : 'After (Implementer)';

  if (evidence.before.length > 0 || primaryAfter.length > 0) {
    lines.push(`| Before | ${afterColumnTitle} |`, '| :---: | :---: |');
    const rows = Math.max(evidence.before.length, primaryAfter.length, 1);
    for (let i = 0; i < rows; i++) {
      const b = evidence.before[i]
        ? `![${evidence.before[i].name}](${evidence.before[i].url})<br/><sub>${evidence.before[i].name}</sub>`
        : i === 0
          ? `_${resolvedBeforeSummary}_`
          : '—';
      const a = primaryAfter[i]
        ? `![${primaryAfter[i].name}](${primaryAfter[i].url})<br/><sub>${primaryAfter[i].name}</sub>`
        : '—';
      lines.push(`| ${b} | ${a} |`);
    }
    lines.push('');
    return lines;
  }

  lines.push(`- **Before:** ${resolvedBeforeSummary}`, `- **After:** ${fallbackAfterLine}`, '');
  return lines;
}

function ensurePrCreated(
  prNum: number,
  currentUrl: string,
  prTitle: string,
  bodyPath: string,
  isDraftPr: boolean
): { prNumber: number; prUrl: string } {
  // Never overwrite an existing PR's title or body (preserves original summary & manual edits)
  if (prNum > 0 || !repo) {
    return { prNumber: prNum, prUrl: currentUrl };
  }

  const args = [
    'gh',
    'pr',
    'create',
    '--repo',
    repo,
    '--base',
    baseBranch,
    '--head',
    branchName,
    '--title',
    prTitle,
    '--body-file',
    bodyPath,
  ];
  if (isDraftPr) args.push('--draft');
  const created = runCmd(args);
  const createdUrl = created.stdout.split(/\r?\n/).pop()?.trim() || '';
  const numMatch = createdUrl.match(/\/pull\/(\d+)/);
  return {
    prNumber: numMatch ? Number.parseInt(numMatch[1], 10) : 0,
    prUrl: createdUrl,
  };
}

const labelTag = sliceId || (issueNumber > 0 ? `#${issueNumber}` : title);
const commitMsg =
  mode === 'sync'
    ? `fix(${labelTag}): address QA Round ${roundNum} findings`
    : sliceId
      ? `${sliceId}: ${title}${issueNumber > 0 ? ` (#${issueNumber})` : ''}`
      : `${title}${issueNumber > 0 ? ` (#${issueNumber})` : ''}`;

const { headSha, shortSha, diffStat: gitDiffStat } = syncBranchChanges({
  commitMessage: commitMsg,
  baseSha,
  branchName,
});
const diffStat = gitDiffStat || diffStatInput || 'See diff tab';
const prTitle = sliceId && !title.includes(sliceId) ? `[${sliceId}] ${title}` : title;

let prNumber = 0;
let prUrl = '';

const existing = findOpenPr(repo, branchName);
if (existing) {
  prNumber = existing.number;
  prUrl = existing.url;
}

const { summaryBlock, dangerBlock } = readCompactSummaryAndDanger();
const resolvedBeforeSummary =
  beforeCaptureSummary || beforeSummary || `Base \`${baseBranch}\` (${baseSha.slice(0, 7) || 'HEAD'}).`;
const uploadedEvidence = uploadEvidenceImages(shortSha);

if (mode === 'draft' || mode === 'sync') {
  const stageBadge =
    mode === 'draft'
      ? `Draft · \`factory:review\` · \`${baseBranch}\` -> \`${shortSha}\``
      : `Draft · \`factory:review\` · Round ${roundNum + 1} fix (\`${shortSha}\`)`;

  const draftLines: string[] = [
    `${issueNumber > 0 ? `Closes #${issueNumber} · ` : ''}${stageBadge} · \`${sliceId || title}\` (\`${phase || 'ad-hoc'}\`, \`${riskTier}\`)`,
    '',
    '## Summary',
    '',
    summaryBlock,
    '',
    ...renderEvidenceSection(
      uploadedEvidence,
      resolvedBeforeSummary,
      `Commit \`${shortSha}\` undergoing Mechanical Gate & Independent QA.`
    ),
    '## Merge Danger',
    '',
    dangerBlock,
    '',
    '<details><summary>Changed Files</summary>',
    '',
    formatDiffSection(diffStat),
    '',
    '</details>',
  ];

  const bodyPath = join(artifactsDir, 'draft-pr-body.md');
  writeFileSync(bodyPath, draftLines.filter((l) => l !== undefined).join('\n'), 'utf8');

  const created = ensurePrCreated(prNumber, prUrl, prTitle, bodyPath, true);
  prNumber = created.prNumber;
  prUrl = created.prUrl;

  if (mode === 'sync' && repo && prNumber > 0) {
    const fixCommentLines = [
      '<!-- archon-factory-revise-done -->',
      `### 🔄 Implementer Update — Round ${roundNum + 1} Fix (\`${shortSha}\`)`,
      '',
      implSummary || 'Resumed implementer session and pushed QA fixes (`factory:review`).',
    ];
    postPrComment(repo, prNumber, fixCommentLines.join('\n'), artifactsDir);
  }

  setFactoryState(repo, { issueNumber, prNumber }, FACTORY_LABELS.review);

  emit({
    pr_number: prNumber,
    pr_url: prUrl,
    head_sha: headSha,
    diff_stat: diffStat,
    is_draft: true,
    merge_action: 'pr-only',
    needs_human_merge_approval: false,
    approval_message: '',
    summary:
      mode === 'draft'
        ? `Draft PR #${prNumber} opened at ${prUrl} (${shortSha}); moved to factory:review.`
        : `Pushed QA fix commit ${shortSha} to PR #${prNumber}; returned to factory:review.`,
  });
  process.exit(0);
}

// mode === 'finalize'
const isDraft = !roundsReady;
let mergeAction: 'auto' | 'ask' | 'pr-only' = 'auto';
if (isDraft || mergeMode === 'pr-only') {
  mergeAction = 'pr-only';
} else if (mergeMode === 'ask') {
  mergeAction = 'ask';
} else if (mergeMode === 'ui-ask') {
  mergeAction = hasUi ? 'ask' : 'auto';
} else if (mergeMode === 'checkpoint') {
  const isCheckpointPhase = (phase === 'L0' && hasUi) || phase === 'L1' || phase === 'L3';
  const isAdHocUi = phase === '' && hasUi;
  mergeAction = isCheckpointPhase || isAdHocUi ? 'ask' : 'auto';
} else {
  mergeAction = 'auto';
}

const mechRaw = readSnippet(join(artifactsDir, 'mechanical-gate.md'), 6000);
const verifyLine = extractVerificationEvidenceLine(mechRaw);

const linkKeyword = roundsReady ? 'Closes' : 'Refs';
const deliveryBadge = roundsReady
  ? mergeAction === 'ask'
    ? '⏸️ **Ready — Awaiting Human Sign-off**'
    : '✅ **Ready — Gates & Independent QA LGTM**'
  : `⚠️ **Draft — Needs Attention (\`${roundsReason}\`)**`;

const bodyLines: string[] = [
  `${issueNumber > 0 ? `${linkKeyword} #${issueNumber} · ` : ''}${deliveryBadge} · \`${sliceId || title}\` (\`${phase || 'ad-hoc'}\`, \`${riskTier}\`, UI: ${hasUi ? 'Yes' : 'No'}, Rounds: ${roundNum})`,
  '',
  '## Summary',
  '',
  summaryBlock,
  '',
  ...renderEvidenceSection(
    uploadedEvidence,
    resolvedBeforeSummary,
    verifyLine
      ? `${verifyLine} (\`${shortSha}\`)`
      : `All checks passed on \`${shortSha}\`.`
  ),
];

if (roundsSummary || verifyLine) {
  bodyLines.push(
    verifyLine ? `- **Checks:** ${verifyLine}` : '',
    roundsSummary ? `- **QA:** ${roundsSummary}` : '',
    ''
  );
}

bodyLines.push(
  '## Merge Danger',
  '',
  dangerBlock,
  '',
  '<details><summary>Changed Files</summary>',
  '',
  formatDiffSection(diffStat),
  '',
  '</details>'
);

const prBodyPath = join(artifactsDir, 'pr-body.md');
writeFileSync(prBodyPath, bodyLines.filter((l) => l !== undefined).join('\n'), 'utf8');

const hadExistingPr = prNumber > 0;
const ensured = ensurePrCreated(prNumber, prUrl, prTitle, prBodyPath, isDraft);
prNumber = ensured.prNumber;
prUrl = ensured.prUrl;

if (!isDraft && prNumber > 0) {
  runCmd(['gh', 'pr', 'ready', String(prNumber), '--repo', repo], { allowFail: true });
  setFactoryState(repo, { issueNumber, prNumber }, FACTORY_LABELS.approved);
}

const needsHumanMergeApproval = mergeAction === 'ask';

if (repo && prNumber > 0 && (needsHumanMergeApproval || (hadExistingPr && uploadedEvidence.after.length > 0))) {
  const finalizeCommentLines: string[] = [];
  if (hadExistingPr && uploadedEvidence.after.length > 0) {
    finalizeCommentLines.push(
      ...renderEvidenceSection(
        uploadedEvidence,
        resolvedBeforeSummary,
        verifyLine ? `${verifyLine} (\`${shortSha}\`)` : `Verified at \`${shortSha}\`.`
      )
    );
  }
  if (needsHumanMergeApproval) {
    finalizeCommentLines.push(
      '<!-- archon-factory-merge-prompt -->',
      `### ⏸️ Ready for Human Merge Decision (\`merge_mode=${mergeMode}\`)`,
      verifyLine ? `- **Checks:** ${verifyLine}` : '',
      '- Approve in Archon to wait for green CI and squash-merge. If the Factory dispatcher is enabled, you can also reply **`/approve`** or **`/merge`** here.',
      '- Or review and merge the PR directly in GitHub.'
    );
  }
  postPrComment(repo, prNumber, finalizeCommentLines.filter(Boolean).join('\n'), artifactsDir);
}

const approvalMessage = needsHumanMergeApproval
  ? [
      `Checkpoint review required before merging PR #${prNumber}: ${prUrl}`,
      `Slice: ${sliceId || title} (phase=${phase || 'ad-hoc'}, risk=${riskTier}, ui=${hasUi}, rounds=${roundNum})`,
      `Verdict: ${roundsSummary}`,
      ``,
      dangerBlock,
      ``,
      `Approve to wait for green CI and squash-merge pinned to ${shortSha}; Reject to keep the PR open.`,
    ]
      .filter(Boolean)
      .join('\n')
  : '';

emit({
  pr_number: prNumber,
  pr_url: prUrl,
  head_sha: headSha,
  diff_stat: diffStat,
  is_draft: isDraft,
  merge_action: mergeAction,
  needs_human_merge_approval: needsHumanMergeApproval,
  approval_message: approvalMessage,
  summary: `PR #${prNumber} (${isDraft ? 'draft' : 'ready'}) published at ${prUrl} (merge_action=${mergeAction}).`,
});
