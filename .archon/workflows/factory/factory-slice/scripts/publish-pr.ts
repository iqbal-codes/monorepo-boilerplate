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
import { auditBoundaries, emit, runCmd, text } from '../../.shared/contract.ts';
import {
  findOpenPr,
  postPrComment,
  setFactoryState,
  syncBranchChanges,
} from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';
import { assertReservation, deliveryPaths, parseDeliveryClaim } from '../../.shared/ownership.ts';
import {
  type EvidenceImage,
  type EvidenceManifestEntry,
  extractVerificationEvidenceLine,
  parseEvidenceManifest,
  parsePrSummarySections,
  renderEvidenceMarkdown,
} from '../../.shared/pr-format.ts';

interface UploadedEvidence {
  before: EvidenceImage[];
  impl: EvidenceImage[];
  after: EvidenceImage[];
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
const roundRaw = text(process.env.INPUTS_ROUND) || text(process.env.INPUTS_FALLBACK_ROUND);
const parsedRound = roundRaw !== '' ? Number.parseInt(roundRaw, 10) : Number.NaN;
const roundNum = Number.isFinite(parsedRound) && parsedRound >= 0 ? parsedRound : 1;
const diffStatInput = text(process.env.INPUTS_DIFF_STAT);
const mergeMode = text(process.env.INPUTS_MERGE_MODE) || 'ask';
const claim = parseDeliveryClaim(process.env.INPUTS_ALLOWED_FOLDERS, process.env.INPUTS_EXCLUSIVE);
const allowedFolders = claim.kind === 'reserved' ? claim.folders : [];
const forbiddenPaths: string[] = JSON.parse(text(process.env.INPUTS_FORBIDDEN_PATHS));

function readSnippet(filePath: string, maxChars = 3000): string {
  if (!existsSync(filePath)) return '';
  const content = readFileSync(filePath, 'utf8').trim();
  return content.length > maxChars ? `${content.slice(0, maxChars)}\n... (truncated)` : content;
}

function readCompactPrSections(): {
  summaryBlock: string;
  evidenceBlock: string;
  dangerBlock: string;
} {
  const prSummaryRaw = readSnippet(join(artifactsDir, 'pr-summary.md'), 9000);
  const parsed = parsePrSummarySections(prSummaryRaw);
  const implRaw = readSnippet(join(artifactsDir, 'implementation.md'), 6000);

  let summaryBlock = parsed.summary;
  if (!summaryBlock && implRaw) {
    const overviewMatch = implRaw.match(/##\s+Overview[^\n]*\n([\s\S]*?)(?=\n##\s+|$)/i);
    summaryBlock = (overviewMatch?.[1] || implRaw).trim().slice(0, 1200);
  }

  let evidenceBlock = parsed.evidence;
  if (!evidenceBlock && implRaw) {
    const verifyMatch = implRaw.match(/##\s+Verification\s+Results[^\n]*\n([\s\S]*?)(?=\n##\s+|$)/i);
    evidenceBlock = (verifyMatch?.[1] || '').trim().slice(0, 1800);
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
    evidenceBlock,
    dangerBlock,
  };
}

function formatDiffSection(diffStat: string): string {
  const lines = diffStat.split(/\r?\n/).filter(Boolean);
  const label =
    lines.length > 1
      ? `Changed Files (${lines[lines.length - 1]?.trim()})`
      : 'Changed Files';
  return `<details><summary>${label}</summary>\n\n\`\`\`text\n${diffStat}\n\`\`\`\n\n</details>`;
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
      } else {
        runCmd(['git', 'worktree', 'add', '--detach', scratchDir, 'HEAD']);
        runCmd(['git', 'checkout', '--orphan', `pr-evidence-${text(process.env.INPUTS_RUN_ID)}`], { cwd: scratchDir });
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

  const manifest = loadEvidenceManifest();
  const result: UploadedEvidence = { before: [], impl: [], after: [] };
  for (const file of pngs) {
    const url = `https://github.com/${repo}/blob/pr-evidence/${folder}/${file}?raw=true`;
    const lower = file.toLowerCase();
    const meta = manifest.get(lower);
    const entry: EvidenceImage = {
      name: file,
      url,
      ...(meta?.label ? { label: meta.label } : {}),
      ...(meta?.pairKey ? { pairKey: meta.pairKey } : {}),
    };
    if (lower.startsWith('before')) {
      result.before.push(entry);
    } else if (lower.startsWith('impl')) {
      result.impl.push(entry);
    } else {
      result.after.push(entry);
    }
  }
  return result;
}

function loadEvidenceManifest(): Map<string, EvidenceManifestEntry> {
  const merged = new Map<string, EvidenceManifestEntry>();
  const candidates = [
    'manifest.json',
    'before-manifest.json',
    'impl-manifest.json',
    'after-manifest.json',
  ];
  for (const name of candidates) {
    const fullPath = join(evidenceDir, name);
    if (!existsSync(fullPath)) continue;
    const parsed = parseEvidenceManifest(readFileSync(fullPath, 'utf8'));
    for (const [k, v] of parsed.entries()) {
      const prev = merged.get(k);
      merged.set(k, {
        label: v.label || prev?.label,
        pairKey: v.pairKey || prev?.pairKey,
      });
    }
  }
  return merged;
}

function renderEvidenceSection(
  evidence: UploadedEvidence,
  resolvedBeforeSummary: string,
  fallbackAfterLine: string,
  executionEvidence = ''
): string[] {
  const primaryAfter = evidence.after.length > 0 ? evidence.after : evidence.impl;
  const afterLabel = evidence.after.length > 0 ? 'After (QA)' : 'After (Implementer)';

  return renderEvidenceMarkdown({
    before: evidence.before,
    after: primaryAfter,
    afterLabel,
    executionEvidence,
    beforeSummary: resolvedBeforeSummary,
    fallbackAfterLine,
  });
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
    ? roundNum === 0
      ? `fix(${labelTag}): address PR review feedback`
      : `fix(${labelTag}): address QA Round ${roundNum} findings`
    : sliceId
      ? `${sliceId}: ${title}${issueNumber > 0 ? ` (#${issueNumber})` : ''}`
      : `${title}${issueNumber > 0 ? ` (#${issueNumber})` : ''}`;

const { headSha, shortSha, diffStat: gitDiffStat } = syncBranchChanges({
  commitMessage: commitMsg,
  baseSha,
  branchName,
  assertPublishable(headSha) {
    assertReservation(text(process.env.INPUTS_RUN_ID), claim);
    const { ok, forbiddenHits, outOfBounds } = auditBoundaries(deliveryPaths(baseSha, headSha), allowedFolders, forbiddenPaths);
    if (!ok) {
      throw new Error(`Refusing to publish outside delivery boundaries. Protected: ${JSON.stringify(forbiddenHits)}; outside reserved folders: ${JSON.stringify(outOfBounds)}.`);
    }
  },
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

const { summaryBlock, evidenceBlock, dangerBlock } = readCompactPrSections();
const resolvedBeforeSummary =
  beforeCaptureSummary || beforeSummary || `Base \`${baseBranch}\` (${baseSha.slice(0, 7) || 'HEAD'}).`;
const uploadedEvidence = uploadEvidenceImages(shortSha);

if (mode === 'draft' || mode === 'sync') {
  const stageBadge =
    mode === 'draft'
      ? `Draft · \`factory:review\` · \`${baseBranch}\` -> \`${shortSha}\``
      : roundNum === 0
        ? `Draft · \`factory:review\` · PR revision (\`${shortSha}\`)`
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
      `Commit \`${shortSha}\` undergoing Mechanical Gate & Independent QA.`,
      evidenceBlock
    ),
    '## Merge Danger',
    '',
    dangerBlock,
    '',
    formatDiffSection(diffStat),
  ];

  const bodyPath = join(artifactsDir, 'draft-pr-body.md');
  writeFileSync(bodyPath, draftLines.filter((l) => l !== undefined).join('\n'), 'utf8');

  const created = ensurePrCreated(prNumber, prUrl, prTitle, bodyPath, true);
  prNumber = created.prNumber;
  prUrl = created.prUrl;

  if (mode === 'sync' && repo && prNumber > 0) {
    const syncHeading =
      roundNum === 0
        ? `### 🔄 Implementer Update — PR Revision (\`${shortSha}\`)`
        : `### 🔄 Implementer Update — Round ${roundNum + 1} Fix (\`${shortSha}\`)`;
    const fixCommentLines = [
      '<!-- archon-factory-revise-done -->',
      syncHeading,
      '',
      implSummary || 'Pushed updated changes (`factory:review`).',
      ...(uploadedEvidence.impl.length > 0
        ? [
            '',
            ...renderEvidenceSection(
              uploadedEvidence,
              resolvedBeforeSummary,
              `Updated at \`${shortSha}\`.`
            ),
          ]
        : []),
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
      : `All checks passed on \`${shortSha}\`.`,
    evidenceBlock
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
  formatDiffSection(diffStat)
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
const hasFinalizeVisualEvidence = uploadedEvidence.after.length > 0 || uploadedEvidence.impl.length > 0;
const shouldPostFinalizeEvidence = hadExistingPr && (hasFinalizeVisualEvidence || Boolean(evidenceBlock));

if (repo && prNumber > 0 && (needsHumanMergeApproval || shouldPostFinalizeEvidence)) {
  const finalizeCommentLines: string[] = [];
  if (shouldPostFinalizeEvidence) {
    finalizeCommentLines.push(
      ...renderEvidenceSection(
        uploadedEvidence,
        resolvedBeforeSummary,
        verifyLine ? `${verifyLine} (\`${shortSha}\`)` : `Verified at \`${shortSha}\`.`,
        evidenceBlock
      )
    );
  }
  if (needsHumanMergeApproval) {
    if (finalizeCommentLines.length > 0 && finalizeCommentLines[finalizeCommentLines.length - 1] !== '') {
      finalizeCommentLines.push('');
    }
    finalizeCommentLines.push(
      '<!-- archon-factory-merge-prompt -->',
      `### ⏸️ Ready for Human Merge Decision (\`merge_mode=${mergeMode}\`)`,
      '',
      ...(verifyLine ? [`- **Checks:** ${verifyLine}`] : []),
      '- Approve in Archon to wait for green CI and squash-merge. If the Factory dispatcher is enabled, you can also reply **`/approve`** or **`/merge`** here.',
      '- Or review and merge the PR directly in GitHub.'
    );
  }
  postPrComment(repo, prNumber, finalizeCommentLines.join('\n').trim(), artifactsDir);
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
