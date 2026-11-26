import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeDeliveryRuns, activeRunFolders, parseAllowedFolders, reservationsOverlap } from './ownership.ts';

test('parallel claims serialize nested folders and exclusive runs, not folder siblings', () => {
  const app = parseAllowedFolders('["apps/web/", "apps/web/"]');
  expect(reservationsOverlap(app, ['apps/web/src/orders/'])).toBe(true);
  expect(reservationsOverlap(app, [])).toBe(true);
  expect(reservationsOverlap(app, ['apps/web-admin/'])).toBe(false);
  expect(() => parseAllowedFolders(['apps/web/package.json'])).toThrow();
  expect(() => parseAllowedFolders(['apps/*/', '../src/'])).toThrow();
});

test('paused delivery still owns its reservation and an unreadable project cannot grant one', () => {
  const runs = activeDeliveryRuns(JSON.stringify({ scopeFallback: false, runs: [
    { id: 'refine', workflow_name: 'factory-refine', status: 'running' },
    { id: 'delivery', workflow_name: 'factory-slice', status: 'paused', metadata: { inputs: { allowed_folders: '["src/orders/"]' } } },
    { id: 'older-delivery', workflow_name: 'factory-pr-revise', status: 'running' },
  ] }));
  expect(runs.map(activeRunFolders)).toEqual([['src/orders/'], []]);
  expect(() => activeDeliveryRuns(JSON.stringify({ scopeFallback: true, runs: [] }))).toThrow();
});

test('publisher refuses a protected rename or reverted protected commit without updating the remote', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'factory-publish-'));
  const repo = join(cwd, 'repo');
  const remote = join(cwd, 'origin');
  function git(...args: string[]): string {
    const result = Bun.spawnSync(['git', ...args], { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  }
  function put(path: string, content: string): void {
    const dest = join(repo, path);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, content);
  }
  function publish(base: string) {
    return Bun.spawnSync([process.execPath, '-e', `
      import { auditBoundaries } from ${JSON.stringify(join(import.meta.dir, 'contract.ts'))};
      import { syncBranchChanges } from ${JSON.stringify(join(import.meta.dir, 'github.ts'))};
      import { deliveryPaths, resolveForbiddenPaths } from ${JSON.stringify(join(import.meta.dir, 'ownership.ts'))};
      const base = ${JSON.stringify(base)};
      const forbidden = resolveForbiddenPaths(base, []);
      syncBranchChanges({
        baseSha: base, commitMessage: 'fix', branchName: 'factory/changes',
        assertPublishable(head) {
          const verdict = auditBoundaries(deliveryPaths(base, head), ['src/'], forbidden);
          if (!verdict.ok) throw new Error(JSON.stringify(verdict));
        },
      });
    `], { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
  }
  try {
    mkdirSync(repo);
    git('init', '-q', '-b', 'main');
    git('init', '-q', '--bare', remote);
    git('config', 'user.email', 'factory@example.test');
    git('config', 'user.name', 'Factory test');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.hooksPath', join(cwd, 'no-hooks'));
    git('remote', 'add', 'origin', remote);
    put('.archon/sdlc/policy/protected-paths.json', '["src/shared.txt"]');
    put('src/shared.txt', 'original');
    git('add', '.');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    put('src/new-helper.ts', 'export const helper = 1;');
    const good = publish(base);
    expect(good.exitCode).toBe(0);
    const published = git('--git-dir', remote, 'rev-parse', 'factory/changes');
    expect(published).not.toBe(base);

    git('mv', 'src/shared.txt', 'src/moved.txt');
    const rename = publish(base);
    expect(rename.exitCode).not.toBe(0);
    expect(rename.stderr.toString()).toContain('"forbiddenHits":["src/shared.txt"]');
    expect(git('rev-parse', 'HEAD')).toBe(published);

    git('commit', '-qm', 'rename protected file');
    git('revert', '--no-edit', 'HEAD');
    const reverted = publish(base);
    expect(reverted.exitCode).not.toBe(0);
    expect(reverted.stderr.toString()).toContain('"forbiddenHits":["src/shared.txt"]');
    expect(git('--git-dir', remote, 'rev-parse', 'factory/changes')).toBe(published);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
