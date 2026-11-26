import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMaintainer, loadMaintainers, normalizeGithubLogin } from './maintainers.ts';

describe('maintainers policy enforcement', () => {
  test('fails closed when policy file is missing or malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-maintainers-'));
    try {
      expect(loadMaintainers(dir).size).toBe(0);

      mkdirSync(join(dir, '.archon/sdlc/policy'), { recursive: true });
      writeFileSync(join(dir, '.archon/sdlc/policy/maintainers.json'), 'not-json');
      expect(loadMaintainers(dir).size).toBe(0);

      writeFileSync(
        join(dir, '.archon/sdlc/policy/maintainers.json'),
        JSON.stringify(['<github-username>', '__MAINTAINER__'])
      );
      expect(loadMaintainers(dir).size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('normalizes @ prefixes and case while rejecting non-maintainers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'factory-maintainers-'));
    try {
      mkdirSync(join(dir, '.archon/sdlc/policy'), { recursive: true });
      writeFileSync(
        join(dir, '.archon/sdlc/policy/maintainers.json'),
        JSON.stringify(['@Iqbal-Codes', 'alice'])
      );
      const allowlist = loadMaintainers(dir);
      expect(normalizeGithubLogin('@Iqbal-Codes')).toBe('iqbal-codes');
      expect(isMaintainer('iqbal-codes', allowlist)).toBe(true);
      expect(isMaintainer('ALICE', allowlist)).toBe(true);
      expect(isMaintainer('external-contributor', allowlist)).toBe(false);
      expect(isMaintainer('', allowlist)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
