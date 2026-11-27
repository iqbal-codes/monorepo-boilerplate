/**
 * Deterministic mechanical gate (0 LLM tokens):
 * 1. Checks reserved folders and protected files before running verification.
 * 2. Runs the verification command resolved at contract intake.
 * Writes full evidence to $ARTIFACTS_DIR/mechanical-gate.md.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditBoundaries, emit, isRenderedUiFile, resolvePreviewCommand, runCmd, text } from '../../.shared/contract.ts';
import { deliveryPaths, parseAllowedFolders } from '../../.shared/ownership.ts';

const artifactsDir = process.env.ARTIFACTS_DIR || '/tmp/archon-factory-artifacts';
mkdirSync(artifactsDir, { recursive: true });
// Clear stale review reports from any prior iteration before running this round's gate
for (const stale of ['code.md', 'spec.md', 'standards.md', 'seams-errors.md']) {
  rmSync(join(artifactsDir, 'review', stale), { force: true });
}

const baseSha = text(process.env.INPUTS_BASE_SHA) || 'HEAD';
const cmdToRun = text(process.env.INPUTS_VERIFICATION_COMMAND);
const allowedFolders = parseAllowedFolders(process.env.INPUTS_ALLOWED_FOLDERS);
const forbiddenPaths = JSON.parse(text(process.env.INPUTS_FORBIDDEN_PATHS) || '[]') as string[];
const contractHasUi = text(process.env.INPUTS_CONTRACT_HAS_UI) === 'true';

// A blocked fixer ends the round here: no verification run, no browser check, no
// reviewers. The round verdict still classifies the round from this node's output.
if (text(process.env.INPUTS_FIX_BLOCKED) === 'true') {
  const summary = 'skipped: the fix pass reported a blocker';
  writeFileSync(
    join(artifactsDir, 'mechanical-gate.md'),
    ['# Mechanical Gate Report', '', '- **Overall:** SKIPPED', `- **Reason:** ${summary}`, ''].join('\n'),
    'utf8'
  );
  emit({
    passed: false,
    boundary_ok: false,
    checks_ok: false,
    effective_has_ui: contractHasUi,
    effective_run_ux: false,
    preview_cmd: '',
    diff_stat: '',
    summary,
  });
  process.exit(0);
}

const changedFiles = deliveryPaths(baseSha);

const diffStat = runCmd(['git', 'diff', '--stat', baseSha]).stdout || `${changedFiles.length} file(s) changed`;

const boundary = auditBoundaries(changedFiles, allowedFolders, forbiddenPaths);

let checksOk = false;
let checksOutput = 'No verification command resolved from the contract.';
if (!boundary.ok) {
  checksOutput = 'Verification skipped because the delivery boundary failed.';
} else if (changedFiles.length === 0) {
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
  reportLines.push('## Forbidden Paths Violated (P0)');
  for (const f of boundary.forbiddenHits) reportLines.push(`- \`${f}\``);
  reportLines.push('');
}
if (boundary.outOfBounds.length > 0) {
  reportLines.push('## Out-of-Bounds Files Outside Reserved Folders (P0)');
  for (const f of boundary.outOfBounds) reportLines.push(`- \`${f}\``);
  reportLines.push('');
}

function collectStaticHygieneSignals(files: string[], base: string): string[] {
  const signals: string[] = [];
  const oversized: string[] = [];
  const uiSmells: string[] = [];

  for (const relPath of files) {
    if (!existsSync(relPath)) continue;
    if (/\.(md|json|yaml|yml|lock|svg|png|jpg|css)$/i.test(relPath)) continue;
    if (/(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/i.test(relPath)) continue;

    const lineCount = readFileSync(relPath, 'utf8').split(/\r?\n/).length;
    const isUi = isRenderedUiFile(relPath);
    const limit = isUi ? 300 : 400;
    if (lineCount > limit) {
      oversized.push(`\`${relPath}\` (${lineCount} lines > ${limit})`);
    }
    if (isUi) {
      const diffRes = runCmd(['git', 'diff', '-U0', base, '--', relPath], { allowFail: true });
      if (diffRes.code === 0 && diffRes.stdout) {
        const added = diffRes.stdout
          .split(/\r?\n/)
          .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
        if (added.some((l) => /\bspace-[xy]-/.test(l))) {
          uiSmells.push(`\`${relPath}\`: added \`space-x-*\`/\`space-y-*\` utility`);
        }
        if (added.some((l) => /<(button|input|select)\b/.test(l))) {
          uiSmells.push(`\`${relPath}\`: added raw HTML \`<button>\`/\`<input>\`/\`<select>\``);
        }
        if (added.some((l) => /#[0-9a-fA-F]{3,8}\b/.test(l))) {
          uiSmells.push(`\`${relPath}\`: added hardcoded hex color`);
        }
      }
    }
  }

  const wsCheck = runCmd(['git', 'diff', '--check', base], { allowFail: true });
  signals.push(`- **Oversized changed files:** ${oversized.length > 0 ? oversized.join(', ') : 'none'}`);
  signals.push(`- **UI primitive/spacing signals:** ${uiSmells.length > 0 ? uiSmells.join('; ') : 'none'}`);
  signals.push(
    `- **Diff whitespace/conflict check:** ${wsCheck.code === 0 ? 'clean' : wsCheck.stdout.split(/\r?\n/).slice(0, 5).join(' | ') || 'issues detected'}`
  );
  return signals;
}

const prevFeedbackPath = join(artifactsDir, 'round-feedback.md');
const prevShaMatch = existsSync(prevFeedbackPath)
  ? readFileSync(prevFeedbackPath, 'utf8').match(/\*\*Reviewed SHA:\*\*\s*`([a-f0-9]{7,40})`/i)
  : null;
const prevSha = prevShaMatch?.[1] || '';

reportLines.push('## Diff Stat', '```text', diffStat, '```', '');
if (prevSha) {
  const deltaStat = runCmd(['git', 'diff', '--stat', `${prevSha}..HEAD`], { allowFail: true }).stdout;
  if (deltaStat) {
    reportLines.push(`## Delta Since Last Round (\`${prevSha.slice(0, 7)}..HEAD\`)`, '```text', deltaStat, '```', '');
  }
}
reportLines.push('## Static Hygiene Signals (0 LLM tokens)', ...collectStaticHygieneSignals(changedFiles, baseSha), '');
reportLines.push('## Verification Output (tail)', '```text', checksOutput, '```', '');

writeFileSync(join(artifactsDir, 'mechanical-gate.md'), reportLines.join('\n'), 'utf8');

const summaryParts: string[] = [];
if (changedFiles.length === 0) summaryParts.push('no changes produced');
const listing = (paths: string[]): string =>
  `${paths.slice(0, 5).join(', ')}${paths.length > 5 ? `, +${paths.length - 5} more` : ''}`;
if (boundary.forbiddenHits.length > 0) {
  summaryParts.push(`forbidden path violation: ${listing(boundary.forbiddenHits)}`);
}
if (boundary.outOfBounds.length > 0) {
  summaryParts.push(`outside the reserved folders: ${listing(boundary.outOfBounds)}`);
}
if (!checksOk && boundary.ok) summaryParts.push(cmdToRun ? `verification failed (${cmdToRun})` : 'verification command missing');
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
