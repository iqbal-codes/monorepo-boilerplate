import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'round-verdict.ts');

function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('INPUTS_') ||
      key === 'ARTIFACTS_DIR' ||
      key === 'FACTORY_PUBLISH_QA_STATUS' ||
      key === 'ARGUMENTS'
    ) {
      delete env[key];
    }
  }
  return env;
}

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
      ...cleanEnv(),
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
      INPUTS_CODE_SUMMARY: 'Code, Spec, Standards & Seams LGTM',
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

describe('round-verdict sequential UX and consolidated review verdict', () => {
  test('surfaces both UX and consolidated review findings plus handoff checklist in the same round', () => {
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
      expect(output.summary).toContain('Code+Spec+Standards+Seams (payload abort broken)');
      expect(feedbackMd).toContain('- **UX Check:** FAIL — focus contrast too low');
      expect(feedbackMd).toContain(
        '- **Code, Spec, Standards & Seams Review:** CHANGES REQUESTED — payload abort broken'
      );
      expect(feedbackMd).toContain('### Open Blocking Items to Verify Fixed');
      expect(feedbackMd).toContain('- [P1] Payload abort returns file');
      expect(feedbackMd).toContain('### Prior Verified Clean (Re-audit Only If Touched by Delta)');
      expect(feedbackMd).toContain('`csv.ts`: RFC 4180 escaping intact');
      expect(feedbackMd).toContain('`customers.ts:308`: auth and limit verified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('reports ux_verify_failed when only UX fails and consolidated review passes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-ux-'));
    try {
      const { output, feedbackMd } = runVerdict(dir, {
        INPUTS_UX_PASSED: 'false',
        INPUTS_UX_SUMMARY: '320px overflow',
      });

      expect(output.done).toBe(false);
      expect(output.reason).toBe('ux_verify_failed');
      expect(feedbackMd).toContain('- **UX Check:** FAIL — 320px overflow');
      expect(feedbackMd).toContain(
        '- **Code, Spec, Standards & Seams Review:** LGTM — Code, Spec, Standards & Seams LGTM'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('marks ready when mechanical gate, UX, and consolidated review pass', () => {
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

  test('preserves carried-forward UX PASS status and evidence when Round 2+ skips ux-verify', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-carried-ux-'));
    try {
      mkdirSync(join(dir, 'evidence'), { recursive: true });
      mkdirSync(join(dir, 'review'), { recursive: true });
      writeFileSync(
        join(dir, 'mechanical-gate.md'),
        '# Mechanical Gate Report\n\n- **UX Gate Decision:** skipped (prior round UX PASS; non-visual delta)\n'
      );
      writeFileSync(join(dir, 'evidence', 'after-desktop.png'), 'png');
      writeFileSync(join(dir, 'qa-testcases.md'), '| `TC-01` | Renders desktop banner | `PASS` | Round 1 UX |\n| `TC-02` | Latches 401 | `FAIL` | Round 1 |\n');
      writeFileSync(join(dir, 'review', 'code.md'), '[✅ LGTM]\n## Test Case Results\n- TC-02: PASS — 401 latched');

      const { output, feedbackMd } = runVerdict(dir, {
        INPUTS_PREVIOUS_ROUND: '1',
        INPUTS_RUN_UX: 'false',
        INPUTS_EFFECTIVE_HAS_UI: 'true',
        INPUTS_UX_PASSED: '',
        INPUTS_UX_SUMMARY: '',
      });

      expect(output.done).toBe(true);
      expect(output.ready).toBe(true);
      expect(output.effective_has_ui).toBe(true);
      expect(output.summary).toContain('UX carried forward');
      expect(feedbackMd).toContain('- **UX Check:** skipped (prior round UX PASS — carried forward)');
      const [record] = JSON.parse(readFileSync(join(dir, 'qa-verdicts.json'), 'utf8'));
      expect(record.evidence.some((file: string) => file.endsWith('/evidence/after-desktop.png'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('requires a QA ledger when a contract is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-missing-ledger-'));
    try {
      const { output } = runVerdict(dir, { INPUTS_CONTRACT_PATH: join(dir, 'contract.md') });
      expect(output.ready).toBe(false);
      expect(output.reason).toBe('qa_cases_incomplete');
      expect(output.summary).toContain('ledger is missing or empty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['PENDING', false],
    ['FAIL', false],
    ['PASS', true],
  ])('uses a %s required case to decide readiness even when reviewers report green', (status, ready) => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-cases-'));
    try {
      mkdirSync(join(dir, 'evidence'));
      writeFileSync(join(dir, 'qa-testcases.md'), '| `TC-01` | Check keyboard focus | `PENDING` | — |\n');
      if (status !== 'PENDING') {
        writeFileSync(join(dir, 'evidence', 'ux-report.md'), `## Test Case Results\n- TC-01: ${status} — browser result`);
      }

      const { output, feedbackMd } = runVerdict(dir, {});
      expect(output.ready).toBe(ready);
      expect(output.done).toBe(ready);
      expect(output.reason).toBe(ready ? 'ready' : 'qa_cases_incomplete');
      expect(feedbackMd).toContain(`TC-01: ${status}`);
      const [record] = JSON.parse(readFileSync(join(dir, 'qa-verdicts.json'), 'utf8'));
      expect(record).toMatchObject({
        round: 1,
        ready,
        cases: [{ id: 'TC-01', status }],
      });
      const ledger = record.evidence.find((file: string) => file.endsWith('/qa-testcases.md'));
      expect(readFileSync(join(dir, ledger), 'utf8')).toContain(`\`${status}\``);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('publishes the verdict for the reviewed commit when status reporting is enabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-status-'));
    try {
      const sha = Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim();
      const outputPath = join(dir, 'github-status.txt');
      writeFileSync(
        join(dir, 'gh'),
        [
          '#!/bin/sh',
          'if [ "$1" = api ]; then',
          '  printf "%s\\n" "$@" >> "$QA_STATUS_CAPTURE"',
          'fi',
        ].join('\n'),
        { mode: 0o700 }
      );
      writeFileSync(join(dir, 'qa-testcases.md'), '| `TC-01` | Verify export | `FAIL` | Reproduced |\n');
      const env = {
        INPUTS_PR_NUMBER: '9',
        FACTORY_PUBLISH_QA_STATUS: 'true',
        PATH: `${dir}:${process.env.PATH}`,
        QA_STATUS_CAPTURE: outputPath,
      };
      const { output } = runVerdict(dir, env);
      expect(output.ready).toBe(false);
      const args = readFileSync(outputPath, 'utf8').trim().split('\n');
      expect(args).toEqual([
        'api', '--method', 'POST', `repos/owner/repo/statuses/${sha}`,
        '-f', 'context=factory/qa', '-f', 'state=failure',
        '-f', 'description=Factory QA requires changes (round 1)',
        '-f', 'target_url=https://github.com/owner/repo/pull/9',
      ]);
      expect(readFileSync(join(dir, 'last-pr-comment.md'), 'utf8')).toContain(sha);
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

  test('keeps qa-testcases.md OPEN and omits PENDING P1 handoff spam when mechanical gate fails in Round 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-mech-fail-'));
    try {
      writeFileSync(
        join(dir, 'qa-testcases.md'),
        [
          '# QA Test-Case Ledger — Demo',
          '',
          '- **Risk Tier:** `strict`',
          '- **Freeze State:** `OPEN (Round 1 may add diff-bounded [TC-R1-*] defects; frozen after Round 1)`',
          '',
          '## Contract Test Cases (Baseline)',
          '| ID | Case / Expected Outcome | Status | Notes |',
          '| :--- | :--- | :--- | :--- |',
          '| `TC-01` | Render 404 screen | `PENDING` | — |',
          '',
          '## Round 1 Exploratory Cases (Frozen After Round 1)',
          '- _(None yet — Round 1 QA may emit `TC-R1-*` lines only for concrete defects in files/flows touched by the diff.)_',
          '',
        ].join('\n')
      );

      const { output: r1Output, feedbackMd: r1Feedback } = runVerdict(dir, {
        INPUTS_MECH_PASSED: 'false',
        INPUTS_MECH_SUMMARY: 'verification failed',
        INPUTS_UX_PASSED: '',
        INPUTS_CODE_LGTM: '',
      });

      expect(r1Output.done).toBe(false);
      expect(r1Output.reason).toBe('mechanical_gate_failed');
      expect(readFileSync(join(dir, 'qa-testcases.md'), 'utf8')).toContain('`OPEN');
      expect(r1Feedback).not.toContain('[P1] TC-01: PENDING');

      // Round 2 is now the first real QA pass and must still accept TC-R1-* before freezing.
      mkdirSync(join(dir, 'evidence'), { recursive: true });
      mkdirSync(join(dir, 'review'), { recursive: true });
      writeFileSync(
        join(dir, 'evidence', 'ux-report.md'),
        '## Test Case Results\n- **TC-01:** `PASS` — 404 renders\n1. TC-R1-UX-01: FAIL — clipped at 320px'
      );
      writeFileSync(
        join(dir, 'review', 'code.md'),
        '[✅ LGTM]\n## Test Case Results\n- **TC-01**: PASS — wired'
      );

      const { output: r2Output } = runVerdict(dir, {
        INPUTS_PREVIOUS_ROUND: '1',
        INPUTS_MECH_PASSED: 'true',
        INPUTS_UX_PASSED: 'false',
        INPUTS_UX_SUMMARY: 'clipped at 320px',
      });

      expect(r2Output.done).toBe(false);
      const afterR2 = readFileSync(join(dir, 'qa-testcases.md'), 'utf8');
      expect(afterR2).toContain('`FROZEN');
      expect(afterR2).toContain('| `TC-01` | Render 404 screen | `PASS` |');
      expect(afterR2).toContain('| `TC-R1-UX-01` | [Round 1 Exploratory] clipped at 320px | `FAIL` | Round 1 |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
