import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeDeliveryRuns, activeDeliveryClaim, deliveryClaimsConflict, parseDeliveryClaim } from './ownership.ts';

test('normal runs can overlap each other but cannot enter a reservation or exclusive delivery', () => {
  const normal = parseDeliveryClaim();
  const reserved = parseDeliveryClaim(['apps/web/']);
  const exclusive = parseDeliveryClaim('[]', 'true');
  expect(deliveryClaimsConflict(normal, parseDeliveryClaim('[]', 'false'))).toBe(false);
  expect(deliveryClaimsConflict(normal, reserved)).toBe(true);
  expect(deliveryClaimsConflict(reserved, normal)).toBe(true);
  expect(deliveryClaimsConflict(exclusive, normal)).toBe(true);
  expect(deliveryClaimsConflict(reserved, exclusive)).toBe(true);
  expect(deliveryClaimsConflict(exclusive, exclusive)).toBe(true);
});

test('reserved runs serialize nested folders but not siblings, and reject incompatible inputs', () => {
  const app = parseDeliveryClaim('["apps/web/", "apps/web/"]');
  expect(deliveryClaimsConflict(app, parseDeliveryClaim(['apps/web/src/orders/']))).toBe(true);
  expect(deliveryClaimsConflict(app, parseDeliveryClaim(['apps/web-admin/']))).toBe(false);
  expect(() => parseDeliveryClaim(['apps/web/package.json'])).toThrow();
  expect(() => parseDeliveryClaim(['apps/*/', '../src/'])).toThrow();
  expect(() => parseDeliveryClaim(['apps/web/'], 'true')).toThrow('cannot also specify Allowed Folders');
  expect(() => parseDeliveryClaim([], 'yes')).toThrow('exclusive must be true or false');
});

test('paused delivery still owns its reservation and an unreadable project cannot grant one', () => {
  const runs = activeDeliveryRuns(JSON.stringify({ scopeFallback: false, runs: [
    { id: 'refine', workflow_name: 'factory-refine', status: 'running' },
    { id: 'delivery', workflow_name: 'factory-slice', status: 'paused', metadata: { inputs: { allowed_folders: '["src/orders/"]' } } },
    { id: 'normal', workflow_name: 'factory-pr-revise', status: 'running', metadata: { inputs: { pr: '32' } } },
    { id: 'exclusive', workflow_name: 'factory-pr-revise', status: 'paused', metadata: { inputs: { exclusive: 'true' } } },
    { id: 'invalid', workflow_name: 'factory-slice', status: 'running', metadata: { inputs: { allowed_folders: 'not JSON' } } },
  ] }));
  expect(runs.map(activeDeliveryClaim)).toEqual([
    { kind: 'reserved', folders: ['src/orders/'] }, { kind: 'normal' }, { kind: 'exclusive' }, { kind: 'exclusive' },
  ]);
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
