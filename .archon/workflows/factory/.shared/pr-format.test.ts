import { describe, expect, test } from 'bun:test';
import {
  extractBlockingFindings,
  extractMechanicalFailureSummary,
  extractUxBlockingFindings,
  extractVerificationEvidenceLine,
  pairEvidenceImages,
  parseEvidenceManifest,
  parsePrSummarySections,
  partitionEvidenceImages,
  renderEvidenceMarkdown,
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

  test('pairEvidenceImages pairs matching viewports and route slugs instead of alphabetical index', () => {
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
      view: 'Customers · Desktop',
      before: { name: 'before-customers-desktop.png' },
      after: { name: 'impl-desktop.png' },
    });
    expect(rows[1]).toMatchObject({
      view: 'Customers · Mobile (320px)',
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

  test('pairEvidenceImages never pairs mobile Before with desktop or untagged After, nor distinct states', () => {
    const before = [
      { name: 'before-customers-mobile-320.png', url: 'https://example.com/b-mob.png' },
      { name: 'before-fields-wizard-desktop.png', url: 'https://example.com/b-wiz.png' },
    ];
    const after = [
      { name: 'after-desktop-menu.png', url: 'https://example.com/a-desk.png' },
      { name: 'after-dialog.png', url: 'https://example.com/a-dlg.png' },
      { name: 'after-desktop.png', url: 'https://example.com/a-generic.png' },
    ];

    const { comparisons, beforeOnly, afterOnly } = partitionEvidenceImages(before, after);
    expect(comparisons).toHaveLength(0);
    expect(beforeOnly.map((b) => b.image.name)).toEqual([
      'before-customers-mobile-320.png',
      'before-fields-wizard-desktop.png',
    ]);
    expect(afterOnly.map((a) => a.image.name)).toEqual([
      'after-desktop-menu.png',
      'after-dialog.png',
      'after-desktop.png',
    ]);
  });

  test('partitionEvidenceImages pairs non-viewport slugs and manifest pairKeys cleanly', () => {
    const manifest = parseEvidenceManifest(
      JSON.stringify([
        { file: 'before-status-badges.png', label: 'Status Badges (Neutral/Warning/Danger)' },
        { file: 'after-status-badges.png', label: 'Status Badges (OKLCH Semantic Tokens)' },
        { file: 'before-old-header.png', pairKey: 'detail-header' },
        { file: 'after-new-header.png', pairKey: 'detail-header', label: 'Detail Identity Header' },
      ])
    );

    const applyMeta = (name: string) => ({
      name,
      url: `https://example.com/${name}`,
      ...manifest.get(name.toLowerCase()),
    });

    const { comparisons, afterOnly, beforeOnly } = partitionEvidenceImages(
      [applyMeta('before-status-badges.png'), applyMeta('before-old-header.png')],
      [
        applyMeta('after-status-badges.png'),
        applyMeta('after-new-header.png'),
        applyMeta('after-slash-command-menu.png'),
      ]
    );

    expect(comparisons).toHaveLength(2);
    expect(comparisons[0]?.view).toBe('Status Badges (OKLCH Semantic Tokens)');
    expect(comparisons[1]?.view).toBe('Detail Identity Header');
    expect(afterOnly).toHaveLength(1);
    expect(afterOnly[0]?.view).toBe('Slash Command Menu');
    expect(beforeOnly).toHaveLength(0);
  });

  test('renderEvidenceMarkdown separates After-only states from Before/After comparisons without empty cells', () => {
    const additiveMd = renderEvidenceMarkdown({
      before: [],
      after: [
        { name: 'impl-rich-text-populated.png', url: 'https://example.com/1.png' },
        { name: 'impl-slash-menu.png', url: 'https://example.com/2.png' },
        { name: 'impl-toolbar-320.png', url: 'https://example.com/3.png' },
      ],
      afterLabel: 'After (Implementer)',
      beforeSummary: 'Additive UI change — no existing UI surface modified.',
    }).join('\n');

    expect(additiveMd).toContain('| State | After (Implementer) |');
    expect(additiveMd).not.toContain('| Surface | Before |');
    expect(additiveMd).not.toContain('| — |');
    expect(additiveMd).toContain('**Toolbar · Mobile (320px)**');

    const mixedMd = renderEvidenceMarkdown({
      before: [
        { name: 'before-customer-detail-desktop.png', url: 'https://example.com/bd.png' },
        { name: 'before-untouched-wizard-desktop.png', url: 'https://example.com/bw.png' },
      ],
      after: [
        { name: 'after-customer-detail-desktop.png', url: 'https://example.com/ad.png' },
        { name: 'after-delete-dialog.png', url: 'https://example.com/add.png' },
      ],
      afterLabel: 'After (QA)',
    }).join('\n');

    expect(mixedMd).toContain('### Before / After');
    expect(mixedMd).toContain('| **Customer Detail · Desktop** |');
    expect(mixedMd).toContain('### Additional States — After (QA)');
    expect(mixedMd).toContain('| **Delete Dialog** |');
    expect(mixedMd).toContain('<details><summary>Unmatched Before Captures (1)</summary>');
    expect(mixedMd).not.toContain('| — |');
  });
});
