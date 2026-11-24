# Pin TanStack Table v9 and keep blocks free of routing

Two boundaries decided together, because both determine whether the blocks can be consumed outside this repo.

TanStack Table v9 (`9.3.1`, exact pin) rather than v8, whose last release was 2025-04. v9 renames `useReactTable` to `useTable`, requires an explicit `tableFeatures({})` tree, moves rendering to `table.FlexRender`, and replaces re-renders with `table.Subscribe`/selectors. It is a different library that shares a name with the one every existing data-table tutorial describes.

`DataTable` is controlled state only: it takes `pagination`, `sorting`, and change callbacks, never URL state. `nuqs` is bridged to it by a hook in the app.

## Considered Options

- **v8**: matches all public documentation and shadcn's data-table example, but starts the template on a frozen major.
- **DataTable reads `nuqs` directly**: shortest path, but forces every consumer to install `nuqs` and mount `NuqsAdapter`, and leaves the component unroutable in isolation.

## Consequences

Consumers copying v8 snippets hit type errors with no search results behind them; the v8-to-v9 mapping lives in a comment above the component and the `/legacy` export is named in the README as an escape hatch.
