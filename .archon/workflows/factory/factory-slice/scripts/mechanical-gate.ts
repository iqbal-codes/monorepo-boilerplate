/**
 * Deterministic mechanical gate (0 LLM tokens):
 * 1. Checks git diff + untracked files strictly stay within Owned / Allowed Paths
 *    and never touch Forbidden Shared Files.
 * 2. Runs the verification command resolved at contract intake.
 * Writes full evidence to $ARTIFACTS_DIR/mechanical-gate.md.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditBoundaries, emit, isRenderedUiFile, resolvePreviewCommand, runCmd, text } from '../../.shared/contract.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(artifactsDir, { recursive: true });
// Clear stale review reports from any prior iteration before running this round's gate
for (const stale of ['spec.md', 'standards.md', 'seams-errors.md']) {
  rmSync(join(artifactsDir, 'review', stale), { force: true });
}

const baseSha = text(process.env.INPUTS_BASE_SHA) || 'HEAD';
const cmdToRun = text(process.env.INPUTS_VERIFICATION_COMMAND);
const ownedPaths = JSON.parse(text(process.env.INPUTS_OWNED_PATHS) || '[]') as string[];
const forbiddenPaths = JSON.parse(text(process.env.INPUTS_FORBIDDEN_PATHS) || '[]') as string[];
const contractHasUi = text(process.env.INPUTS_CONTRACT_HAS_UI) === 'true';

// Collect all changed + untracked files relative to baseSha
const trackedDiff = runCmd(['git', 'diff', '--name-only', baseSha], { allowFail: true });
const untracked = runCmd(['git', 'ls-files', '--others', '--exclude-standard'], {
  allowFail: true,
});
const changedFiles = [
  ...new Set(
    [
      ...trackedDiff.stdout.split(/\r?\n/),
      ...untracked.stdout.split(/\r?\n/),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
  ),
];

const trackedDiffStat = runCmd(['git', 'diff', '--stat', baseSha], { allowFail: true }).stdout;
const untrackedList = untracked.stdout
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const diffStatParts: string[] = [];
if (trackedDiffStat) diffStatParts.push(trackedDiffStat);
if (untrackedList.length > 0) {
  diffStatParts.push(`Untracked files (${untrackedList.length}):\n${untrackedList.map((f) => ` + ${f}`).join('\n')}`);
}
const diffStat = diffStatParts.join('\n') || `${changedFiles.length} file(s) changed`;

const boundary = auditBoundaries(changedFiles, ownedPaths, forbiddenPaths);

let checksOk = false;
let checksOutput = 'No verification command resolved from the contract.';
if (changedFiles.length === 0) {
  checksOutput = 'No files were created or modified by the implementer.';
} else if (cmdToRun) {
  const res = runCmd(['bash', '-lc', cmdToRun], { allowFail: true });
  checksOk = res.code === 0;
  const combined = [res.stdout, res.stderr].filter(Boolean).join('\n');
  checksOutput = combined.slice(-6000) || `Exit code: ${res.code}`;
}

const passed = changedFiles.length > 0 && boundary.ok && checksOk;
const diffTouchesUi = changedFiles.some((f) => isRenderedUiFile(f));
const effectiveHasUi = contractHasUi || diffTouchesUi;
// The implementer may have added the default hook after contract intake.
const previewCmd = resolvePreviewCommand(text(process.env.INPUTS_PREVIEW_CMD));
const effectiveRunUx = effectiveHasUi && previewCmd.length > 0;

const reportLines: string[] = [
  '# Mechanical Gate Report',
  '',
  `- **Overall:** ${passed ? 'PASS' : 'FAIL'}`,
  `- **Changed files:** ${changedFiles.length}`,
  `- **Boundary Audit:** ${boundary.ok ? 'PASS' : 'FAIL'}`,
  `- **Verification Command:** \`${cmdToRun || 'none'}\` -> ${checksOk ? 'PASS' : 'FAIL'}`,
  `- **Effective UI Gate:** ${effectiveHasUi ? 'YES' : 'NO'} (contract=${contractHasUi}, diff=${diffTouchesUi}; ux-verify=${effectiveRunUx ? 'enabled' : effectiveHasUi ? 'skipped (no preview hook)' : 'skipped'})`,
  '',
];

if (boundary.forbiddenHits.length > 0) {
  reportLines.push('## Forbidden Shared Files Violated (P0)');
  for (const f of boundary.forbiddenHits) reportLines.push(`- \`${f}\``);
  reportLines.push('');
}
if (boundary.outOfBounds.length > 0) {
  reportLines.push('## Out-of-Bounds Files Outside Owned Paths (P0)');
  for (const f of boundary.outOfBounds) reportLines.push(`- \`${f}\``);
  reportLines.push('');
}

reportLines.push('## Diff Stat', '```text', diffStat, '```', '');
reportLines.push('## Verification Output (tail)', '```text', checksOutput, '```', '');

writeFileSync(join(artifactsDir, 'mechanical-gate.md'), reportLines.join('\n'), 'utf8');

const summaryParts: string[] = [];
if (changedFiles.length === 0) summaryParts.push('no changes produced');
if (!boundary.ok) {
  summaryParts.push(
    `boundary violation (${boundary.forbiddenHits.length} forbidden, ${boundary.outOfBounds.length} out-of-bounds)`
  );
}
if (!checksOk) summaryParts.push(cmdToRun ? `verification failed (${cmdToRun})` : 'verification command missing');
if (passed) summaryParts.push(`boundary clean (${changedFiles.length} files) & checks passed`);

emit({
  passed,
  boundary_ok: boundary.ok,
  checks_ok: checksOk,
  effective_has_ui: effectiveHasUi,
  effective_run_ux: effectiveRunUx,
  preview_cmd: previewCmd,
  diff_stat: diffStat,
  summary: summaryParts.join('; '),
});
