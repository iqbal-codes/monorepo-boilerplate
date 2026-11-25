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
    plugins: ["jsx-a11y"],
    options: {
      typeAware: false,
      typeCheck: false,
    },
    rules: {
      "typescript/no-explicit-any": "error",
      "no-unused-vars": "error",
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-activedescendant-has-tabindex": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/no-aria-hidden-on-focusable": "error",
      "jsx-a11y/no-distracting-elements": "error",
      "jsx-a11y/no-redundant-roles": "off",
      "jsx-a11y/prefer-tag-over-role": "off",
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/scope": "error",
      "jsx-a11y/tabindex-no-positive": "error",
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
