---
name: ui
description: Route UI work in this repo to existing packages/ui primitives, targeted platform or polish skills, or full interface review. Use when building, editing, styling, or reviewing UI.
---

# UI Router

Start in the repo, then load **only** the narrowest skill branch the task needs. Never load `better-interface` for routine feature edits.

## 1. Local Primitives First

- Reuse existing components in [packages/ui/src/components](../../../packages/ui/src/components) (`list-toolbar.tsx`, `data-table.tsx`, `select.tsx`, `combobox.tsx`, `dialog.tsx`, `drawer.tsx`, `field.tsx`, etc.) and TanStack Form primitives in [packages/ui/src/components/form/fields](../../../packages/ui/src/components/form/fields) (`useAppForm` / `withForm`; see [CODING_STANDARDS.md](../../../CODING_STANDARDS.md)).
- **Base UI (`base-sera`), not Radix:** Use the `render` prop instead of `asChild`. `SelectPrimitive.Trigger` renders a `<button>` — place clear/action controls as siblings outside it. `SelectPrimitive.Value` renders `placeholder` when `value={null}` and `SelectValue` has no children.
- `cn` in `packages/ui` comes from the `cn` package, not `tailwind-merge` — do not rely on `cn` to deduplicate conflicting Tailwind utilities.
- Only if a brand-new upstream shadcn primitive is genuinely missing, run `npx shadcn@latest add <name> -c packages/ui`.

## 2. Route Only What Applies

- **Routine component / TanStack Form / table wiring:** Stay in local `packages/ui` and `apps/web` code; load no external UI skill.
- **Browser, HTML/CSS, or DOM platform behavior** (dialogs/popovers, anchor positioning, tables, dates/timezones, animations/transitions, contrast/dark mode, typography wrapping/alignment, focus/ARIA/a11y, CWV, sanitization): Load `modern-web-guidance` and run focused 2–5 word `search` queries. Skip it for pure TypeScript/form glue.
- **Focused craft or copy** (load only the matching `better-*` skill):
  - Surfaces, radii, borders, shadows, states, icons → `better-ui`
  - Spacing, grouping, alignment, responsive overflow → `better-layout`
  - Labels, microcopy, empty/error states → `better-writing`
- **Full screen audit / UX review:** Load `better-interface` (or `interface-review` for branch/PR diffs) — only when asked to review an interface.

## 3. Verify

Run `vp run check:fast` while iterating, and `vp run check && vp run test` before finishing. Use `.archon/ui-preview.sh` only when runtime browser inspection is needed.
