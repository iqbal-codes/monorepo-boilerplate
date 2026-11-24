# Compose forms via TanStack Form `createFormHook` in `packages/ui`

Forms across every screen are built on one shared `useAppForm` hook created with TanStack Form v1's `createFormHook` in `packages/ui/src/components/form/`, exposing typed `form.AppField` Field Blocks, `form.AppForm` action blocks, and a router-free Form Wizard.

Value boundaries are standardized so forms round-trip cleanly with the repo's plain-JSON tRPC transport and ADR 0004: date-only fields store `"YYYY-MM-DD"` strings, datetime fields store ISO-8601 strings, phone fields store E.164 strings (via `libphonenumber-js`), currency fields store integer Currency minor units, and upload fields store relative Stored asset paths with an optional preview URL resolver.

Form Wizard holds one shared `useAppForm` instance across all steps, validates per step on advance, and keeps step state controlled or uncontrolled without touching TanStack Router or `nuqs` (extending ADR 0002).

## Considered Options

- **Raw `useForm` + `<form.Field>` + `field={field}` (previous `form-fields.tsx`)**: zero hook indirection, but forces repeated render-prop wiring, manual `<form.Subscribe>` submit buttons, and brittle structural typing on optional/nullable fields.
- **Standalone one-line `<FormTextField form={form} name="..." />` wrappers**: shortest JSX at the call site, but TanStack Form v1's generic parameter list makes typing generic `form` + `name` wrappers fragile and breaks `withForm` composition.
- **Native `Date` objects in date/datetime fields**: matches `react-day-picker` directly, but forces manual ISO conversion across plain-JSON tRPC boundaries and introduces local-timezone off-by-one drift on date-only values.

## Consequences

Every screen instantiates forms through `useAppForm` from `@monorepo-boilerplate/ui/components/form` instead of calling `useForm` directly. Field Blocks depend on `fieldContext` (and form-level actions on `formContext`), so custom domain sub-forms compose via `withForm` rather than prop-drilling raw field APIs.
