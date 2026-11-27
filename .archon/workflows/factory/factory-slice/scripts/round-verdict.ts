/**
 * Joins one QA/review iteration's deterministic & independent reviewer verdicts into a structured
 * loop decision, writes $ARTIFACTS_DIR/round-feedback.md, posts a real PR review-round
 * comment on GitHub, and transitions issue/PR stage labels between:
 *   factory:review -> factory:changes-requested (sent back to implementer)
 *   factory:review -> factory:approved (all gates & QA LGTM)
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { emit, runCmd, text } from '../../.shared/contract.ts';
import { postPrComment, setFactoryState } from '../../.shared/github.ts';
import { FACTORY_LABELS } from '../../.shared/labels.ts';
import {
  extractBlockingFindings,
  extractMechanicalFailureSummary,
  extractUxBlockingFindings,
} from '../../.shared/pr-format.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(artifactsDir, { recursive: true });

const prevRound = Number.parseInt(text(process.env.INPUTS_PREVIOUS_ROUND), 10);
const round = (Number.isNaN(prevRound) ? 0 : prevRound) + 1;

const repo = text(process.env.INPUTS_REPO);
const issueNumber = Number.parseInt(text(process.env.INPUTS_ISSUE_NUMBER) || '0', 10);
const prNumber = Number.parseInt(text(process.env.INPUTS_PR_NUMBER) || '0', 10);
const reviewMode = text(process.env.INPUTS_REVIEW_MODE) || 'standard';
const runUx = text(process.env.INPUTS_RUN_UX) === 'true';
const effectiveHasUi = text(process.env.INPUTS_EFFECTIVE_HAS_UI) === 'true' || runUx;

const fixBlocked = text(process.env.INPUTS_FIX_BLOCKED) === 'true';
const fixSummary = text(process.env.INPUTS_FIX_SUMMARY);

const mechPassed = text(process.env.INPUTS_MECH_PASSED) === 'true';
const mechSummary = text(process.env.INPUTS_MECH_SUMMARY);
const mechDiffStat = text(process.env.INPUTS_MECH_DIFF_STAT);

const uxPassed = text(process.env.INPUTS_UX_PASSED) === 'true';
const uxSummary = text(process.env.INPUTS_UX_SUMMARY);

const codeLgtm = text(process.env.INPUTS_CODE_LGTM) === 'true';
const codeSummary = text(process.env.INPUTS_CODE_SUMMARY);

const seamsLgtm = text(process.env.INPUTS_SEAMS_LGTM) === 'true';
const seamsSummary = text(process.env.INPUTS_SEAMS_SUMMARY);

function readFullOptional(filePath: string): string {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf8').trim();
}

function extractCleanBullets(markdown: string): string[] {
  if (!markdown.trim()) return [];
  const lines = markdown.split(/\r?\n/);
  const bullets: string[] = [];
  let inClean = false;
  for (const line of lines) {
    if (/^#{1,3}\s+.*(verified clean|examined clean)/i.test(line)) {
      inClean = true;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      inClean = false;
      continue;
    }
    if (inClean && /^\s*[-*]\s+/.test(line)) {
      bullets.push(line.trim());
    }
  }
  return bullets;
}

const headShaRes = runCmd(['git', 'rev-parse', 'HEAD'], { allowFail: true });
const reviewedSha = headShaRes.code === 0 ? headShaRes.stdout.trim() : '';

const mechRaw = readFullOptional(join(artifactsDir, 'mechanical-gate.md'));
const reviewsRan = !fixBlocked && mechPassed;
const uxRaw = reviewsRan && runUx ? readFullOptional(join(artifactsDir, 'evidence', 'ux-report.md')) : '';
const codeRaw = reviewsRan ? readFullOptional(join(artifactsDir, 'review', 'code.md')) : '';
const seamsRaw =
  reviewsRan && reviewMode === 'strict'
    ? readFullOptional(join(artifactsDir, 'review', 'seams-errors.md'))
    : '';

const openHandoffItems: string[] = [];
if (mechPassed && runUx && !uxPassed) {
  const uxBlockers = extractUxBlockingFindings(uxRaw);
  if (uxBlockers) openHandoffItems.push('**UX:**', uxBlockers);
}
if (reviewsRan && !codeLgtm) {
  const codeBlockers = extractBlockingFindings(codeRaw, 4000);
  if (codeBlockers) openHandoffItems.push('**Code / Spec / Standards:**', codeBlockers);
}
if (reviewsRan && reviewMode === 'strict' && !seamsLgtm) {
  const seamsBlockers = extractBlockingFindings(seamsRaw, 4000);
  if (seamsBlockers) openHandoffItems.push('**Seams & Failure-Safety:**', seamsBlockers);
}

const cleanBullets = [
  ...extractCleanBullets(codeRaw),
  ...extractCleanBullets(seamsRaw),
];

function parseReportedTestCases(reportMarkdown: string): Array<{
  id: string;
  status: string;
  note: string;
  isExploratory: boolean;
}> {
  if (!reportMarkdown.trim()) return [];
  const results: Array<{ id: string; status: string; note: string; isExploratory: boolean }> = [];
  for (const line of reportMarkdown.split(/\r?\n/)) {
    const m = line.match(
      /^\s*[-*]\s+`?(TC-(?:R\d+-)?[A-Z0-9-]+)`?\s*:\s*(PASS|FAIL|PENDING|UNVERIFIED|SKIP(?:PED)?|N\/A)\b(?:\s*(?:—|--|-|:)\s*(.+))?$/i
    );
    if (!m) continue;
    const id = m[1].toUpperCase();
    const status = m[2].toUpperCase();
    const note = (m[3] || '').trim().replace(/\|/g, '\\|');
    results.push({ id, status, note, isExploratory: /^TC-R\d+-/i.test(id) });
  }
  return results;
}

const ledgerRow = /^\|\s*`(TC-[A-Z0-9-]+)`\s*\|\s*((?:\\\||[^|])*)\|\s*`?([^|`]+)`?\s*\|\s*(.*?)\s*\|$/i;

function mergeQaTestCasesLedger() {
  const ledgerPath = join(artifactsDir, 'qa-testcases.md');
  if (!existsSync(ledgerPath)) return [];

  const updates = new Map<string, { status: string; note: string; isExploratory: boolean }>();
  for (const raw of [uxRaw, codeRaw, seamsRaw]) {
    for (const entry of parseReportedTestCases(raw)) {
      const prev = updates.get(entry.id);
      if (!prev || entry.status === 'FAIL' || (prev.status !== 'FAIL' && entry.status === 'PASS')) {
        updates.set(entry.id, entry);
      }
    }
  }

  let lines = readFileSync(ledgerPath, 'utf8').split(/\r?\n/);
  const existingIds = new Set<string>();

  lines = lines.map((line) => {
    if (round === 1 && /^- \*\*Freeze State:\*\*/i.test(line)) {
      return '- **Freeze State:** `FROZEN (Round 1 complete — Round 2+ must only verify failing/delta-affected TCs)`';
    }
    const rowMatch = line.match(ledgerRow);
    if (!rowMatch) return line;
    const id = rowMatch[1].toUpperCase();
    existingIds.add(id);
    const upd = updates.get(id);
    if (!upd) return line;
    return `| \`${id}\` | ${rowMatch[2]!.trim()} | \`${upd.status}\` | ${upd.note || rowMatch[4] || '—'} |`;
  });

  if (round === 1) {
    const newExploratory = [...updates.entries()].filter(
      ([id, info]) => info.isExploratory && !existingIds.has(id)
    );
    if (newExploratory.length > 0) {
      const headerIdx = lines.findIndex((l) => /^##\s+Round 1 Exploratory Cases/i.test(l));
      const newRows = newExploratory.map(
        ([id, info]) =>
          `| \`${id}\` | [Round 1 Exploratory] ${info.note || 'Diff-bounded defect'} | \`${info.status}\` | Round 1 |`
      );
      if (headerIdx !== -1) {
        const placeholderIdx = lines.findIndex(
          (l, idx) => idx > headerIdx && /_\(None yet/i.test(l)
        );
        if (placeholderIdx !== -1) {
          lines.splice(
            placeholderIdx,
            1,
            '| ID | Case / Expected Outcome | Status | Notes |',
            '| :--- | :--- | :--- | :--- |',
            ...newRows
          );
        } else {
          lines.splice(headerIdx + 1, 0, ...newRows);
        }
      } else {
        lines.push(
          '',
          '## Round 1 Exploratory Cases (Frozen After Round 1)',
          '| ID | Case / Expected Outcome | Status | Notes |',
          '| :--- | :--- | :--- | :--- |',
          ...newRows
        );
      }
    }
  }

  writeFileSync(ledgerPath, lines.join('\n'), 'utf8');
  return lines.flatMap((line) => {
    const row = line.match(ledgerRow);
    return row ? [{ id: row[1]!.toUpperCase(), status: row[3]!.trim().toUpperCase(), note: row[4]! }] : [];
  });
}

const cases = mergeQaTestCasesLedger();
const incompleteCases = cases.filter((item) => item.status !== 'PASS');
const missingLedger = Boolean(text(process.env.INPUTS_CONTRACT_PATH)) && cases.length === 0;
if (missingLedger) {
  openHandoffItems.push('- [P1] Required QA case ledger is missing or empty. Restore it and report the case results.');
}
const caseResults = cases.map(({ id, status }) => `${id}: ${status}`);
for (const { id, status, note } of incompleteCases) {
  openHandoffItems.push(`- [P1] ${id}: ${status}. ${note === '—' ? 'Run the required case and report its result.' : note}`);
}

let done = false;
let ready = false;
let reason = 'ready';
let summary = '';

if (fixBlocked) {
  done = true;
  ready = false;
  reason = 'implement_blocked';
  summary = `Implementer blocked while fixing Round ${Math.max(1, round - 1)} feedback: ${fixSummary}`;
} else if (!mechPassed) {
  done = false;
  ready = false;
  reason = 'mechanical_gate_failed';
  summary = `Round ${round}: mechanical gate failed (${mechSummary}). Fix findings in $ARTIFACTS_DIR/mechanical-gate.md.`;
} else {
  const uxFailed = runUx && !uxPassed;
  const missingReviews: string[] = [];
  if (!codeLgtm) missingReviews.push(`Code+Spec+Standards (${codeSummary || 'findings open'})`);
  if (reviewMode === 'strict' && !seamsLgtm) {
    missingReviews.push(`Seams+Errors (${seamsSummary || 'findings open'})`);
  }

  if (uxFailed || missingReviews.length > 0) {
    done = false;
    ready = false;
    const summaryParts: string[] = [];
    if (uxFailed) {
      summaryParts.push(
        `UX black-box verification failed (${uxSummary || 'findings open'}). Fix findings in $ARTIFACTS_DIR/evidence/ux-report.md.`
      );
    }
    if (missingReviews.length > 0) {
      summaryParts.push(
        `QA review findings open in ${missingReviews.join('; ')}. Read $ARTIFACTS_DIR/review/*.md and resolve all blocking items.`
      );
    }
    if (uxFailed && missingReviews.length > 0) {
      reason = 'ux_and_review_findings';
    } else if (uxFailed) {
      reason = 'ux_verify_failed';
    } else {
      reason = 'review_findings';
    }
    summary = `Round ${round}: ${summaryParts.join(' ')}`;
  } else if (missingLedger || incompleteCases.length > 0) {
    reason = 'qa_cases_incomplete';
    summary = missingLedger
      ? `Round ${round}: required QA case ledger is missing or empty.`
      : `Round ${round}: required QA cases need a passing result (${incompleteCases.map(({ id, status }) => `${id}: ${status}`).join(', ')}).`;
  } else {
    done = true;
    ready = true;
    reason = 'ready';
    const axes =
      reviewMode === 'strict'
        ? 'Code+Spec+Standards, Seams+Errors'
        : 'Code+Spec+Standards';
    summary = `Round ${round} passed: mechanical gate green${runUx ? ', UX verified' : ''}, QA LGTM (${axes}).`;
  }
}

const feedbackMd = [
  `# Round ${round} Verdict`,
  '',
  `- **Ready:** ${ready}`,
  `- **Reason:** \`${reason}\``,
  ...(reviewedSha ? [`- **Reviewed SHA:** \`${reviewedSha}\``] : []),
  `- **Mechanical Gate:** ${mechPassed ? 'PASS' : 'FAIL'} — ${mechSummary}`,
  runUx
    ? `- **UX Check:** ${uxPassed ? 'PASS' : 'FAIL'} — ${uxSummary}`
    : '- **UX Check:** skipped (non-UI or no preview hook)',
  `- **Code, Spec & Standards Review:** ${reviewsRan ? (codeLgtm ? 'LGTM' : 'CHANGES REQUESTED') : 'SKIPPED'} — ${codeSummary}`,
  reviewMode === 'strict'
    ? `- **Seams & Failure-Safety Review:** ${reviewsRan ? (seamsLgtm ? 'LGTM' : 'CHANGES REQUESTED') : 'SKIPPED'} — ${seamsSummary}`
    : '- **Seams & Failure-Safety Review:** skipped (standard risk)',
  '',
  ...(cases.length > 0 ? ['## Test Case Results', ...caseResults.map((item) => `- ${item}`), ''] : []),
  '## Next Action',
  summary,
  '',
  '## Round Handoff Checklist',
  ...(reviewedSha ? [`- **Delta Command:** \`git diff ${reviewedSha}..HEAD\``] : []),
  '',
  '### Open Blocking Items to Verify Fixed',
  ...(openHandoffItems.length > 0 ? openHandoffItems : ['- None.']),
  '',
  '### Prior Verified Clean (Re-audit Only If Touched by Delta)',
  ...(cleanBullets.length > 0 ? cleanBullets : ['- None recorded.']),
].join('\n');

writeFileSync(join(artifactsDir, 'round-feedback.md'), feedbackMd, 'utf8');

const prUrl = repo && prNumber > 0 ? `https://github.com/${repo}/pull/${prNumber}` : null;
const evidenceSource = [
  'round-feedback.md',
  'qa-testcases.md',
  'mechanical-gate.md',
  ...(runUx && reviewsRan && existsSync(join(artifactsDir, 'evidence'))
    ? readdirSync(join(artifactsDir, 'evidence'), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:md|json|png|zip|json\.gz)$/i.test(entry.name))
        .map((entry) => `evidence/${entry.name}`)
    : []),
  ...(reviewsRan ? ['review/code.md'] : []),
  ...(reviewsRan && reviewMode === 'strict' ? ['review/seams-errors.md'] : []),
].filter((path) => existsSync(join(artifactsDir, path)));
const evidence = evidenceSource.map((file) => {
  const path = `qa-evidence/${reviewedSha || 'unresolved'}/round-${round}/${file}`;
  const destination = join(artifactsDir, path);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(artifactsDir, file), destination);
  return path;
});
const record = { round, reviewed_sha: reviewedSha, ready, reason, summary, cases, evidence, pr_url: prUrl };
const historyPath = join(artifactsDir, 'qa-verdicts.json');
const previous = readFullOptional(historyPath);
const history: Array<typeof record> = previous ? JSON.parse(previous) : [];
const records = history.filter((item) => item.round !== round || item.reviewed_sha !== reviewedSha);
writeFileSync(historyPath, JSON.stringify([...records, record], null, 2) + '\n', 'utf8');

