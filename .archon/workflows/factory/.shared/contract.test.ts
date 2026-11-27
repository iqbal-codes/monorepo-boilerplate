import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditBoundaries,
  buildQaTestCasesMarkdown,
  extractNativeBlockedByNumbers,
  isRenderedUiFile,
  parseSliceContract,
  validateSliceContract,
} from './contract.ts';

const scopedContract = '# Update feature\n\n- [ ] A blank query returns a validation error.';

describe('Slice contract and boundary guards', () => {
  test('unreserved delivery permits any unprotected path without a path list', () => {
    const res = auditBoundaries(['apps/api/src/index.ts'], [], ['.github/']);
    expect(res.ok).toBe(true);
  });

  test('parallel delivery enforces folder reservations and cannot override forbidden paths', () => {
    const res = auditBoundaries(
      ['apps/pos/src/Menu.tsx', 'apps/pos/src/ci.yaml', 'apps/pos/src-old/App.tsx'],
      ['apps/pos/src/'],
      ['apps/pos/src/ci.yaml']
    );
    expect(res.ok).toBe(false);
    expect(res.forbiddenHits).toEqual(['apps/pos/src/ci.yaml']);
    expect(res.outOfBounds).toEqual(['apps/pos/src-old/App.tsx']);
  });

  test('paths and a check do not make a request ready without acceptance criteria', () => {
    const parsed = parseSliceContract('# Vague request\n- **Work Areas:** `apps/checkout/`\n## Acceptance Criteria & Verification\n- **Verification Command:** `go test ./...`');
    expect(validateSliceContract(parsed).errors).toEqual([
      'Missing observable acceptance criteria. Describe the behavior that must be verified.',
    ]);
  });

  test('legacy paths are only hints; only explicit Allowed Folders reserve areas', () => {
    const parsed = parseSliceContract(`${scopedContract}\n- **Owned / Allowed Paths:** \`src/feature/index.ts\`\n- **Allowed Folders:**\n  - \`src/feature/\`\n- **Forbidden Shared Files:** \`src/feature/schema.ts\``);
    expect(parsed.workAreas).toEqual(['src/feature/index.ts']);
    expect(parsed.parallelFolders).toEqual(['src/feature/']);
    expect(parsed.forbiddenPaths).toEqual(['src/feature/schema.ts']);
    expect(parseSliceContract(`${scopedContract}\n- **Owned / Allowed Paths:** \`src/feature/**\``).parallelFolders).toEqual([]);
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
    expect(parseSliceContract(scopedContract + '\n- **Work Areas:** `apps/pos/src/`').hasUi).toBe(false);
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

  test('parses Test Case Checklist and Out of Scope and builds qa-testcases ledger', () => {
    const md = [
      '# Export Customers as XLSX',
      '- **Risk Tier:** `strict`',
      '- **Verification Command:** `bun test`',
      '- **Required UI States:**',
      '  - Desktop & 320px export menu',
      '## Acceptance Criteria & Verification Gate',
      '- [ ] Excel downloads literal strings',
      '- **Test Case Checklist (Outcome-Based):**',
      '  - `TC-01` `[UI]` Desktop & 320px menu opens without overflow -> menu fits cleanly',
      '  - `TC-02` `[Boundary]` 10,001 rows -> shows PAYLOAD_TOO_LARGE alert',
      '- **Out of Scope (Do Not Fail QA On):**',
      '  - Existing Import CSV dialog copy',
    ].join('\n');

    const parsed = parseSliceContract(md);
    expect(parsed.testCases).toEqual([
      { id: 'TC-01', description: '`[UI]` Desktop & 320px menu opens without overflow -> menu fits cleanly' },
      { id: 'TC-02', description: '`[Boundary]` 10,001 rows -> shows PAYLOAD_TOO_LARGE alert' },
    ]);
    expect(parsed.outOfScope).toEqual(['Existing Import CSV dialog copy']);

    const ledger = buildQaTestCasesMarkdown(parsed);
    expect(ledger).toContain('| `TC-01` |');
    expect(ledger).toContain('| `TC-02` |');
    expect(ledger).toContain('Existing Import CSV dialog copy');
    expect(ledger).toContain('`OPEN (Round 1 may add diff-bounded [TC-R1-*] defects; frozen after Round 1)`');
  });
});
