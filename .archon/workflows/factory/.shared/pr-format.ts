/**
 * Pure formatting helpers separating full agent artifacts ($ARTIFACTS_DIR) from
 * concise, decision-ready GitHub PR bodies (/pr style) and actionable PR comments.
 */

export interface ParsedPrSummary {
  summary: string;
  mergeDanger: string;
}

/**
 * Extracts `## Summary` and `## Merge Danger` from `$ARTIFACTS_DIR/pr-summary.md`
 * written by the implementer following the `/pr` structure.
 */
export function parsePrSummarySections(markdown: string): ParsedPrSummary {
  const clean = markdown.trim();
  if (!clean) return { summary: '', mergeDanger: '' };

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
  const mergeDanger = extractSection(/^##\s+Merge\s+Danger\b/i);
  return { summary, mergeDanger };
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
      if (/verified clean|examined clean|non-blocking|notes/i.test(line)) {
        inBlocker = false;
      }
      continue;
    }

    if (inBlocker) {
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

  // Fallback when reviewer omitted explicit [P0]/[P1] tags on a non-LGTM report
  const stripped = raw
    .replace(/^#\s+[^\n]*\n+/m, '')
    .trim();
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

  for (const line of lines) {
    if (/^#{1,3}\s+.*(defect|finding|blocking|error)/i.test(line)) {
      inDefects = true;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      inDefects = false;
      continue;
    }
    if (inDefects && !/non-blocking/i.test(line)) {
      if (line.trim()) blockingLines.push(line);
    } else if (/blocking|FAIL/i.test(line) && /^\s*[-*]/.test(line)) {
      blockingLines.push(line);
    }
  }

  return blockingLines.join('\n').trim() || raw.split(/\r?\n/).slice(0, 12).join('\n').trim();
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
}

export interface EvidenceRow {
  view: string;
  before?: EvidenceImage;
  after?: EvidenceImage;
}

type ViewportKind = 'desktop' | 'mobile' | 'tablet' | 'none';

interface ParsedEvidenceName {
  rawSlug: string;
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

function parseEvidenceName(fileName: string): ParsedEvidenceName {
  const rawSlug = fileName
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

  return { rawSlug, viewport, widthHint, stateTokens };
}

function scoreEvidencePair(b: ParsedEvidenceName, a: ParsedEvidenceName): number {
  if (b.rawSlug && b.rawSlug === a.rawSlug) return 1000;

  if (b.viewport !== 'none' && a.viewport !== 'none' && b.viewport !== a.viewport) {
    return -1;
  }
  if (b.viewport !== a.viewport && (b.viewport === 'none' || a.viewport === 'none')) {
    const overlap = b.stateTokens.filter((t) => a.stateTokens.includes(t));
    if (overlap.length === 0) return -1;
  }

  let score = 0;
  if (b.viewport !== 'none' && b.viewport === a.viewport) {
    score += 100;
    if (a.stateTokens.length === 0) score += 20;
    if (a.stateTokens.includes('default') || a.stateTokens.includes('idle')) score += 15;
  }

  const overlap = b.stateTokens.filter((t) => a.stateTokens.includes(t)).length;
  score += overlap * 30;

  if (score === 0) return -1;
  score -= Math.abs(b.stateTokens.length - a.stateTokens.length) * 5;
  return score;
}

function titleToken(tok: string): string {
  if (/^\d+px$/i.test(tok)) return tok.toLowerCase();
  return tok.charAt(0).toUpperCase() + tok.slice(1);
}

function formatEvidenceView(before?: EvidenceImage, after?: EvidenceImage): string {
  const primary = parseEvidenceName((after ?? before)!.name);
  const secondary = before && after ? parseEvidenceName(before.name) : undefined;
  const viewport = primary.viewport !== 'none' ? primary.viewport : secondary?.viewport ?? 'none';
  const widthHint = primary.widthHint || secondary?.widthHint || '';
  const stateTokens = primary.stateTokens.length > 0 ? primary.stateTokens : secondary?.stateTokens ?? [];

  const parts: string[] = [];
  if (viewport !== 'none') {
    const vpLabel = titleToken(viewport);
    parts.push(widthHint ? `${vpLabel} (${widthHint})` : vpLabel);
  }
  if (stateTokens.length > 0) {
    parts.push(stateTokens.map(titleToken).join(' '));
  }
  return parts.join(' · ') || 'Screenshot';
}

/**
 * Pairs Before and After screenshots by viewport/state semantics rather than alphabetical index,
 * preventing mismatched pairs (e.g. mobile Before next to desktop modal After).
 */
export function pairEvidenceImages(
  beforeImages: EvidenceImage[],
  afterImages: EvidenceImage[]
): EvidenceRow[] {
  const beforeMeta = beforeImages.map((img) => parseEvidenceName(img.name));
  const afterMeta = afterImages.map((img) => parseEvidenceName(img.name));

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

  const rows: EvidenceRow[] = paired.map(({ bIdx, aIdx }) => {
    const before = beforeImages[bIdx]!;
    const after = afterImages[aIdx]!;
    return { view: formatEvidenceView(before, after), before, after };
  });

  for (let bIdx = 0; bIdx < beforeImages.length; bIdx++) {
    if (usedBefore.has(bIdx)) continue;
    const before = beforeImages[bIdx]!;
    rows.push({ view: formatEvidenceView(before, undefined), before });
  }

  for (let aIdx = 0; aIdx < afterImages.length; aIdx++) {
    if (usedAfter.has(aIdx)) continue;
    const after = afterImages[aIdx]!;
    rows.push({ view: formatEvidenceView(undefined, after), after });
  }

  return rows;
}
