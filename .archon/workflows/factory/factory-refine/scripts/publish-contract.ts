/**
 * Publishes an approved refined slice contract back to the GitHub issue
 * (with `factory:refined`, `risk:<tier>`, and `factory:ready` labels) or writes
 * `$ARTIFACTS_DIR/slice-contract.md` when run without an issue number.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emit, parseSliceContract, runCmd, text, validateSliceContract } from '../../.shared/contract.ts';
import { postIssueComment } from '../../.shared/github.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';

const source = text(process.env.INPUTS_SOURCE);
const repo = text(process.env.INPUTS_REPO);
const issueNumber = Number.parseInt(text(process.env.INPUTS_ISSUE_NUMBER) || '0', 10);
const requestPath = text(process.env.INPUTS_REQUEST_PATH);
const title = text(process.env.INPUTS_TITLE);
const riskTier = text(process.env.INPUTS_RISK_TIER) || 'standard';
const contractPath = text(process.env.INPUTS_CONTRACT_PATH);
const refineReady = text(process.env.INPUTS_REFINE_READY) !== 'false';
const approvalMode = text(process.env.INPUTS_APPROVAL_MODE) || 'if-ambiguous';
const refineSummary = text(process.env.INPUTS_REFINE_SUMMARY);
const operatorNotes = text(process.env.INPUTS_OPERATOR_NOTES);
const autoLabel = text(process.env.INPUTS_AUTO_LABEL) === 'true';

let openQuestions: string[] = [];
try {
  const parsed = JSON.parse(text(process.env.INPUTS_OPEN_QUESTIONS) || '[]');
  if (Array.isArray(parsed)) openQuestions = parsed.map((q) => String(q));
} catch {
  // ignore
}

const draft = contractPath && existsSync(contractPath) ? readFileSync(contractPath, 'utf8').trim() : '';
const parsedDraft = draft ? parseSliceContract(draft) : null;
const readiness = parsedDraft ? validateSliceContract(parsedDraft) : null;
const scaffoldBlocked = parsedDraft?.scaffoldHandoff != null && (!refineReady || !readiness?.ok);
const contractErrors = readiness?.errors ?? ['Refinement did not produce a non-empty contract draft.'];

// GitHub-native async Q&A: post questions on issue + label `factory:needs-info` without pausing the run
if (source === 'issue' && issueNumber > 0 && repo && ((approvalMode === 'github' && !refineReady) || scaffoldBlocked || contractErrors.length > 0)) {
  const questions = [...openQuestions, ...contractErrors];
  const qLines = questions.length > 0
    ? questions.map((q, i) => `${i + 1}. ${q}`)
    : ['1. Please clarify expected behavior, target scope, or acceptance criteria.'];

  postIssueComment(
    repo,
    issueNumber,
    [
      '<!-- archon-factory-question -->',
      '### ❓ Clarification Needed Before Implementation (`factory:needs-info`)',
      refineSummary ? `**Draft context:** ${refineSummary}` : '',
      '',
      '**Questions:**',
      ...qLines,
      '',
      '- Reply with your answers. With the Factory dispatcher enabled, it reruns refinement; otherwise rerun `factory-refine` manually.',
      scaffoldBlocked || contractErrors.length > 0
        ? '- Resolve the contract blockers before delivery. Approval alone does not mark the issue ready.'
        : '- With the dispatcher enabled, reply **`/approve`** to proceed with the drafted scope as-is, or **`/reject`** to put on hold.',
    ]
      .filter((l) => l !== undefined && !(l === '' && !refineSummary))
      .join('\n'),
    artifactsDir
  );

  runCmd(
    [
      'gh',
      'label',
      'create',
      'factory:needs-info',
      '--repo',
      repo,
      '--color',
      'FBCA04',
      '--description',
      'Waiting for maintainer clarification on GitHub',
      '--force',
    ],
    { allowFail: true }
  );
  runCmd(
    [
      'gh',
      'issue',
      'edit',
      String(issueNumber),
      '--repo',
      repo,
      '--add-label',
      'factory:needs-info',
      '--remove-label',
      'factory:ready',
    ],
    { allowFail: true }
  );

  emit({
    published: false,
    target: `https://github.com/${repo}/issues/${issueNumber}`,
    labels: ['factory:needs-info'],
    summary: `Posted ${qLines.length} clarification question(s) on issue #${issueNumber} and applied factory:needs-info.`,
  });
  process.exit(0);
}

if (!parsedDraft || !readiness) {
  throw new Error(`Refined contract is missing or empty: ${contractPath}`);
}
if (scaffoldBlocked || !readiness.ok) {
  emit({
    published: false,
    target: contractPath,
    labels: [],
    summary: `Contract not ready: ${[...readiness.errors, ...openQuestions].join('; ') || 'Resolve scaffold handoff blockers and rerun refinement.'}`,
  });
  process.exit(0);
}

let content = draft;
if (operatorNotes) {
  content += `\n\n## Operator Approval Notes\n${operatorNotes}\n`;
}

// Preserve original issue / crash report payload below the slice contract when updating a GitHub issue
if (source === 'issue' && requestPath && existsSync(requestPath)) {
  const rawOriginal = readFileSync(requestPath, 'utf8')
    .replace(/\n*<details><summary>Original Issue \/ Crash Report<\/summary>[\s\S]*$/m, '')
    .trim();
  if (rawOriginal) {
    const clipped =
      rawOriginal.length > 6000
        ? `${rawOriginal.slice(0, 6000)}\n\n... (original report truncated)`
        : rawOriginal;
    content += `\n\n<details><summary>Original Issue / Crash Report</summary>\n\n${clipped}\n\n</details>\n`;
  }
}

const finalPath = join(artifactsDir, 'slice-contract.md');
writeFileSync(finalPath, content, 'utf8');

const appliedLabels: string[] = [];

if (source === 'issue' && issueNumber > 0 && repo) {
  runCmd([
    'gh',
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repo,
    '--title',
    title,
    '--body-file',
    finalPath,
  ]);

  if (autoLabel) {
    const desired = ['factory:refined', `risk:${riskTier}`, 'factory:ready'];
    for (const label of desired) {
      // Ensure label exists (idempotent; ignore error if already exists)
      runCmd(['gh', 'label', 'create', label, '--repo', repo, '--force'], { allowFail: true });
      const res = runCmd(
        ['gh', 'issue', 'edit', String(issueNumber), '--repo', repo, '--add-label', label],
        { allowFail: true }
      );
      if (res.code === 0) appliedLabels.push(label);
    }
  }

  emit({
    published: true,
    target: `https://github.com/${repo}/issues/${issueNumber}`,
    labels: appliedLabels,
    summary: `Updated issue #${issueNumber} with approved slice contract and labels [${appliedLabels.join(', ')}].`,
  });
} else {
  emit({
    published: true,
    target: finalPath,
    labels: [],
    summary: `Saved approved slice contract to ${finalPath}. Run with: archon workflow run factory-slice --input spec_file=${finalPath}`,
  });
}
