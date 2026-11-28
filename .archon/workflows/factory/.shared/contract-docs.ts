import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expandBraces } from './boundaries.ts';

/**
 * Finds local `docs/...` paths referenced in a contract that do not exist in `cwd`.
 * Expands brace patterns (e.g. `docs/specs/{a,b}.md`) while skipping wildcards and URLs.
 */
export function findMissingLocalDocRefs(markdown: string, cwd = process.cwd()): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  const pattern = /(?:^|[\s(`"'\[])(docs\/[A-Za-z0-9_.{}/,-]+)/g;

  for (const match of markdown.matchAll(pattern)) {
    const raw = match[1]!.replace(/[.,;:)\]`'"]+$/, '');
    if (!raw || raw.includes('*') || raw.includes('<')) continue;
    for (const expanded of expandBraces(raw)) {
      const clean = expanded.replace(/\/+$/, '');
      if (!clean || clean === 'docs' || seen.has(clean)) continue;
      seen.add(clean);
      if (!existsSync(join(cwd, clean))) {
        missing.push(expanded);
      }
    }
  }

  return missing;
}

export function appendMissingDocRefsNote(markdown: string, cwd = process.cwd()): string {
  const missing = findMissingLocalDocRefs(markdown, cwd);
  if (missing.length === 0) return markdown;
  return [
    markdown.trimEnd(),
    '',
    '## Missing Local References',
    '',
    'The following referenced local paths do not exist on this checkout:',
    ...missing.map((ref) => `- \`${ref}\``),
    '',
    'Treat these paths as absent here — rely on the contract above and existing repo files, and skip recursive filesystem scans or repeated `gh issue view` lookups for them.',
    '',
  ].join('\n');
}
