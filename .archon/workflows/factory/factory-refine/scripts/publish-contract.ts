/**
 * Publishes an approved refined slice contract back to the GitHub issue
 * (with `factory:ready`/`factory:blocked` and `risk:<tier>` labels) or writes
 * `$ARTIFACTS_DIR/slice-contract.md` when run without an issue number.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emit, parseSliceContract, runCmd, text, validateSliceContract } from '../../.shared/contract.ts';
import { ensureFactoryLabels, postIssueComment, setFactoryState } from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';

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
        : '- With the dispatcher enabled, reply **`/approve`** to proceed with the drafted scope as-is, or **`/reject`** to hand back (`factory:human`).',
    ]
      .filter((l) => l !== undefined && !(l === '' && !refineSummary))
      .join('\n'),
    artifactsDir
  );

  ensureFactoryLabels(repo);
  setFactoryState(repo, { issueNumber }, FACTORY_LABELS.needsInfo);

  emit({
    published: false,
    target: `https://github.com/${repo}/issues/${issueNumber}`,
    labels: [FACTORY_LABELS.needsInfo],
    summary: `Posted ${qLines.length} clarification question(s) on issue #${issueNumber} and applied ${FACTORY_LABELS.needsInfo}.`,
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
    ensureFactoryLabels(repo);

    // Grounded and unblocked -> ready; grounded but waiting on an open blocker -> blocked.
    const openBlockers = new Set<number>();
    const openRes = runCmd(
      ['gh', 'issue', 'list', '--repo', repo, '--state', 'open', '--limit', '200', '--json', 'number'],
      { allowFail: true }
    );
    if (openRes.code === 0 && openRes.stdout) {
      try {
        for (const row of JSON.parse(openRes.stdout) as { number: number }[]) openBlockers.add(row.number);
      } catch {
        // fall through; native check below still applies
      }
    }
    const nativeRes = runCmd(
      ['gh', 'issue', 'view', String(issueNumber), '--repo', repo, '--json', 'blockedBy'],
      { allowFail: true }
    );
    if (nativeRes.code === 0 && nativeRes.stdout) {
      try {
        const parsed = JSON.parse(nativeRes.stdout) as {
          blockedBy?: { nodes?: { number: number; state?: string }[] };
        };
        for (const node of parsed.blockedBy?.nodes ?? []) {
          if (node.state !== 'CLOSED') openBlockers.add(node.number);
        }
      } catch {
        // ignore
      }
    }
    const unmet = parsedDraft.blockedBy.filter((dep) => openBlockers.has(dep));
    const target = unmet.length > 0 ? FACTORY_LABELS.blocked : FACTORY_LABELS.ready;
    setFactoryState(repo, { issueNumber }, target);
    appliedLabels.push(target);

    const riskLabel = `risk:${riskTier}`;
    runCmd(['gh', 'label', 'create', riskLabel, '--repo', repo, '--force'], { allowFail: true });
    const res = runCmd(
      ['gh', 'issue', 'edit', String(issueNumber), '--repo', repo, '--add-label', riskLabel],
      { allowFail: true }
    );
    if (res.code === 0) appliedLabels.push(riskLabel);
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
