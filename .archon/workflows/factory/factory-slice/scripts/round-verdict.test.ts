import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'round-verdict.ts');

function runVerdict(
  artifactsDir: string,
  overrides: Record<string, string>
): {
  output: {
    round: number;
    done: boolean;
    ready: boolean;
    effective_has_ui: boolean;
    reason: string;
    diff_stat: string;
    summary: string;
  };
  feedbackMd: string;
} {
  const result = Bun.spawnSync([process.execPath, script], {
    env: {
      ...process.env,
      ARTIFACTS_DIR: artifactsDir,
      INPUTS_PREVIOUS_ROUND: '',
      INPUTS_REPO: 'owner/repo',
      INPUTS_ISSUE_NUMBER: '4',
      INPUTS_PR_NUMBER: '0',
      INPUTS_REVIEW_MODE: 'strict',
      INPUTS_RUN_UX: 'true',
      INPUTS_EFFECTIVE_HAS_UI: 'true',
      INPUTS_FIX_BLOCKED: 'false',
      INPUTS_FIX_SUMMARY: '',
      INPUTS_MECH_PASSED: 'true',
      INPUTS_MECH_SUMMARY: 'boundary clean & checks passed',
      INPUTS_MECH_DIFF_STAT: '2 files changed',
      INPUTS_UX_PASSED: 'true',
      INPUTS_UX_SUMMARY: 'UX verified',
      INPUTS_CODE_LGTM: 'true',
      INPUTS_CODE_SUMMARY: 'Code, Spec & Standards LGTM',
      INPUTS_SEAMS_LGTM: 'true',
      INPUTS_SEAMS_SUMMARY: 'Seams LGTM',
      ...overrides,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  const output = JSON.parse(result.stdout.toString());
  const feedbackMd = readFileSync(join(artifactsDir, 'round-feedback.md'), 'utf8');
  return { output, feedbackMd };
}

describe('round-verdict combined UX and parallel review verdict', () => {
  test('surfaces both UX and parallel QA review findings plus handoff checklist in the same round', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-'));
    try {
      mkdirSync(join(dir, 'evidence'), { recursive: true });
      mkdirSync(join(dir, 'review'), { recursive: true });
      writeFileSync(join(dir, 'evidence', 'ux-report.md'), '## Defects\n- Blocking: focus contrast 1.3:1');
      writeFileSync(
        join(dir, 'review', 'code.md'),
        [
          '- [P1] Payload abort returns file',
          '',
          '## Verified Clean',
          '- `csv.ts`: RFC 4180 escaping intact',
        ].join('\n')
      );
      writeFileSync(
        join(dir, 'review', 'seams-errors.md'),
        [
          '[✅ LGTM]',
          '## Examined Clean',
          '- `customers.ts:308`: auth and limit verified',
        ].join('\n')
      );

      const { output, feedbackMd } = runVerdict(dir, {
        INPUTS_UX_PASSED: 'false',
        INPUTS_UX_SUMMARY: 'focus contrast too low',
        INPUTS_CODE_LGTM: 'false',
        INPUTS_CODE_SUMMARY: 'payload abort broken',
      });

      expect(output.done).toBe(false);
      expect(output.ready).toBe(false);
      expect(output.reason).toBe('ux_and_review_findings');
      expect(output.summary).toContain('UX black-box verification failed');
      expect(output.summary).toContain('Code+Spec+Standards (payload abort broken)');
      expect(feedbackMd).toContain('- **UX Check:** FAIL — focus contrast too low');
      expect(feedbackMd).toContain('- **Code, Spec & Standards Review:** CHANGES REQUESTED — payload abort broken');
      expect(feedbackMd).toContain('- **Seams & Failure-Safety Review:** LGTM — Seams LGTM');
      expect(feedbackMd).toContain('### Open Blocking Items to Verify Fixed');
      expect(feedbackMd).toContain('- [P1] Payload abort returns file');
      expect(feedbackMd).toContain('### Prior Verified Clean (Re-audit Only If Touched by Delta)');
      expect(feedbackMd).toContain('`csv.ts`: RFC 4180 escaping intact');
      expect(feedbackMd).toContain('`customers.ts:308`: auth and limit verified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports ux_verify_failed when only UX fails and all review axes pass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-ux-'));
    try {
      const { output, feedbackMd } = runVerdict(dir, {
        INPUTS_UX_PASSED: 'false',
        INPUTS_UX_SUMMARY: '320px overflow',
      });

      expect(output.done).toBe(false);
      expect(output.reason).toBe('ux_verify_failed');
      expect(feedbackMd).toContain('- **UX Check:** FAIL — 320px overflow');
      expect(feedbackMd).toContain('- **Code, Spec & Standards Review:** LGTM — Code, Spec & Standards LGTM');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('marks ready when mechanical gate, UX, and all review axes pass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-ok-'));
    try {
      const { output } = runVerdict(dir, {});
      expect(output.done).toBe(true);
      expect(output.ready).toBe(true);
      expect(output.reason).toBe('ready');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('freezes Round 1 exploratory TCs in qa-testcases.md and locks Round 2+ against new exploratory TCs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-freeze-'));
    try {
      mkdirSync(join(dir, 'evidence'), { recursive: true });
      mkdirSync(join(dir, 'review'), { recursive: true });
      writeFileSync(
        join(dir, 'qa-testcases.md'),
        [
          '# QA Test-Case Ledger — Export',
          '',
          '- **Risk Tier:** `strict`',
          '- **Freeze State:** `OPEN (Round 1 may add diff-bounded [TC-R1-*] defects; frozen after Round 1)`',
          '',
          '## Contract Test Cases (Baseline)',
          '| ID | Case / Expected Outcome | Status | Notes |',
          '| :--- | :--- | :--- | :--- |',
          '| `TC-01` | Menu works at 320px | `PENDING` | — |',
          '',
          '## Round 1 Exploratory Cases (Frozen After Round 1)',
          '- _(None yet — Round 1 QA may emit `TC-R1-*` lines only for concrete defects in files/flows touched by the diff.)_',
          '',
        ].join('\n')
      );
      writeFileSync(
        join(dir, 'evidence', 'ux-report.md'),
        [
          '## Test Case Results',
          '- TC-01: PASS — fits at 320px',
          '- TC-R1-UX-01: FAIL — focus ring contrast 1.3:1',
        ].join('\n')
      );
      writeFileSync(join(dir, 'review', 'code.md'), '[✅ LGTM]\n- TC-01: PASS — code verified');

      runVerdict(dir, {
        INPUTS_UX_PASSED: 'false',
        INPUTS_UX_SUMMARY: 'focus ring low contrast',
      });

      const afterR1 = readFileSync(join(dir, 'qa-testcases.md'), 'utf8');
      expect(afterR1).toContain('`FROZEN');
      expect(afterR1).toContain('| `TC-01` | Menu works at 320px | `PASS` |');
      expect(afterR1).toContain('| `TC-R1-UX-01` | [Round 1 Exploratory] focus ring contrast 1.3:1 | `FAIL` | Round 1 |');

      // Round 2: TC-R1-UX-01 is fixed; an unexpected Round-2 exploratory TC must NOT be appended
      writeFileSync(
        join(dir, 'evidence', 'ux-report.md'),
        [
          '## Test Case Results',
          '- TC-01: PASS — fits at 320px',
          '- TC-R1-UX-01: PASS — inset ring contrast >= 3:1',
          '- TC-R2-UX-99: FAIL — should not be added after Round 1 freeze',
        ].join('\n')
      );

      runVerdict(dir, {
        INPUTS_PREVIOUS_ROUND: '1',
        INPUTS_UX_PASSED: 'true',
        INPUTS_UX_SUMMARY: 'All TCs pass',
      });

      const afterR2 = readFileSync(join(dir, 'qa-testcases.md'), 'utf8');
      expect(afterR2).toContain('| `TC-R1-UX-01` | [Round 1 Exploratory] focus ring contrast 1.3:1 | `PASS` |');
      expect(afterR2).not.toContain('TC-R2-UX-99');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
