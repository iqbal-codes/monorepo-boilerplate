import { defineConfig } from "vite-plus";

const IGNORE_PATTERNS = [
  "node_modules/**",
  "**/node_modules/**",
  "apps/web/dist/**",
  "apps/web/.tanstack/**",
  "apps/web/src/routeTree.gen.ts",
  "apps/server/dist/**",
  "packages/db/dist/**",
  ".archon/**",
  ".agents/**",
  ".claude/**",
];

export default defineConfig({
  lint: {
    ignorePatterns: IGNORE_PATTERNS,
    options: {
      typeAware: false,
      typeCheck: false,
    },
    rules: {
      "typescript/no-explicit-any": "error",
      "no-unused-vars": "error",
    },
    overrides: [
      {
        files: ["packages/ui/src/**/*.ts", "packages/ui/src/**/*.tsx"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: ["nuqs", "@tanstack/react-router"],
              patterns: ["@trpc/*"],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    ignorePatterns: IGNORE_PATTERNS,
    singleQuote: false,
    semi: true,
    sortPackageJson: true,
  },
  staged: {
    "*.{js,ts,jsx,tsx,vue,svelte,json,jsonc,css,md}": "vp check --fix",
  },
});