if (prUrl) {
  if (process.env.FACTORY_PUBLISH_QA_STATUS === 'true') {
    if (!/^[0-9a-f]{40}$/.test(reviewedSha)) throw new Error('Factory QA could not resolve the reviewed commit.');
    runCmd([
      'gh', 'api', '--method', 'POST', `repos/${repo}/statuses/${reviewedSha}`,
      '-f', 'context=factory/qa',
      '-f', `state=${ready ? 'success' : 'failure'}`,
      '-f', `description=${ready ? 'Factory QA passed' : 'Factory QA requires changes'} (round ${round})`,
      '-f', `target_url=${prUrl}`,
    ]);
  }
  const commentLines: string[] = [];
  if (ready) {
    const uxBadge = runUx ? ' · UX: PASS' : '';
    const axesLabel =
      reviewMode === 'strict' ? 'Code+Spec+Standards, Seams' : 'Code+Spec+Standards';
    commentLines.push(
      round === 1
        ? `### ✅ Round 1 Approved — Gate: PASS${uxBadge} · QA Review (${axesLabel}): LGTM`
        : `### ✅ Round ${round} Resolved & Approved — Gate: PASS${uxBadge} · QA Review (${axesLabel}): LGTM`
    );
    setFactoryState(repo, { issueNumber, prNumber }, FACTORY_LABELS.approved);
  } else {
    commentLines.push(
      `### 🔁 Round ${round}: Changes Requested (\`${reason}\`)`,
      '',
      fixBlocked
        ? `> **Blocked:** ${summary}`
        : `> Resuming implementer session to resolve failing items before Round ${round + 1}.`,
      ''
    );

    if (!mechPassed) {
      const mechFailure = extractMechanicalFailureSummary(mechRaw);
      commentLines.push(
        `#### ❌ Mechanical Gate — ${mechSummary}`,
        mechFailure || '_See `$ARTIFACTS_DIR/mechanical-gate.md`._',
        ''
      );
    }

    if (mechPassed && runUx && !uxPassed) {
      const uxFindings = extractUxBlockingFindings(uxRaw);
      commentLines.push(
        `#### ❌ Black-Box UX — ${uxSummary}`,
        uxFindings || '_See `$ARTIFACTS_DIR/evidence/ux-report.md`._',
        ''
      );
    }

    if (reviewsRan && !codeLgtm) {
      const blockers = extractBlockingFindings(codeRaw);
      commentLines.push(
        `#### ❌ Axis 1: Code, Spec & Standards — ${codeSummary}`,
        blockers || '_See `$ARTIFACTS_DIR/review/code.md`._',
        ''
      );
    }

    if (reviewsRan && reviewMode === 'strict' && !seamsLgtm) {
      const blockers = extractBlockingFindings(seamsRaw);
      commentLines.push(
        `#### ❌ Axis 2: Seams & Failure-Safety — ${seamsSummary}`,
        blockers || '_See `$ARTIFACTS_DIR/review/seams-errors.md`._',
        ''
      );
    }

    setFactoryState(repo, { issueNumber, prNumber }, FACTORY_LABELS.changesRequested);
  }

  commentLines.splice(1, 0, '', `Reviewed commit \`${reviewedSha}\``, ...caseResults.map((item) => `- ${item}`), '');
  postPrComment(repo, prNumber, commentLines.join('\n').slice(0, 55000), artifactsDir);
}

emit({
  round,
  done,
  ready,
  effective_has_ui: effectiveHasUi,
  reason,
  diff_stat: mechDiffStat,
  summary,
});
