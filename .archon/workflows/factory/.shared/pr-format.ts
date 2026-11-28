/**
 * Pure formatting helpers separating full agent artifacts ($ARTIFACTS_DIR) from
 * concise, decision-ready GitHub PR bodies (/pr style) and actionable PR comments.
 */

export interface ParsedPrSummary {
  summary: string;
  evidence: string;
  mergeDanger: string;
}

/**
 * Extracts `## Summary`, optional `## Evidence`, and `## Merge Danger` from
 * `$ARTIFACTS_DIR/pr-summary.md` written by the implementer following the `/pr` structure.
 */
export function parsePrSummarySections(markdown: string): ParsedPrSummary {
  const clean = markdown.trim();
  if (!clean) return { summary: '', evidence: '', mergeDanger: '' };

  const extractSection = (headingRe: RegExp): string => {
    const lines = clean.split(/\r?\n/);
    let capturing = false;
    const buf: string[] = [];
    for (const line of lines) {
      if (/^##\s+/.test(line)) {
        if (capturing) break;
        if (headingRe.test(line)) {
          capturing = true;
          continue;
        }
      } else if (capturing) {
        buf.push(line);
      }
    }
    return buf.join('\n').trim();
  };

  const summary = extractSection(/^##\s+Summary\b/i);
  const evidence = extractSection(/^##\s+Evidence\b/i);
  const mergeDanger = extractSection(/^##\s+Merge\s+Danger\b/i);
  return { summary, evidence, mergeDanger };
}

/**
 * Extracts only `[P0]` and `[P1]` blocking findings from an independent review file
 * without truncating mid-sentence, skipping `[P2]`/`[P3]` notes and LGTM boilerplate.
 */
export function extractBlockingFindings(reviewMarkdown: string, maxChars = 14000): string {
  const raw = reviewMarkdown.trim();
  if (!raw || /^\[\s*✅\s*LGTM\s*\]/im.test(raw)) return '';

  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let inBlocker = false;

  for (const line of lines) {
    const hasTag = line.match(/\[(P[0-3])\]/i);
    if (hasTag) {
      const level = hasTag[1].toUpperCase();
      inBlocker = level === 'P0' || level === 'P1';
      if (inBlocker) kept.push(line);
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      if (/verified clean|examined clean|non-blocking|notes|test case|prior round|checklist/i.test(line)) {
        inBlocker = false;
      }
      continue;
    }

    if (inBlocker) {
      if (/^\s*(?:[-*]|\d+\.)\s+(?:\*\*|`)*TC-(?:R\d+-)?[A-Z0-9-]+/i.test(line)) continue;
      kept.push(line);
    }
  }

  const out = kept.join('\n').trim();
  if (out) {
    if (out.length <= maxChars) return out;
    const clipped = out.slice(0, maxChars);
    const lastNl = clipped.lastIndexOf('\n');
    return `${lastNl > 0 ? clipped.slice(0, lastNl) : clipped}\n\n_(Remaining items omitted for GitHub size; see \`$ARTIFACTS_DIR/review/\`.)_`;
  }

  // Fallback when reviewer omitted explicit [P0]/[P1] tags on a non-LGTM report:
  // strip Test Case Results, Prior Round Checklist, and Verified Clean to avoid duplicating ledger rows.
  const fallbackLines: string[] = [];
  let skippingSection = false;
  for (const line of lines) {
    if (/^#\s+/.test(line)) continue;
    if (/^#{2,3}\s+/.test(line)) {
      skippingSection = /verified clean|examined clean|non-blocking|notes|test case|prior round|checklist/i.test(line);
      if (!skippingSection) fallbackLines.push(line);
      continue;
    }
    if (skippingSection) continue;
    if (/^\s*(?:[-*]|\d+\.)\s+(?:\*\*|`)*TC-(?:R\d+-)?[A-Z0-9-]+/i.test(line)) continue;
    fallbackLines.push(line);
  }
  const stripped = fallbackLines.join('\n').trim();
  if (stripped.length <= maxChars) return stripped;
  const clipped = stripped.slice(0, maxChars);
  const lastNl = clipped.lastIndexOf('\n');
  return lastNl > 0 ? clipped.slice(0, lastNl) : clipped;
}

/**
 * Summarizes failed Mechanical Gate sections: boundary violations + last N lines of check output.
 */
export function extractMechanicalFailureSummary(mechMarkdown: string, tailLines = 15): string {
  const raw = mechMarkdown.trim();
  if (!raw) return '';

  const lines = raw.split(/\r?\n/);
  const parts: string[] = [];
  let section: 'none' | 'boundary' | 'verify' = 'none';
  const verifyLines: string[] = [];

  for (const line of lines) {
    if (/^##\s+(Forbidden Paths|Out-of-Bounds Files)/i.test(line)) {
      section = 'boundary';
      parts.push(line);
      continue;
    }
    if (/^##\s+Verification Output/i.test(line)) {
      section = 'verify';
      continue;
    }
    if (/^##\s+/.test(line)) {
      section = 'none';
      continue;
    }

    if (section === 'boundary') {
      parts.push(line);
    } else if (section === 'verify' && !/^```/.test(line.trim())) {
      verifyLines.push(line);
    }
  }

  const cleanTail = verifyLines.filter((l) => l.trim().length > 0).slice(-tailLines);
  if (cleanTail.length > 0) {
    parts.push('**Verification Failure (tail):**', '```text', ...cleanTail, '```');
  }

  return parts.join('\n').trim();
}

/**
 * Extracts blocking UX findings from `ux-report.md` without dumping passing inventories.
 */
export function extractUxBlockingFindings(uxMarkdown: string): string {
  const raw = uxMarkdown.trim();
  if (!raw) return '';

  const lines = raw.split(/\r?\n/);
  const blockingLines: string[] = [];
  let inDefects = false;
  let inSkippedSection = false;
  const isTcLine = (l: string) => /^\s*(?:[-*]|\d+\.)\s+(?:\*\*|`)*TC-(?:R\d+-)?[A-Z0-9-]+/i.test(l);

  for (const line of lines) {
    if (/^#{1,3}\s+.*(defect|finding|blocking|error)/i.test(line)) {
      inDefects = true;
      inSkippedSection = false;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      inDefects = false;
      inSkippedSection = /test case|prior round|checklist|screenshot|inventory|verified clean/i.test(line);
      continue;
    }
    if (inSkippedSection || isTcLine(line)) continue;
    if (inDefects && !/non-blocking/i.test(line)) {
      if (line.trim()) blockingLines.push(line);
    } else if (/blocking|FAIL/i.test(line) && /^\s*[-*]/.test(line)) {
      blockingLines.push(line);
    }
  }

  if (blockingLines.length > 0) return blockingLines.join('\n').trim();
  if (/^#{1,3}\s+.*test case/im.test(raw)) return '';
  return raw.split(/\r?\n/).slice(0, 12).join('\n').trim();
}

/**
 * Pulls a single verification command status line from `mechanical-gate.md` for `## Evidence`.
 */
export function extractVerificationEvidenceLine(mechMarkdown: string): string {
  const match = mechMarkdown.match(/^\s*-\s*\*\*Verification Command:\*\*\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

export interface EvidenceImage {
  name: string;
  url: string;
  /** Optional human-readable label from an evidence manifest. */
  label?: string;
  /** Optional explicit Before/After pair key from an evidence manifest. */
  pairKey?: string;
}

export interface EvidenceManifestEntry {
  label?: string;
  pairKey?: string;
}

export interface EvidenceComparisonRow {
  view: string;
  before: EvidenceImage;
  after: EvidenceImage;
}

export interface EvidenceSingleRow {
  view: string;
  image: EvidenceImage;
}

export interface PartitionedEvidence {
  comparisons: EvidenceComparisonRow[];
  afterOnly: EvidenceSingleRow[];
  beforeOnly: EvidenceSingleRow[];
}

export interface EvidenceRow {
  view: string;
  before?: EvidenceImage;
  after?: EvidenceImage;
}

type ViewportKind = 'desktop' | 'mobile' | 'tablet' | 'none';

interface ParsedEvidenceName {
  rawSlug: string;
  pairKey: string;
  viewport: ViewportKind;
  widthHint: string;
  stateTokens: string[];
}

const VIEWPORT_TOKEN_MAP = new Map<string, ViewportKind>([
  ['desktop', 'desktop'],
  ['wide', 'desktop'],
  ['1280', 'desktop'],
  ['1440', 'desktop'],
  ['lg', 'desktop'],
  ['mobile', 'mobile'],
  ['narrow', 'mobile'],
  ['phone', 'mobile'],
  ['320', 'mobile'],
  ['375', 'mobile'],
  ['390', 'mobile'],
  ['sm', 'mobile'],
  ['tablet', 'tablet'],
  ['768', 'tablet'],
  ['md', 'tablet'],
]);

/**
 * Tokens that represent distinct interactive/UI states rather than a generic route name.
 * Prevents pairing a generic baseline (e.g. `before-fields-desktop.png`) with an unrelated
 * state capture (e.g. `impl-desktop-error.png`) or vice versa.
 */
const DISTINCT_STATE_TOKENS = new Set([
  'error',
  'errors',
  'invalid',
  'empty',
  'loading',
  'skeleton',
  'disabled',
  'readonly',
  'dialog',
  'modal',
  'drawer',
  'sheet',
  'popover',
  'menu',
  'dropdown',
  'tooltip',
  'toast',
  'banner',
  'wizard',
  'confirm',
  'confirmation',
  'archived',
  'restore',
  'delete',
  'slash',
  'bubble',
  'link',
  'dark',
  'light',
  'focus',
  'hover',
  'open',
  'closed',
  'tab',
  'tabs',
]);

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parses an optional evidence manifest JSON (either an array of `{ file, label?, pairKey? }`
 * or an object map `{ "<filename>": "<label>" | { label?, pairKey? } }`).
 * Never throws on malformed input so PR publishing remains resilient.
 */
export function parseEvidenceManifest(rawJson: string): Map<string, EvidenceManifestEntry> {
  const entries = new Map<string, EvidenceManifestEntry>();
  const trimmed = rawJson.trim();
  if (!trimmed) return entries;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const file = typeof record.file === 'string' ? record.file.trim() : '';
        if (!file) continue;
        const label = typeof record.label === 'string' ? record.label.trim() : undefined;
        const pairKey = typeof record.pairKey === 'string' ? record.pairKey.trim() : undefined;
        entries.set(file.toLowerCase(), {
          ...(label ? { label } : {}),
          ...(pairKey ? { pairKey } : {}),
        });
      }
      return entries;
    }

    if (parsed && typeof parsed === 'object') {
      for (const [file, val] of Object.entries(parsed as Record<string, unknown>)) {
        const cleanFile = file.trim().toLowerCase();
        if (!cleanFile) continue;
        if (typeof val === 'string' && val.trim()) {
          entries.set(cleanFile, { label: val.trim() });
        } else if (val && typeof val === 'object') {
          const record = val as Record<string, unknown>;
          const label = typeof record.label === 'string' ? record.label.trim() : undefined;
          const pairKey = typeof record.pairKey === 'string' ? record.pairKey.trim() : undefined;
          if (label || pairKey) {
            entries.set(cleanFile, {
              ...(label ? { label } : {}),
              ...(pairKey ? { pairKey } : {}),
            });
          }
        }
      }
    }
  } catch {
    return entries;
  }

  return entries;
}

function parseEvidenceName(img: EvidenceImage): ParsedEvidenceName {
  const rawSlug = img.name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^(before|impl|after)[-_]+/i, '')
    .toLowerCase();
  const tokens = rawSlug.split(/[-_\s]+/).filter(Boolean);

  let viewport: ViewportKind = 'none';
  let widthHint = '';
  const stateTokens: string[] = [];

  for (const tok of tokens) {
    const cleanTok = tok.replace(/px$/i, '');
    const vp = VIEWPORT_TOKEN_MAP.get(cleanTok);
    if (vp) {
      if (viewport === 'none') viewport = vp;
      if (/^\d{3,4}$/.test(cleanTok)) widthHint = `${cleanTok}px`;
      continue;
    }
    stateTokens.push(tok);
  }

  return {
    rawSlug,
    pairKey: img.pairKey ? normalizeKey(img.pairKey) : '',
    viewport,
    widthHint,
    stateTokens,
  };
}

function scoreEvidencePair(b: ParsedEvidenceName, a: ParsedEvidenceName): number {
  // 1. Explicit manifest pairKey match always wins
  if (b.pairKey && a.pairKey) {
    return b.pairKey === a.pairKey ? 2000 : -1;
  }

  // 2. Exact slug match (works with or without viewport tokens, e.g. before-header.png <-> after-header.png)
  if (b.rawSlug && b.rawSlug === a.rawSlug) return 1000;

  // Never pair conflicting viewports
  if (b.viewport !== 'none' && a.viewport !== 'none' && b.viewport !== a.viewport) {
    return -1;
  }

  // If only one side declares a viewport, require an exact state-token match
  if (b.viewport !== a.viewport && (b.viewport === 'none' || a.viewport === 'none')) {
    if (b.stateTokens.length === 0 || a.stateTokens.length === 0) return -1;
    const sameStates =
      b.stateTokens.length === a.stateTokens.length &&
      b.stateTokens.every((t) => a.stateTokens.includes(t));
    return sameStates ? 300 : -1;
  }

  // Both sides have state tokens: require strong state overlap (never pair `fields-wizard` with `rich-text`)
  if (b.stateTokens.length > 0 && a.stateTokens.length > 0) {
    const overlap = b.stateTokens.filter((t) => a.stateTokens.includes(t));
    if (overlap.length === 0) return -1;
    const minLen = Math.min(b.stateTokens.length, a.stateTokens.length);
    const maxLen = Math.max(b.stateTokens.length, a.stateTokens.length);
    // All tokens of the shorter set must match, and difference can be at most 1 non-distinct token
    if (overlap.length < minLen || maxLen - overlap.length > 1) return -1;
    const unmatched = [...b.stateTokens, ...a.stateTokens].filter((t) => !overlap.includes(t));
    if (unmatched.some((t) => DISTINCT_STATE_TOKENS.has(t))) return -1;
    const vpBonus = b.viewport !== 'none' && b.viewport === a.viewport ? 100 : 0;
    return 400 + vpBonus + overlap.length * 30 - (maxLen - overlap.length) * 15;
  }

  // Only allow pairing a route-tagged baseline (e.g. `before-customers-desktop.png`) with a generic
  // viewport-only capture (`impl-desktop.png`) when viewport matches and the single token is a route/surface
  // name rather than a distinct interactive sub-state (like `wizard`, `error`, `drawer`, `dialog`).
  if (b.viewport !== 'none' && b.viewport === a.viewport) {
    const tagged = b.stateTokens.length > 0 ? b.stateTokens : a.stateTokens;
    if (tagged.length === 0) return 500;
    if (tagged.length === 1 && !DISTINCT_STATE_TOKENS.has(tagged[0]!)) {
      return 120;
    }
  }

  return -1;
}

function titleToken(tok: string): string {
  if (/^\d+px$/i.test(tok)) return tok.toLowerCase();
  if (/^(ui|ux|api|id|url|html|json|csv|xlsx|kpi|otp|cta)$/i.test(tok)) return tok.toUpperCase();
  return tok.charAt(0).toUpperCase() + tok.slice(1);
}

function formatEvidenceView(before?: EvidenceImage, after?: EvidenceImage): string {
  const explicitLabel = after?.label?.trim() || before?.label?.trim();
  if (explicitLabel) return explicitLabel;

  const primary = parseEvidenceName((after ?? before)!);
  const secondary = before && after ? parseEvidenceName(before) : undefined;
  const viewport = primary.viewport !== 'none' ? primary.viewport : secondary?.viewport ?? 'none';
  const widthHint = primary.widthHint || secondary?.widthHint || '';
  const stateTokens = primary.stateTokens.length > 0 ? primary.stateTokens : secondary?.stateTokens ?? [];

  const stateLabel = stateTokens.map(titleToken).join(' ');
  const vpLabel = viewport !== 'none'
    ? (widthHint ? `${titleToken(viewport)} (${widthHint})` : titleToken(viewport))
    : '';

  if (stateLabel && vpLabel) return `${stateLabel} · ${vpLabel}`;
  return stateLabel || vpLabel || 'Screenshot';
}

/**
 * Separates visual evidence into:
 * - `comparisons`: genuine Before/After pairs matching the same changed surface
 * - `afterOnly`: new surfaces, interactive states, or deliverables with no Before counterpart
 * - `beforeOnly`: unmatched Before baselines (e.g. extra captures from untouched views)
 */
export function partitionEvidenceImages(
  beforeImages: EvidenceImage[],
  afterImages: EvidenceImage[]
): PartitionedEvidence {
  const beforeMeta = beforeImages.map((img) => parseEvidenceName(img));
  const afterMeta = afterImages.map((img) => parseEvidenceName(img));

  const candidates: Array<{ bIdx: number; aIdx: number; score: number }> = [];
  for (let bIdx = 0; bIdx < beforeMeta.length; bIdx++) {
    for (let aIdx = 0; aIdx < afterMeta.length; aIdx++) {
      const score = scoreEvidencePair(beforeMeta[bIdx]!, afterMeta[aIdx]!);
      if (score > 0) {
        candidates.push({ bIdx, aIdx, score });
      }
    }
  }

  candidates.sort((x, y) => y.score - x.score || x.bIdx - y.bIdx || x.aIdx - y.aIdx);

  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();
  const paired: Array<{ bIdx: number; aIdx: number }> = [];

  for (const c of candidates) {
    if (usedBefore.has(c.bIdx) || usedAfter.has(c.aIdx)) continue;
    usedBefore.add(c.bIdx);
    usedAfter.add(c.aIdx);
    paired.push({ bIdx: c.bIdx, aIdx: c.aIdx });
  }

  paired.sort((x, y) => x.bIdx - y.bIdx || x.aIdx - y.aIdx);

  const comparisons: EvidenceComparisonRow[] = paired.map(({ bIdx, aIdx }) => {
    const before = beforeImages[bIdx]!;
    const after = afterImages[aIdx]!;
    return { view: formatEvidenceView(before, after), before, after };
  });

  const beforeOnly: EvidenceSingleRow[] = [];
  for (let bIdx = 0; bIdx < beforeImages.length; bIdx++) {
    if (usedBefore.has(bIdx)) continue;
    const before = beforeImages[bIdx]!;
    beforeOnly.push({ view: formatEvidenceView(before, undefined), image: before });
  }

  const afterOnly: EvidenceSingleRow[] = [];
  for (let aIdx = 0; aIdx < afterImages.length; aIdx++) {
    if (usedAfter.has(aIdx)) continue;
    const after = afterImages[aIdx]!;
    afterOnly.push({ view: formatEvidenceView(undefined, after), image: after });
  }

  return { comparisons, afterOnly, beforeOnly };
}

/**
 * Legacy flattened view over `partitionEvidenceImages`.
 */
export function pairEvidenceImages(
  beforeImages: EvidenceImage[],
  afterImages: EvidenceImage[]
): EvidenceRow[] {
  const { comparisons, beforeOnly, afterOnly } = partitionEvidenceImages(beforeImages, afterImages);
  return [
    ...comparisons.map((c) => ({ view: c.view, before: c.before, after: c.after })),
    ...beforeOnly.map((b) => ({ view: b.view, before: b.image })),
    ...afterOnly.map((a) => ({ view: a.view, after: a.image })),
  ];
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderImageCell(img: EvidenceImage): string {
  return `![${img.name}](${img.url})<br/><sub>${img.name}</sub>`;
}

export interface RenderEvidenceOptions {
  before: EvidenceImage[];
  after: EvidenceImage[];
  afterLabel: string;
  /** Concise `/pr`-style execution/behavioral evidence (BE, API, DB, tests, CLI, perf). */
  executionEvidence?: string;
  beforeSummary?: string;
  fallbackAfterLine?: string;
}

/**
 * Renders `## Evidence` cleanly based on what actually changed:
 * - Visual changes: true Before/After pairs render side by side with zero `—` cells,
 *   new surfaces/states render in a focused After table, and unmatched Before captures collapse.
 * - Non-UI / BE / full-stack changes: includes concise `/pr`-style execution/behavioral evidence
 *   (Before -> After behavior, API/DB diffs, exact test/check results) as primary evidence when
 *   there are no screenshots, or paired under `### Execution & Behavioral Evidence` alongside visuals.
 */
export function renderEvidenceMarkdown(options: RenderEvidenceOptions): string[] {
  const {
    before,
    after,
    afterLabel,
    executionEvidence = '',
    beforeSummary = '',
    fallbackAfterLine = '',
  } = options;
  const cleanExecution = executionEvidence.trim();
  const lines: string[] = ['## Evidence'];

  if (before.length === 0 && after.length === 0) {
    if (cleanExecution) {
      lines.push('', cleanExecution, '');
      return lines;
    }
    if (beforeSummary) lines.push(`- **Before:** ${beforeSummary}`);
    if (fallbackAfterLine) lines.push(`- **After:** ${fallbackAfterLine}`);
    lines.push('');
    return lines;
  }

  const { comparisons, afterOnly, beforeOnly } = partitionEvidenceImages(before, after);

  if (comparisons.length === 0 && before.length === 0 && beforeSummary) {
    lines.push(`- **Before:** _${beforeSummary}_`, '');
  }

  if (comparisons.length > 0) {
    if (afterOnly.length > 0 || cleanExecution) {
      lines.push('', '### Before / After');
    }
    lines.push('', `| Surface | Before | ${afterLabel} |`, '| :--- | :---: | :---: |');
    for (const row of comparisons) {
      lines.push(
        `| **${escapeTableCell(row.view)}** | ${renderImageCell(row.before)} | ${renderImageCell(row.after)} |`
      );
    }
    lines.push('');
  }

  if (afterOnly.length > 0) {
    if (comparisons.length > 0 || cleanExecution) {
      lines.push(
        comparisons.length > 0
          ? `### Additional States — ${afterLabel}`
          : `### Visual Evidence — ${afterLabel}`
      );
    }
    lines.push('', `| State | ${afterLabel} |`, '| :--- | :---: |');
    for (const row of afterOnly) {
      lines.push(`| **${escapeTableCell(row.view)}** | ${renderImageCell(row.image)} |`);
    }
    lines.push('');
  }

  if (beforeOnly.length > 0) {
    if (comparisons.length > 0 || afterOnly.length > 0) {
      lines.push(
        `<details><summary>Unmatched Before Captures (${beforeOnly.length})</summary>`,
        '',
        '| Surface | Before |',
        '| :--- | :---: |'
      );
      for (const row of beforeOnly) {
        lines.push(`| **${escapeTableCell(row.view)}** | ${renderImageCell(row.image)} |`);
      }
      lines.push('', '</details>', '');
    } else {
      lines.push('| Surface | Before |', '| :--- | :---: |');
      for (const row of beforeOnly) {
        lines.push(`| **${escapeTableCell(row.view)}** | ${renderImageCell(row.image)} |`);
      }
      lines.push('');
    }
  }

  if (cleanExecution) {
    lines.push('### Execution & Behavioral Evidence', '', cleanExecution, '');
  }

  return lines;
}
