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
    if (/^##\s+(Forbidden Shared Files|Out-of-Bounds Files)/i.test(line)) {
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
