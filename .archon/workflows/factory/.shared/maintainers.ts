/**
 * Shared maintainer allowlist enforcement for GitHub-driven Factory operations.
 * Reads `.archon/sdlc/policy/maintainers.json` and fails closed when missing or empty.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLACEHOLDERS = new Set(['__maintainer__', '<github-username>', '']);

export function normalizeGithubLogin(login: string | undefined | null): string {
  return (login ?? '').trim().replace(/^@/, '').toLowerCase();
}

export function loadMaintainers(cwd = process.cwd()): Set<string> {
  const policyPath = join(cwd, '.archon/sdlc/policy/maintainers.json');
  if (!existsSync(policyPath)) return new Set();

  try {
    const parsed = JSON.parse(readFileSync(policyPath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const clean = normalizeGithubLogin(entry);
      if (clean && !PLACEHOLDERS.has(clean)) {
        out.add(clean);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

export function isMaintainer(
  login: string | undefined | null,
  allowlist: Set<string>
): boolean {
  if (allowlist.size === 0) return false;
  const clean = normalizeGithubLogin(login);
  return clean.length > 0 && allowlist.has(clean);
}
