# Use `@dnd-kit/react` and keep KanbanBoard controlled with internal drag preview

Two boundaries decided together, because both determine whether the **Kanban Board** block stays reusable across CRM pipelines, task boards, and React 19 consumers outside this repo.

The block uses `@dnd-kit/react` (the React 19-native rewrite over `@dnd-kit/dom`) rather than legacy `@dnd-kit/core` + `@dnd-kit/sortable`. Drag hover previews stay internal to the block while a drag is active; the block fires a single `onCardMove` commit callback on drop (carrying column IDs, indices, and adjacent neighbor card IDs) and reverts to the controlled `cards` prop if the screen does not update or rolls back an optimistic mutation.

## Considered Options

- **Legacy `@dnd-kit/core` + `@dnd-kit/sortable`**: matches most existing shadcn kanban tutorials, but carries React 19 compatibility friction and builds on the older architecture.
- **`@atlaskit/pragmatic-drag-and-drop`**: ultra-light native HTML5 DnD engine with strong Jira-scale performance, but requires hand-wiring drop indicators, layout transitions, and keyboard drag sensors.
- **Zero-dependency native HTML5 DnD**: zero extra packages, but weak touch/mobile ergonomics and custom drag preview control.
- **Emit `onCardMove` continuously on `onDragOver`**: simplifies preview state inside the block, but leaks transient hover mutations into screen state and complicates tRPC / TanStack Query optimistic rollbacks.

## Consequences

Consumers copying legacy `@dnd-kit/core` snippets cannot mix them with this block's drag context, which stays encapsulated inside `packages/ui`. Screens get a pure `applyKanbanMove` helper alongside `KanbanBoard` for one-line local updates or TanStack Query `onMutate` optimistic updates, plus `beforeCardId` / `afterCardId` in the move payload for optional fractional ranking on the backend.
