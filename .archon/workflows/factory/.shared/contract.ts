/**
 * Shared deterministic helpers for the Archon Factory workflow pack.
 * Pure TypeScript + Bun/Node built-ins only (zero external npm dependencies).
 */

import { X_OK } from 'node:constants';
import { accessSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ParsedSliceContract {
  title: string;
  sliceId: string;
  phase: 'L0' | 'L1' | 'L2' | 'L3' | '';
  riskTier: 'strict' | 'standard';
  scaffoldHandoff: string | null;
  ownedPaths: string[];
  forbiddenPaths: string[];
  blockedBy: number[];
  verificationCommand: string;
  archetypeRef: string;
  hasUi: boolean;
  uiStates: string[];
}

export function text(v: string | undefined): string {
  const s = (v ?? '').trim();
  return s === 'null' || s === 'undefined' ? '' : s;
}

export function extractLinkedIssueNumber(prBody: string): number {
  const match = prBody.match(/(?:Closes|Fixes|Resolves|Refs)\s+#(\d+)/i);
  if (!match) return 0;
  const num = Number.parseInt(match[1], 10);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

export function resolvePreviewCommand(explicit: string, cwd = process.cwd()): string {
  if (explicit) return explicit;
  try {
    accessSync(join(cwd, '.archon/ui-preview.sh'), X_OK);
    return './.archon/ui-preview.sh';
  } catch {
    return '';
  }
}

export function emit(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

export function runCmd(
  args: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; allowFail?: boolean } = {}
): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(args, {
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new TextDecoder().decode(proc.stdout).trim();
  const stderr = new TextDecoder().decode(proc.stderr).trim();
  const code = proc.exitCode ?? 1;
  if (code !== 0 && !opts.allowFail) {
    throw new Error(`Command failed (${code}): ${args.join(' ')}\n${stderr || stdout}`);
  }
  return { code, stdout, stderr };
}

export function detectGitRepo(cwd = process.cwd()): string {
  const res = runCmd(['git', 'remote', 'get-url', 'origin'], { cwd, allowFail: true });
  if (res.code !== 0 || !res.stdout) return '';
  const url = res.stdout.trim();
  const sshMatch = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return sshMatch ? sshMatch[1] : '';
}

export function detectBaseBranch(cwd = process.cwd()): string {
  const sym = runCmd(['git', 'symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd, allowFail: true });
  if (sym.code === 0 && sym.stdout) {
    const parts = sym.stdout.split('/');
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return 'main';
}

export function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const full = match[0];
  const options = match[1].split(',').map((s) => s.trim());
  const out: string[] = [];
  for (const opt of options) {
    const replaced = pattern.replace(full, opt);
    out.push(...expandBraces(replaced));
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  let re = '^';
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        if (normalized[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      re += '[^/]';
      i += 1;
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      re += `\\${ch}`;
      i += 1;
    } else {
      re += ch;
      i += 1;
    }
  }
  re += '$';
  return new RegExp(re);
}

export function matchPathPattern(filePath: string, pattern: string): boolean {
  const cleanPath = filePath.replace(/^\.\//, '');
  for (const expanded of expandBraces(pattern.trim())) {
    const cleanPat = expanded.replace(/^\.\//, '').replace(/\/+$/, '');
    if (!cleanPat) continue;
    if (globToRegExp(cleanPat).test(cleanPath)) return true;
    // Allow directory prefix patterns like "packages/ui" or "packages/ui/"
    if (!cleanPat.includes('*') && cleanPath.startsWith(`${cleanPat}/`)) return true;
  }
  return false;
}

export function isRenderedUiFile(filePath: string): boolean {
  const clean = filePath.replace(/^\.\//, '');
  return /\.(tsx|jsx|css|scss|html|vue|svelte|astro|qml|xaml)$/i.test(clean);
}

export function auditBoundaries(
  changedFiles: string[],
  ownedPaths: string[],
  forbiddenPaths: string[]
): { ok: boolean; outOfBounds: string[]; forbiddenHits: string[] } {
  const forbiddenHits: string[] = [];
  const outOfBounds: string[] = [];

  for (const file of changedFiles) {
    if (forbiddenPaths.some((pat) => matchPathPattern(file, pat))) {
      forbiddenHits.push(file);
      continue;
    }
    if (ownedPaths.length === 0 || !ownedPaths.some((pat) => matchPathPattern(file, pat))) {
      outOfBounds.push(file);
    }
  }

  return {
    ok: ownedPaths.length > 0 && forbiddenHits.length === 0 && outOfBounds.length === 0,
    outOfBounds,
    forbiddenHits,
  };
}

function extractBlockedBy(markdown: string): number[] {
  const nums: number[] = [];
  const lines = markdown.split(/\r?\n/);
  let inBlockedSection = false;

  for (const line of lines) {
    const inlineMatch = line.match(/^\s*(?:[-*]\s+)?(?:\*\*)?Blocked\s+By(?:\*\*)?:(?:\*\*)?([^\n]*)$/i);
    if (inlineMatch) {
      inBlockedSection = true;
      for (const m of inlineMatch[1].matchAll(/#(\d+)/g)) {
        nums.push(Number.parseInt(m[1], 10));
      }
      continue;
    }

    if (/^##\s+Blocked\s+By\b/i.test(line)) {
      inBlockedSection = true;
      continue;
    }

    if (inBlockedSection) {
      if (/^#{1,6}\s/.test(line) || /^\s*[-*]?\s*\*\*/.test(line)) {
        inBlockedSection = false;
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        for (const m of line.matchAll(/#(\d+)/g)) {
          nums.push(Number.parseInt(m[1], 10));
        }
      }
    }
  }

  return [...new Set(nums.filter((n) => Number.isFinite(n) && n > 0))];
}

export function extractNativeBlockedByNumbers(rawBlockedBy: unknown): { open: number[]; all: number[] } {
  const nodes = Array.isArray(rawBlockedBy)
    ? rawBlockedBy
    : rawBlockedBy && typeof rawBlockedBy === 'object' && Array.isArray((rawBlockedBy as { nodes?: unknown }).nodes)
      ? (rawBlockedBy as { nodes: unknown[] }).nodes
      : [];
  const open: number[] = [];
  const all: number[] = [];
  for (const entry of nodes) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as { number?: unknown; state?: unknown };
    const num = typeof item.number === 'number' ? item.number : Number.parseInt(String(item.number ?? ''), 10);
    if (!Number.isFinite(num) || num <= 0) continue;
    all.push(num);
    if (String(item.state ?? 'OPEN').toUpperCase() === 'OPEN') {
      open.push(num);
    }
  }
  return { open: [...new Set(open)], all: [...new Set(all)] };
}

function extractBacktickTokens(line: string): string[] {
  const matches = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean);
  if (matches.length > 0) return matches;
  const cleaned = line
    .replace(/^[-*]\s+/, '')
    .replace(/\[[ xX]\]\s+/, '')
    .trim();
  return cleaned ? [cleaned] : [];
}

function extractSectionBulletPaths(markdown: string, headingPattern: RegExp): string[] {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let baseIndent = 0;

  for (const line of lines) {
    if (!inList) {
      if (headingPattern.test(line)) {
        inList = true;
        baseIndent = line.search(/\S/);
        // Also support inline paths on the same line after colon (ignoring closing markdown bold **)
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const tail = line
            .slice(colonIdx + 1)
            .replace(/^\*+\s*/, '')
            .replace(/\*+$/, '')
            .trim();
          if (tail && !/^n\/a$/i.test(tail)) {
            out.push(...extractBacktickTokens(tail));
          }
        }
      }
      continue;
    }

    if (/^#{1,6}\s/.test(line)) break;
    if (/^\s*[-*]\s+\*\*/.test(line) && line.search(/\S/) <= baseIndent) break;
    if (!line.trim()) continue;

    if (/^\s*[-*]\s+/.test(line)) {
      const tokens = extractBacktickTokens(line);
      for (const tok of tokens) {
        if (!/^n\/a$/i.test(tok) && !/^none$/i.test(tok)) {
          out.push(tok);
        }
      }
    }
  }

  return [...new Set(out)];
}

export function parseSliceContract(
  markdown: string,
  opts: { title?: string; labels?: string[] } = {}
): ParsedSliceContract {
  const labels = (opts.labels ?? []).map((l) => l.toLowerCase());
  // The archived report is evidence, not part of the executable contract.
  markdown = markdown.split(/^<details><summary>Original Issue \/ Crash Report<\/summary>/m, 1)[0];
  const handoff = markdown.match(/^## Scaffold Handoff[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]|$(?![\s\S]))/m);
  const isScaffold = /^[ \t]*(?:[-*][ \t]+)?\*\*Work Type:\*\*[ \t]*(?:`scaffold`|scaffold)[ \t]*\r?$/im.test(markdown);

  const h1Match = markdown.match(/^#\s+(.+)$/m);
  const title = (opts.title || h1Match?.[1] || 'Untitled Slice').trim();

  const sliceIdMatch =
    markdown.match(/\*\*Slice ID:\*\*\s*`?([A-Za-z0-9_-]+)`?/i) ||
    title.match(/\[(SL-[A-Z0-9-]+)\]/i);
  const sliceId = sliceIdMatch?.[1] ?? '';

  const phaseMatch =
    markdown.match(/\*\*Phase:\*\*\s*`?(L[0-3])`?/i) ||
    sliceId.match(/SL-(L[0-3])-/i);
  let phase = (phaseMatch?.[1]?.toUpperCase() ?? '') as ParsedSliceContract['phase'];
  if (!phase) {
    for (const p of ['l0', 'l1', 'l2', 'l3'] as const) {
      if (labels.includes(`phase:${p}`)) {
        phase = p.toUpperCase() as ParsedSliceContract['phase'];
      }
    }
  }

  const riskMatch = markdown.match(/\*\*Risk Tier:\*\*\s*`?(strict|standard)`?/i);
  let riskTier: 'strict' | 'standard' =
    riskMatch?.[1]?.toLowerCase() === 'strict' ? 'strict' : 'standard';
  if (labels.includes('risk:strict')) riskTier = 'strict';

  const ownedPaths = extractSectionBulletPaths(
    markdown,
    /\*\*Owned\s*\/?\s*Allowed Paths:\*\*|##\s*Owned\s*\/?\s*Allowed Paths/i
  );
  const forbiddenPaths = extractSectionBulletPaths(
    markdown,
    /\*\*Forbidden Shared Files[^:]*:\*\*|##\s*Forbidden Shared Files/i
  );

  // If a slice owns a package manifest and the matching lockfile is NOT explicitly forbidden,
  // auto-allow the root lockfile so frozen-lockfile CI installs never block valid package additions.
  const manifestLockMap: [RegExp, string[]][] = [
    [/(^|\/)package\.json$/, ['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']],
    [/(^|\/)Cargo\.toml$/, ['Cargo.lock']],
    [/(^|\/)pyproject\.toml$/, ['uv.lock', 'poetry.lock']],
    [/(^|\/)go\.mod$/, ['go.sum']],
  ];
  for (const [manifestRe, lockfiles] of manifestLockMap) {
    if (ownedPaths.some((p) => manifestRe.test(p))) {
      for (const lockfile of lockfiles) {
        const isForbidden = forbiddenPaths.some((fp) => matchPathPattern(lockfile, fp));
        if (!isForbidden && !ownedPaths.includes(lockfile)) {
          ownedPaths.push(lockfile);
        }
      }
    }
  }

  const blockedBy = extractBlockedBy(markdown);

  const verifyMatch =
    markdown.match(/\*\*Verification Command:\*\*[^\S\r\n]*`([^`\r\n]+)`/i) ||
    markdown.match(/\*\*Verification Command:\*\*[^\S\r\n]*(.+)$/im);
  const verificationCommand = (verifyMatch?.[1] ?? '').trim();

  const archetypeMatch = markdown.match(/\*\*Archetype Reference:\*\*\s*(.+)$/im);
  const archetypeRef = (archetypeMatch?.[1] ?? '').trim();

  // Detect UI contract from Required UI States section
  const uiStates: string[] = [];
  const uiSectionMatch = markdown.match(
    /\*\*Required UI States:\*\*([\s\S]*?)(?:\n#{1,6}\s|\n\*\*|$)/i
  );
  if (uiSectionMatch) {
    for (const line of uiSectionMatch[1].split(/\r?\n/)) {
      const m = line.match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/);
      if (m) {
        const val = m[1].trim();
        if (val && !/^n\/a$/i.test(val)) uiStates.push(val);
      }
    }
  }
  const hasUi =
    uiStates.length > 0 ||
    labels.includes('area:ui') ||
    labels.includes('ui') ||
    ownedPaths.some(isRenderedUiFile);

  return {
    title,
    sliceId,
    phase,
    riskTier,
    scaffoldHandoff: isScaffold || handoff ? handoff?.[1].trim() ?? '' : null,
    ownedPaths,
    forbiddenPaths,
    blockedBy: [...new Set(blockedBy)],
    verificationCommand,
    archetypeRef,
    hasUi,
    uiStates,
  };
}

// Existing contracts can omit the command when the repository declares a script
// and identifies the executable that runs it.
function repoVerificationCommand(cwd: string): string {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return '';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.ci?.trim() ? 'ci' : pkg.scripts?.test?.trim() ? 'test' : '';
    if (!script) return '';

    const lockfiles = {
      bun: ['bun.lock', 'bun.lockb'],
      npm: ['package-lock.json', 'npm-shrinkwrap.json'],
      pnpm: ['pnpm-lock.yaml'],
      yarn: ['yarn.lock'],
    };
    const managers = Object.keys(lockfiles) as (keyof typeof lockfiles)[];
    const declared = pkg.packageManager?.split('@')[0];
    if (declared) return managers.some((manager) => manager === declared) ? `${declared} run ${script}` : '';

    const detected = managers.filter((manager) =>
      lockfiles[manager].some((file) => existsSync(join(cwd, file)))
    );
    return detected.length === 1 ? `${detected[0]} run ${script}` : '';
  } catch {
    return '';
  }
}

export function validateSliceContract(
  parsed: ParsedSliceContract,
  opts: { cwd?: string } = {}
): { ok: boolean; errors: string[]; verificationCommand: string } {
  const errors: string[] = [];
  if (parsed.ownedPaths.length === 0) {
    errors.push('Missing Owned / Allowed Paths (required for fail-closed boundary isolation)');
  }
  const verificationCommand = parsed.verificationCommand || repoVerificationCommand(opts.cwd ?? process.cwd());
  if (!verificationCommand) {
    errors.push('Missing Verification Command. Specify the repository’s exact verification command.');
  }
  if (parsed.scaffoldHandoff !== null) {
    const requiredFields = ['Official Sources', 'Setup Sequence', 'Integration Checks'];
    for (const field of requiredFields) {
      const value = parsed.scaffoldHandoff.match(new RegExp(`^[-*] +\\*\\*${field}:\\*\\*[ \\t]*(\\S[^\\r\\n]*)`, 'im'))?.[1].trim();
      const missing = !value || /^(?:n\/a|none|tbd|todo|pending|<[^>]+>)\.?$/i.test(value.replace(/^`(.*)`$/, '$1').trim());
      if (missing || (field === 'Official Sources' && !/https?:\/\/[^\s)>]+/i.test(value))) {
        errors.push(`Scaffold Handoff requires ${field} on a labeled bullet.`);
      }
    }
    if (!parsed.verificationCommand && verificationCommand) {
      errors.push('A scaffold contract must declare its clean-checkout Verification Command explicitly.');
    }
  }
  return { ok: errors.length === 0, errors, verificationCommand };
}

export function hasTrackedOwnedFiles(ownedPaths: string[], cwd = process.cwd()): boolean {
  const tracked = runCmd(['git', 'ls-files', '-z'], { cwd, allowFail: true });
  return tracked.code === 0 && tracked.stdout.split('\0').some((file) =>
    file && ownedPaths.some((path) => matchPathPattern(file, path))
  );
}
