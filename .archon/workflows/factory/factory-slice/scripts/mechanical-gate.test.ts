import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'mechanical-gate.ts');

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

test('a preview hook added by the first UI slice reaches the UX gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-preview-gate-'));
  try {
    const cwd = join(dir, 'checkout');
    mkdirSync(cwd);
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd, stderr: 'pipe' });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    };
    git('init', '--quiet');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '--quiet', '-m', 'Scaffold');
    writeFileSync(join(cwd, 'index.html'), '<!doctype html><title>Preview</title>');

    const gate = (previewCmd: string) => {
      const result = Bun.spawnSync([process.execPath, script], {
        cwd,
        env: {
          ...cleanEnv(),
          ARTIFACTS_DIR: join(dir, 'artifacts'),
          INPUTS_BASE_SHA: 'HEAD',
          INPUTS_CONTRACT_HAS_UI: 'true',
          INPUTS_ALLOWED_FOLDERS: '[]',
          INPUTS_FORBIDDEN_PATHS: '[]',
          INPUTS_VERIFICATION_COMMAND: 'true',
          INPUTS_PREVIEW_CMD: previewCmd,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      const output = JSON.parse(result.stdout.toString());
      expect(output.passed).toBe(true);
      return output;
    };

    expect(gate('').effective_run_ux).toBe(false);

    mkdirSync(join(cwd, '.archon'));
    writeFileSync(join(cwd, '.archon/ui-preview.sh'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    const discovered = gate('');
    expect(discovered.effective_run_ux).toBe(true);
    expect(discovered.preview_cmd).toContain('.archon/ui-preview.sh');

    const explicit = gate('node scripts/preview.mjs');
    expect(explicit.effective_run_ux).toBe(true);
    expect(explicit.preview_cmd).toBe('node scripts/preview.mjs');

    const report = readFileSync(join(dir, 'artifacts', 'mechanical-gate.md'), 'utf8');
    expect(report).toContain('## Static Hygiene Signals (0 LLM tokens)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skips ux-verify on Round 2+ when prior UX passed and fix delta is non-visual, but re-enables on visual edits or prior UX failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'factory-delta-ux-gate-'));
  try {
    const cwd = join(dir, 'checkout');
    const artifacts = join(dir, 'artifacts');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(artifacts, { recursive: true });
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    git('init', '--quiet');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '--quiet', '-m', 'Base');
    const baseSha = git('rev-parse', 'HEAD');

    mkdirSync(join(cwd, '.archon'), { recursive: true });
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, '.archon/ui-preview.sh'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    writeFileSync(
      join(cwd, 'src/banner.tsx'),
      'export function Banner({ show }: { show: boolean }) {\n  if (!show) return null;\n  return <div className="p-2">Active</div>;\n}\n'
    );
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Round 1');
    const r1Sha = git('rev-parse', 'HEAD');

    const runGate = () => {
      const result = Bun.spawnSync([process.execPath, script], {
        cwd,
        env: {
          ...cleanEnv(),
          ARTIFACTS_DIR: artifacts,
          INPUTS_BASE_SHA: baseSha,
          INPUTS_CONTRACT_HAS_UI: 'true',
          INPUTS_ALLOWED_FOLDERS: '[]',
          INPUTS_FORBIDDEN_PATHS: '[]',
          INPUTS_VERIFICATION_COMMAND: 'true',
          INPUTS_PREVIEW_CMD: './.archon/ui-preview.sh',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return JSON.parse(result.stdout.toString());
    };

    // Round 2: prior UX PASS + logic-only edit in TSX -> skip ux-verify, keep effective_has_ui=true
    writeFileSync(
      join(artifacts, 'round-feedback.md'),
      [
        '# Round 1 Verdict',
        `- **Reviewed SHA:** \`${r1Sha}\``,
        '- **UX Check:** PASS — verified desktop and mobile',
        '### Open Blocking Items to Verify Fixed',
        '**Code, Spec, Standards & Seams Review:**',
        '- [P1] Latch 401 session error',
      ].join('\n')
    );
    writeFileSync(
      join(cwd, 'src/banner.tsx'),
      'export function Banner({ show, latched }: { show: boolean; latched?: boolean }) {\n  if (!show || latched) return null;\n  return <div className="p-2">Active</div>;\n}\n'
    );
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Round 2 logic fix');
    const r2Sha = git('rev-parse', 'HEAD');

    const r2 = runGate();
    expect(r2.passed).toBe(true);
    expect(r2.effective_has_ui).toBe(true);
    expect(r2.effective_run_ux).toBe(false);
    expect(readFileSync(join(artifacts, 'mechanical-gate.md'), 'utf8')).toContain(
      '- **UX Gate Decision:** skipped (prior round UX PASS; non-visual delta)'
    );

    // Round 3: prior UX PASS carried forward, but delta edits className -> re-enable ux-verify
    writeFileSync(
      join(artifacts, 'round-feedback.md'),
      [
        '# Round 2 Verdict',
        `- **Reviewed SHA:** \`${r2Sha}\``,
        '- **UX Check:** skipped (prior round UX PASS — carried forward)',
        '### Open Blocking Items to Verify Fixed',
        '**Code, Spec, Standards & Seams Review:**',
        '- [P1] Fix focus outline',
      ].join('\n')
    );
    writeFileSync(
      join(cwd, 'src/banner.tsx'),
      'export function Banner({ show, latched }: { show: boolean; latched?: boolean }) {\n  if (!show || latched) return null;\n  return <div className="p-2 outline-solid">Active</div>;\n}\n'
    );
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Round 3 visual fix');

    const r3 = runGate();
    expect(r3.effective_run_ux).toBe(true);

    // Prior UX FAIL with logic-only edit -> must still run ux-verify
    writeFileSync(
      join(artifacts, 'round-feedback.md'),
      [
        '# Round 2 Verdict',
        `- **Reviewed SHA:** \`${r2Sha}\``,
        '- **UX Check:** FAIL — contrast too low',
        '### Open Blocking Items to Verify Fixed',
        '**UX:**',
        '- Blocking: focus contrast',
      ].join('\n')
    );
    expect(runGate().effective_run_ux).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
