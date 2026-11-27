import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { KpiCard } from "../src/components/kpi-card";
import { StatusBadge, type StatusBadgeTone } from "../src/components/status-badge";

const GLOBALS_CSS = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");

function extractCssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? "";
}

function parseOklch(cssBlock: string, variableName: string): [number, number, number] {
  const match = cssBlock.match(
    new RegExp(`${variableName}:\\s*oklch\\(([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\)`),
  );
  if (!match) {
    throw new Error(`Missing OKLCH token ${variableName}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function oklchToLinearSrgb(L: number, C: number, H: number): [number, number, number] {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function contrastRatio(c1: [number, number, number], c2: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const [r, g, b] = oklchToLinearSrgb(...c).map((v) => Math.min(1, Math.max(0, v)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const l1 = lum(c1);
  const l2 = lum(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("Semantic OKLCH tokens in globals.css", () => {
  test("defines light and dark WCAG-AA-verified OKLCH token pairs and @theme inline mappings", () => {
    const rootBlock = extractCssBlock(GLOBALS_CSS, ":root");
    const darkBlock = extractCssBlock(GLOBALS_CSS, ".dark");
    const themeBlock = extractCssBlock(GLOBALS_CSS, "@theme inline");

    for (const prefix of ["--info", "--success", "--warning", "--destructive"]) {
      if (prefix !== "--destructive") {
        expect(rootBlock).toContain(`${prefix}: oklch(`);
        expect(darkBlock).toContain(`${prefix}: oklch(`);
        expect(themeBlock).toContain(`--color-${prefix.slice(2)}: var(${prefix});`);
      }
      for (const suffix of ["-foreground", "-subtle", "-subtle-foreground"]) {
        const token = `${prefix}${suffix}`;
        expect(rootBlock).toContain(`${token}: oklch(`);
        expect(darkBlock).toContain(`${token}: oklch(`);
        expect(themeBlock).toContain(`--color-${token.slice(2)}: var(${token});`);
      }
    }

    for (const [mode, block] of [
      ["light", rootBlock],
      ["dark", darkBlock],
    ] as const) {
      const card = parseOklch(block, "--card");
      for (const tone of ["info", "success", "warning", "destructive"] as const) {
        const solid = parseOklch(block, `--${tone}`);
        const solidFg = parseOklch(block, `--${tone}-foreground`);
        const subtle = parseOklch(block, `--${tone}-subtle`);
        const subtleFg = parseOklch(block, `--${tone}-subtle-foreground`);

        expect(
          contrastRatio(solid, solidFg),
          `${mode} --${tone} / --${tone}-foreground contrast`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(subtleFg, subtle),
          `${mode} --${tone}-subtle-foreground / --${tone}-subtle contrast`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(subtleFg, card),
          `${mode} --${tone}-subtle-foreground / --card contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("StatusBadge", () => {
  const tones: StatusBadgeTone[] = ["neutral", "info", "success", "warning", "danger"];

  test("renders all 5 semantic tones with and without decorative status dot", () => {
    for (const tone of tones) {
      const plainHtml = renderToStaticMarkup(<StatusBadge tone={tone}>State {tone}</StatusBadge>);
      expect(plainHtml).toContain('data-slot="status-badge"');
      expect(plainHtml).toContain(`data-tone="${tone}"`);
      expect(plainHtml).toContain(`State ${tone}`);
      expect(plainHtml).not.toContain('data-slot="status-badge-dot"');
      expect(plainHtml).not.toMatch(/emerald-|amber-|sky-|blue-/);

      const dottedHtml = renderToStaticMarkup(
        <StatusBadge tone={tone} dot>
          State {tone}
        </StatusBadge>,
      );
      expect(dottedHtml).toContain('data-slot="status-badge-dot"');
      expect(dottedHtml).toContain('aria-hidden="true"');
    }
  });

  test("supports Base UI render prop composition", () => {
    const html = renderToStaticMarkup(
      <StatusBadge
        tone="info"
        render={(props) => (
          <a href="/status" {...props}>
            {props.children}
          </a>
        )}
      >
        Link status
      </StatusBadge>,
    );
    expect(html).toContain("<a");
    expect(html).toContain('href="/status"');
    expect(html).toContain("Link status");
    expect(html).toContain('data-tone="info"');
  });
});

describe("packages/ui boundary hygiene", () => {
  test("contains zero router, query, auth, or domain imports", () => {
    const uiSrcDir = resolve(import.meta.dir, "../src");
    const forbidden = [
      "@tanstack/react-router",
      "@tanstack/react-query",
      "nuqs",
      "@trpc/",
      "better-auth",
      "@monorepo-boilerplate/api",
      "@monorepo-boilerplate/auth",
      "@monorepo-boilerplate/db",
    ];

    function walk(dir: string): string[] {
      const files: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          files.push(...walk(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
          files.push(full);
        }
      }
      return files;
    }

    for (const file of walk(uiSrcDir)) {
      const src = readFileSync(file, "utf8");
      const specifiers = [...src.matchAll(/(?:from|import)\s*\(?["']([^"']+)["']\)?/g)].map(
        (m) => m[1] ?? "",
      );
      for (const specifier of specifiers) {
        for (const pkg of forbidden) {
          expect(
            specifier === pkg || specifier.startsWith(`${pkg}/`) || specifier.startsWith(pkg),
            `${file} must not import ${specifier}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("KpiCard semantic token alignment", () => {
  test("uses semantic OKLCH token classes instead of hardcoded Tailwind palette hues", () => {
    for (const tone of ["default", "info", "success", "warning", "danger"] as const) {
      const html = renderToStaticMarkup(
        <KpiCard
          label="Metric"
          value="42"
          tone={tone}
          icon={<span>*</span>}
          trend={{ value: 0.15 }}
          progress={{ value: 1, max: 2 }}
          sparkline={[1, 2, 3]}
        />,
      );
      expect(html).not.toMatch(/emerald-|amber-|sky-|blue-/);
    }
  });
});
