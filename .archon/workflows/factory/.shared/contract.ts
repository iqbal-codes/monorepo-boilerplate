/**
 * Shared deterministic helpers for the Archon Factory workflow pack.
 * Pure TypeScript + Bun/Node built-ins only (zero external npm dependencies).
 */

import { X_OK } from 'node:constants';
import { accessSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRenderedUiFile, matchPathPattern } from './boundaries.ts';
import { runCmd } from './exec.ts';

export { auditBoundaries, expandBraces, isRenderedUiFile, matchPathPattern } from './boundaries.ts';
export { appendMissingDocRefsNote, findMissingLocalDocRefs } from './contract-docs.ts';
export { detectBaseBranch, detectGitRepo, emit, runCmd, text } from './exec.ts';

export interface ParsedSliceContract {
  title: string;
  sliceId: string;
  phase: 'L0' | 'L1' | 'L2' | 'L3' | '';
  riskTier: 'strict' | 'standard';
  scaffoldHandoff: string | null;
  workAreas: string[];
  parallelFolders: string[];
  hasAcceptance: boolean;
  forbiddenPaths: string[];
  blockedBy: number[];
  verificationCommand: string;
  archetypeRef: string;
  hasUi: boolean;
  uiStates: string[];
  testCases: Array<{ id: string; description: string }>;
  outOfScope: string[];
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

function extractNamedSectionLines(
  markdown: string,
  sectionNamePattern: RegExp,
  options: { allowBoldItemPrefix?: RegExp } = {}
): string[] {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inSection = false;
  let baseIndent = -1;

  for (const line of lines) {
    if (!inSection) {
      const isHeading = new RegExp(`^#{1,6}\\s+${sectionNamePattern.source}`, 'i').test(line);
      const isLabeled = new RegExp(`^\\s*(?:[-*]\\s+)?\\*\\*${sectionNamePattern.source}[^:]*:\\*\\*`, 'i').test(line);
      if (isHeading || isLabeled) {
        inSection = true;
        baseIndent = isHeading ? -1 : line.search(/\S/);
      }
      continue;
    }

    if (/^#{1,6}\s/.test(line)) break;
    const indent = line.search(/\S/);
    if (indent === -1) continue;

    // For bullet-started sections (baseIndent >= 0), stop on a sibling labeled bullet
    // (e.g. `- **Out of Scope:**`) at or above the header indent, without breaking on bold TC items.
    const isSiblingLabel = /^\s*[-*]\s+\*\*[^*]+:\*\*/.test(line) || /^\s*\*\*[^*]+:\*\*/.test(line);
    const isAllowedBoldItem = options.allowBoldItemPrefix ? options.allowBoldItemPrefix.test(line) : false;
    if (baseIndent >= 0 && isSiblingLabel && !isAllowedBoldItem && indent <= baseIndent) {
      break;
    }

    out.push(line);
  }

  return out;
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

  const workAreas = extractSectionBulletPaths(
    markdown,
    /\*\*Work Areas:\*\*|^##\s+Work Areas\s*$|\*\*Owned\s*\/?\s*Allowed Paths:\*\*|^##\s+Owned\s*\/?\s*Allowed Paths\s*$/i
  );
  const parallelFolders = extractSectionBulletPaths(
    markdown,
    /^\s*(?:[-*]\s+)?\*\*Allowed Folders:\*\*|^##\s+Allowed Folders\s*$/i
  );
  const forbiddenPaths = extractSectionBulletPaths(
    markdown,
    /\*\*Forbidden (?:Paths|Shared Files)[^:]*:\*\*|^##\s+Forbidden (?:Paths|Shared Files)\b/i
  );

  const acceptanceSection = markdown.match(/^##[ \t]+Acceptance Criteria[^\r\n]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]|$(?![\s\S]))/im);
  const hasAcceptance = /^[ \t]*[-*][ \t]+\[[ xX]\][ \t]+\S/m.test(markdown)
    || /^[ \t]*(?:[-*]|\d+\.)[ \t]+(?!\*\*(?:Test Seam\(s\)|Verification Command):)\S/im.test(acceptanceSection?.[1] ?? '');

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
    workAreas.some(isRenderedUiFile);

  const testCases: Array<{ id: string; description: string }> = [];
  const tcLines = extractNamedSectionLines(markdown, /Test Case(?:s| Checklist)\b/, {
    allowBoldItemPrefix: /^\s*(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?(?:\*\*|`)?TC-[A-Z0-9-]+/i,
  });
  if (tcLines.length > 0) {
    let seq = 1;
    for (const line of tcLines) {
      const m = line.match(
        /^\s*(?:[-*]|\d+\.)\s+(?:\[[ xX]\]\s+)?(?:(?:\*\*|`)?(TC-[A-Z0-9-]+):?(?:\*\*|`)?\s*[:\-–—]?\s*)?(.+)$/i
      );
      if (!m) continue;
      const desc = m[2].trim();
      if (!desc || /^<!--/.test(desc) || /^n\/a$/i.test(desc)) continue;
      const id = (m[1] || `TC-${String(seq).padStart(2, '0')}`).toUpperCase();
      testCases.push({ id, description: desc });
      seq++;
    }
  }
  if (testCases.length === 0) {
    let seq = 1;
    for (const state of uiStates) {
      testCases.push({
        id: `TC-${String(seq++).padStart(2, '0')}`,
        description: `[UI] ${state}`,
      });
    }
    const acBlock = acceptanceSection?.[1] ?? markdown;
    for (const line of acBlock.split(/\r?\n/)) {
      const m = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)$/);
      if (!m) continue;
      const desc = m[1].trim();
      if (desc && !/^\*\*/.test(desc)) {
        testCases.push({
          id: `TC-${String(seq++).padStart(2, '0')}`,
          description: `[Acceptance] ${desc}`,
        });
      }
      if (testCases.length >= 12) break;
    }
  }

  const outOfScope: string[] = [];
  const oosLines = extractNamedSectionLines(markdown, /Out of Scope\b/);
  for (const line of oosLines) {
    const m = line.match(/^\s*[-*]\s+(.+)$/);
    if (!m) continue;
    const val = m[1].trim();
    if (val && !/^<!--/.test(val) && !/^n\/a$/i.test(val)) outOfScope.push(val);
  }

  return {
    title,
    sliceId,
    phase,
    riskTier,
    scaffoldHandoff: isScaffold || handoff ? handoff?.[1].trim() ?? '' : null,
    workAreas,
    parallelFolders,
    hasAcceptance,
    forbiddenPaths,
    blockedBy: [...new Set(blockedBy)],
    verificationCommand,
    archetypeRef,
    hasUi,
    uiStates,
    testCases,
    outOfScope,
  };
}

/**
 * Generates the initial `$ARTIFACTS_DIR/qa-testcases.md` ledger used by implementers (TDD)
 * and QA reviewers (Round 1 execution + freeze, Round 2+ regression-only).
 */
export function buildQaTestCasesMarkdown(
  parsed: ParsedSliceContract,
  extraCases: Array<{ id: string; description: string }> = []
): string {
  const escCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
  const baseCases =
    parsed.testCases.length > 0
      ? parsed.testCases
      : [{ id: 'TC-01', description: '[Acceptance] Verify all contract deliverables and invariants pass' }];
  const seen = new Set(baseCases.map((tc) => tc.id.toUpperCase()));
  const mergedCases = [
    ...baseCases,
    ...extraCases.filter((tc) => !seen.has(tc.id.toUpperCase())),
  ];
  const rows = mergedCases.map((tc) => `| \`${tc.id.toUpperCase()}\` | ${escCell(tc.description)} | \`PENDING\` | — |`);
  const oosLines =
    parsed.outOfScope.length > 0
      ? parsed.outOfScope.map((item) => `- ${item}`)
      : ['- Existing baseline behavior outside this slice’s deliverables unless explicitly broken by the diff.'];

  const isStrict = parsed.riskTier === 'strict';
  const freezeLine = isStrict
    ? '- **Freeze State:** `OPEN (Round 1 may add diff-bounded [TC-R1-*] defects; frozen after Round 1)`'
    : '- **Freeze State:** `LOCKED_CONTRACT_ONLY (standard tier — contract TCs only; do not add TC-R1-*)`';

  return [
    `# QA Test-Case Ledger — ${parsed.title}`,
    '',
    `- **Risk Tier:** \`${parsed.riskTier}\``,
    freezeLine,
    '- **Scope Rule:** Only `TC-*` items in this ledger are blocking QA scope. Do NOT fail on items listed under Out of Scope.',
    '',
    '## Contract Test Cases (Baseline)',
    '| ID | Case / Expected Outcome | Status | Notes |',
    '| :--- | :--- | :--- | :--- |',
    ...rows,
    '',
    '## Out of Scope (Do Not Fail On)',
    ...oosLines,
    ...(isStrict
      ? [
          '',
          '## Round 1 Exploratory Cases (Frozen After Round 1)',
          '- _(None yet — Round 1 QA may emit `TC-R1-*` lines only for concrete defects in files/flows touched by the diff.)_',
        ]
      : []),
    '',
  ].join('\n');
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
  if (!parsed.hasAcceptance) {
    errors.push('Missing observable acceptance criteria. Describe the behavior that must be verified.');
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

export function hasTrackedWorkAreas(workAreas: string[], cwd = process.cwd()): boolean {
  if (workAreas.length === 0) return true;
  const tracked = runCmd(['git', 'ls-files', '-z'], { cwd });
  return tracked.stdout.split('\0').some((file) =>
    file && workAreas.some((area) => matchPathPattern(file, area))
  );
}
