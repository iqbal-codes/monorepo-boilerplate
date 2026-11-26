import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditBoundaries,
  extractNativeBlockedByNumbers,
  isRenderedUiFile,
  parseSliceContract,
  validateSliceContract,
} from './contract.ts';

const scopedContract = '# Update feature\n\n- **Owned / Allowed Paths:**\n  - `src/feature/**`';

describe('Slice contract and boundary guards', () => {
  test('auditBoundaries fails closed when ownedPaths is empty', () => {
    const res = auditBoundaries(['apps/api/src/index.ts'], [], []);
    expect(res.ok).toBe(false);
    expect(res.outOfBounds).toEqual(['apps/api/src/index.ts']);
  });

  test('auditBoundaries enforces ownedPaths and forbiddenPaths', () => {
    const res = auditBoundaries(
      ['apps/pos/src/Menu.tsx', 'package.json', 'apps/kds/src/App.tsx'],
      ['apps/pos/src/**'],
      ['package.json']
    );
    expect(res.ok).toBe(false);
    expect(res.forbiddenHits).toEqual(['package.json']);
    expect(res.outOfBounds).toEqual(['apps/kds/src/App.tsx']);
  });

  test('validateSliceContract rejects vague issue without Owned Paths', () => {
    const parsed = parseSliceContract('# Vague request\nPlease make checkout faster.\n\n- **Verification Command:** `go test ./...`');
    const readiness = validateSliceContract(parsed);
    expect(readiness.ok).toBe(false);
    expect(readiness.errors[0]).toContain('Owned / Allowed Paths');
  });

  test('explicit verification works with any project stack', () => {
    const parsed = parseSliceContract(scopedContract + '\n\n- **Verification Command:** `go test ./...`');
    expect(validateSliceContract(parsed)).toEqual({
      ok: true,
      errors: [],
      verificationCommand: 'go test ./...',
    });
  });

  test('legacy package scripts use repository evidence without guessing a package manager', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-contract-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { ci: 'run-checks' } }));
      const parsed = parseSliceContract(scopedContract);
      expect(validateSliceContract(parsed, { cwd: dir }).ok).toBe(false);

      writeFileSync(join(dir, 'yarn.lock'), '');
      expect(validateSliceContract(parsed, { cwd: dir }).verificationCommand).toBe('yarn run ci');

      writeFileSync(join(dir, 'bun.lock'), '');
      expect(validateSliceContract(parsed, { cwd: dir }).ok).toBe(false);

      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        packageManager: 'bun@1.3.10',
        scripts: { test: 'bun test' },
      }));
      expect(validateSliceContract(parsed, { cwd: dir }).verificationCommand).toBe('bun run test');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('UI classification follows declared states and changed surface files', () => {
    expect(parseSliceContract(scopedContract + '\n\n- **Required UI States:**\n  - Preview screen').hasUi).toBe(true);
    expect(parseSliceContract(scopedContract.replace('src/feature/**', 'apps/pos/src/**')).hasUi).toBe(false);
  });

  test('isRenderedUiFile detects real UI extensions from git diff', () => {
    expect(isRenderedUiFile('apps/pos/src/features/menu/MenuTile.tsx')).toBe(true);
    expect(isRenderedUiFile('packages/ui/src/styles/theme.css')).toBe(true);
    expect(isRenderedUiFile('frontend/Search.svelte')).toBe(true);
    expect(isRenderedUiFile('apps/api/src/routes/orders.ts')).toBe(false);
  });

  test('parses Blocked by across bold inline, plain inline, section bullets, and native GitHub blockedBy', () => {
    expect(parseSliceContract('# S\n- **Blocked By:** #1, #2').blockedBy).toEqual([1, 2]);
    expect(parseSliceContract('# S\nBlocked by: #3, #4').blockedBy).toEqual([3, 4]);
    expect(parseSliceContract('# S\n## Blocked by\n- #5\n- #6\n## Next\n#7').blockedBy).toEqual([5, 6]);
    expect(
      extractNativeBlockedByNumbers({
        nodes: [
          { number: 10, state: 'OPEN' },
          { number: 11, state: 'CLOSED' },
        ],
      })
    ).toEqual({ open: [10], all: [10, 11] });
  });
});
