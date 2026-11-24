import { describe, expect, test } from 'bun:test';
import {
  extractBlockingFindings,
  extractMechanicalFailureSummary,
  extractUxBlockingFindings,
  extractVerificationEvidenceLine,
  parsePrSummarySections,
} from './pr-format.ts';

describe('PR formatting & review comment extraction', () => {
  test('parsePrSummarySections reads Summary and Merge Danger cleanly', () => {
    const md = [
      '## Summary',
      '',
      '```diff',
      ' <MenuGrid>',
      '+  <QuickAddBadge />',
      '```',
      '',
      '## Merge Danger',
      '',
      '**Door:** Two-way — isolated UI component',
      '**Blast Radius:** UI',
    ].join('\n');

    const parsed = parsePrSummarySections(md);
    expect(parsed.summary).toContain('+  <QuickAddBadge />');
    expect(parsed.mergeDanger).toContain('**Door:** Two-way');
    expect(parsed.mergeDanger).toContain('**Blast Radius:** UI');
  });

  test('extractBlockingFindings keeps full [P0]/[P1] findings and strips [P2]/Verified Clean', () => {
    const longFiller = 'word '.repeat(550);
    const md = [
      '# Spec Review',
      '',
      `- [P0] Missing tenant check in \`orders.ts:42\` — ${longFiller}END_OF_P0`,
      '- [P1] Empty state lacks retry button in `MenuPage.tsx:88`',
      '- [P2] Minor naming suggestion',
      '',
      '## Verified Clean',
      '- Checked routes',
    ].join('\n');

    const extracted = extractBlockingFindings(md);
    expect(extracted).toContain('[P0]');
    expect(extracted).toContain('END_OF_P0');
    expect(extracted).toContain('[P1]');
    expect(extracted).not.toContain('[P2]');
    expect(extracted).not.toContain('Checked routes');
  });

  test('extractBlockingFindings returns empty string for LGTM reports', () => {
    expect(extractBlockingFindings('[✅ LGTM]\n- Verified Clean')).toBe('');
  });

  test('extractMechanicalFailureSummary captures boundary hits and verification tail', () => {
    const md = [
      '# Mechanical Gate Report',
      '',
      '## Out-of-Bounds Files Outside Owned Paths (P0)',
      '- `apps/pos/src/App.tsx`',
      '',
      '## Diff Stat',
      '10 files changed',
      '',
      '## Verification Output (tail)',
      '```text',
      'line 1',
      'error: expected 200 got 500',
      '```',
    ].join('\n');

    const out = extractMechanicalFailureSummary(md, 5);
    expect(out).toContain('apps/pos/src/App.tsx');
    expect(out).toContain('error: expected 200 got 500');
    expect(out).not.toContain('10 files changed');
  });

  test('extractUxBlockingFindings and extractVerificationEvidenceLine work cleanly', () => {
    const ux = [
      '# UX Report',
      '## States',
      '- Populated: PASS',
      '## Blocking Defects',
      '- `after-mobile.png`: Checkout CTA clipped at 320px',
      '## Screenshots',
      '- after-desktop.png',
    ].join('\n');
    expect(extractUxBlockingFindings(ux)).toContain('Checkout CTA clipped at 320px');
    expect(extractUxBlockingFindings(ux)).not.toContain('after-desktop.png');

    const mech = '- **Verification Command:** `bun run ci` -> PASS';
    expect(extractVerificationEvidenceLine(mech)).toBe('`bun run ci` -> PASS');
  });
});
