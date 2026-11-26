/**
 * Joins one QA/review iteration's deterministic & independent reviewer verdicts into a structured
 * loop decision, writes $ARTIFACTS_DIR/round-feedback.md, posts a real PR review-round
 * comment on GitHub, and transitions issue/PR stage labels between:
 *   factory:review -> factory:changes-requested (sent back to implementer)
 *   factory:review -> factory:approved (all gates & QA LGTM)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emit, text } from '../../.shared/contract.ts';
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

const specLgtm = text(process.env.INPUTS_SPEC_LGTM) === 'true';
const specSummary = text(process.env.INPUTS_SPEC_SUMMARY);

const stdLgtm = text(process.env.INPUTS_STD_LGTM) === 'true';
const stdSummary = text(process.env.INPUTS_STD_SUMMARY);

const seamsLgtm = text(process.env.INPUTS_SEAMS_LGTM) === 'true';
const seamsSummary = text(process.env.INPUTS_SEAMS_SUMMARY);

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
} else if (runUx && !uxPassed) {
  done = false;
  ready = false;
  reason = 'ux_verify_failed';
  summary = `Round ${round}: UX black-box verification failed (${uxSummary}). Fix findings in $ARTIFACTS_DIR/evidence/ux-report.md.`;
} else {
  const missingReviews: string[] = [];
  if (!specLgtm) missingReviews.push(`Spec+Tests (${specSummary || 'findings open'})`);
  if (!stdLgtm) missingReviews.push(`Standards+Code (${stdSummary || 'findings open'})`);
  if (reviewMode === 'strict' && !seamsLgtm) {
    missingReviews.push(`Seams+Errors (${seamsSummary || 'findings open'})`);
  }

  if (missingReviews.length > 0) {
    done = false;
    ready = false;
    reason = 'review_findings';
    summary = `Round ${round}: QA review findings open in ${missingReviews.join('; ')}. Read $ARTIFACTS_DIR/review/*.md and resolve all blocking items.`;
  } else {
    done = true;
    ready = true;
    reason = 'ready';
    const axes =
      reviewMode === 'strict'
        ? 'Spec+Tests, Standards+Code, Seams+Errors'
        : 'Spec+Tests, Standards+Code';
    summary = `Round ${round} passed: mechanical gate green${runUx ? ', UX verified' : ''}, QA LGTM (${axes}).`;
  }
}

function readFullOptional(filePath: string): string {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf8').trim();
}

const mechRaw = readFullOptional(join(artifactsDir, 'mechanical-gate.md'));
const uxRaw = runUx ? readFullOptional(join(artifactsDir, 'evidence', 'ux-report.md')) : '';
const reviewsRan = !fixBlocked && mechPassed && (!runUx || uxPassed);
const specRaw = reviewsRan ? readFullOptional(join(artifactsDir, 'review', 'spec.md')) : '';
const stdRaw = reviewsRan ? readFullOptional(join(artifactsDir, 'review', 'standards.md')) : '';
const seamsRaw =
  reviewsRan && reviewMode === 'strict'
    ? readFullOptional(join(artifactsDir, 'review', 'seams-errors.md'))
    : '';

const feedbackMd = [
  `# Round ${round} Verdict`,
  '',
  `- **Ready:** ${ready}`,
  `- **Reason:** \`${reason}\``,
  `- **Mechanical Gate:** ${mechPassed ? 'PASS' : 'FAIL'} — ${mechSummary}`,
  runUx
    ? `- **UX Check:** ${uxPassed ? 'PASS' : 'FAIL'} — ${uxSummary}`
    : '- **UX Check:** skipped (non-UI or no preview hook)',
  `- **Spec & Regression Review:** ${reviewsRan ? (specLgtm ? 'LGTM' : 'CHANGES REQUESTED') : 'SKIPPED'} — ${specSummary}`,
  `- **Standards & Code Review:** ${reviewsRan ? (stdLgtm ? 'LGTM' : 'CHANGES REQUESTED') : 'SKIPPED'} — ${stdSummary}`,
  reviewMode === 'strict'
    ? `- **Seams & Failure-Safety Review:** ${reviewsRan ? (seamsLgtm ? 'LGTM' : 'CHANGES REQUESTED') : 'SKIPPED'} — ${seamsSummary}`
    : '- **Seams & Failure-Safety Review:** merged into Standards axis (standard risk)',
  '',
  '## Next Action',
  summary,
].join('\n');

writeFileSync(join(artifactsDir, 'round-feedback.md'), feedbackMd, 'utf8');

if (repo && prNumber > 0) {
  const commentLines: string[] = [];
  if (ready) {
    const uxBadge = runUx ? ' · UX: PASS' : '';
    const axesLabel =
      reviewMode === 'strict' ? 'Spec, Standards, Seams' : 'Spec, Standards';
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

    if (reviewsRan && !specLgtm) {
      const blockers = extractBlockingFindings(specRaw);
      commentLines.push(
        `#### ❌ Axis 1: Spec & Regression — ${specSummary}`,
        blockers || '_See `$ARTIFACTS_DIR/review/spec.md`._',
        ''
      );
    }

    if (reviewsRan && !stdLgtm) {
      const blockers = extractBlockingFindings(stdRaw);
      commentLines.push(
        `#### ❌ Axis 2: Standards & Code — ${stdSummary}`,
        blockers || '_See `$ARTIFACTS_DIR/review/standards.md`._',
        ''
      );
    }

    if (reviewsRan && reviewMode === 'strict' && !seamsLgtm) {
      const blockers = extractBlockingFindings(seamsRaw);
      commentLines.push(
        `#### ❌ Axis 3: Seams & Failure-Safety — ${seamsSummary}`,
        blockers || '_See `$ARTIFACTS_DIR/review/seams-errors.md`._',
        ''
      );
    }

    setFactoryState(repo, { issueNumber, prNumber }, FACTORY_LABELS.changesRequested);
  }

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
