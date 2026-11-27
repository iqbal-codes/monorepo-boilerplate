import { describe, expect, test } from 'bun:test';
import {
  extractBlockingFindings,
  extractMechanicalFailureSummary,
  extractUxBlockingFindings,
  extractVerificationEvidenceLine,
  pairEvidenceImages,
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
      '## Out-of-Bounds Files Outside Reserved Folders (P0)',
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

  test('pairEvidenceImages pairs matching viewports instead of alphabetical index', () => {
    const before = [
      { name: 'before-customers-desktop.png', url: 'https://example.com/b-desk.png' },
      { name: 'before-customers-mobile-320.png', url: 'https://example.com/b-mob.png' },
    ];
    const impl = [
      { name: 'impl-desktop.png', url: 'https://example.com/i-desk.png' },
      { name: 'impl-dialog.png', url: 'https://example.com/i-dlg.png' },
      { name: 'impl-error.png', url: 'https://example.com/i-err.png' },
      { name: 'impl-mobile.png', url: 'https://example.com/i-mob.png' },
    ];

    const rows = pairEvidenceImages(before, impl);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      view: 'Desktop · Customers',
      before: { name: 'before-customers-desktop.png' },
      after: { name: 'impl-desktop.png' },
    });
    expect(rows[1]).toMatchObject({
      view: 'Mobile (320px) · Customers',
      before: { name: 'before-customers-mobile-320.png' },
      after: { name: 'impl-mobile.png' },
    });
    expect(rows[2]).toEqual({
      view: 'Dialog',
      after: { name: 'impl-dialog.png', url: 'https://example.com/i-dlg.png' },
    });
    expect(rows[3]).toEqual({
      view: 'Error',
      after: { name: 'impl-error.png', url: 'https://example.com/i-err.png' },
    });
  });

  test('pairEvidenceImages never pairs mobile Before with desktop or untagged After', () => {
    const before = [
      { name: 'before-customers-mobile-320.png', url: 'https://example.com/b-mob.png' },
    ];
    const after = [
      { name: 'after-desktop-menu.png', url: 'https://example.com/a-desk.png' },
      { name: 'after-dialog.png', url: 'https://example.com/a-dlg.png' },
    ];

    const rows = pairEvidenceImages(before, after);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      view: 'Mobile (320px) · Customers',
      before: { name: 'before-customers-mobile-320.png', url: 'https://example.com/b-mob.png' },
    });
    expect(rows[1]?.before).toBeUndefined();
    expect(rows[2]?.before).toBeUndefined();
  });
});
