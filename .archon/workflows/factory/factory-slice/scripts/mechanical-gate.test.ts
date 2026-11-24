import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'mechanical-gate.ts');

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
          ...process.env,
          ARTIFACTS_DIR: join(dir, 'artifacts'),
          INPUTS_BASE_SHA: 'HEAD',
          INPUTS_CONTRACT_HAS_UI: 'true',
          INPUTS_OWNED_PATHS: '["index.html",".archon/ui-preview.sh"]',
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
