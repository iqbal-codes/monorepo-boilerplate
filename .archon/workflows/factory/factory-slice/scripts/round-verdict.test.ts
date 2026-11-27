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
      INPUTS_SPEC_LGTM: 'true',
      INPUTS_SPEC_SUMMARY: 'Spec LGTM',
      INPUTS_STD_LGTM: 'true',
      INPUTS_STD_SUMMARY: 'Standards LGTM',
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
  test('surfaces both UX and parallel QA review findings in the same round', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-verdict-'));
    try {
      mkdirSync(join(dir, 'evidence'), { recursive: true });
      mkdirSync(join(dir, 'review'), { recursive: true });
      writeFileSync(join(dir, 'evidence', 'ux-report.md'), '## Defects\n- Blocking: focus contrast 1.3:1');
      writeFileSync(join(dir, 'review', 'spec.md'), '[P1] Payload abort returns file');

      const { output, feedbackMd } = runVerdict(dir, {
        INPUTS_UX_PASSED: 'false',
        INPUTS_UX_SUMMARY: 'focus contrast too low',
        INPUTS_SPEC_LGTM: 'false',
        INPUTS_SPEC_SUMMARY: 'payload abort broken',
      });

      expect(output.done).toBe(false);
      expect(output.ready).toBe(false);
      expect(output.reason).toBe('ux_and_review_findings');
      expect(output.summary).toContain('UX black-box verification failed');
      expect(output.summary).toContain('Spec+Tests (payload abort broken)');
      expect(feedbackMd).toContain('- **UX Check:** FAIL — focus contrast too low');
      expect(feedbackMd).toContain('- **Spec & Regression Review:** CHANGES REQUESTED — payload abort broken');
      expect(feedbackMd).toContain('- **Standards & Code Review:** LGTM — Standards LGTM');
      expect(feedbackMd).toContain('- **Seams & Failure-Safety Review:** LGTM — Seams LGTM');
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
      expect(feedbackMd).toContain('- **Spec & Regression Review:** LGTM — Spec LGTM');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('marks ready when mechanical gate, UX, and all 3 review axes pass', () => {
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
});
