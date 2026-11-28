/**
 * DataTable — a controlled table block.
 *
 * ## TanStack Table v9 (read before copying v8 snippets)
 *
 * v9 is not v8 with renamed exports; the shapes differ:
 *
 * | v8                                    | v9                                        |
 * | ------------------------------------- | ----------------------------------------- |
 * | `useReactTable`                       | `useTable`                                |
 * | implicit all-features table           | required `tableFeatures({ ... })` tree     |
 * | `flexRender(def, ctx)`                | `<table.FlexRender cell={cell} />`         |
 * | `table.getState()` drives re-renders   | `table.state` selector / `table.Subscribe` |
 * | `onStateChange`                       | per-slice `on*Change` paired with `state`  |
 *
 * `@tanstack/react-table/legacy` still ships `useLegacyTable` as an escape
 * hatch; do not mix it with this component's feature registry.
 *
 * ## Contract
 *
 * The block never fetches and never reads the URL. It reports what the user
 * asked for through `onPaginationChange` / `onSortingChange`. By default
 * it can apply controlled sorting locally; `manualSorting` leaves that to the caller. `apps/web/src/lib/use-data-table-search-params.ts` bridges
 * nuqs to these callbacks; see docs/adr/0002.
 *
 * ## Loading
 *
 * Two separate states, because a table has two kinds of waiting:
 *
 * - `isLoading`: no rows to show yet. Skeleton rows reserve the requested page
 *   size, so the initial paint and the first page have the same height.
 * - `isFetching`: a request is in flight while rows are already rendered
 *   (stale-while-revalidate). Rows stay mounted, become inert, and the region
 *   is marked `aria-busy` with a layout-neutral rail. Paging, sorting, and
 *   filtering therefore never flash an empty table or change its height.
 *
 * Do not pass both as the same value: `isLoading={isFetching}` reproduces the
 * flicker this contract exists to prevent.
 */
import * as React from "react";
import { cn } from "cn";
import {
  columnFilteringFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnVisibilityState,
  type ExpandedState,
  type PaginationState,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";

import { CardViewport } from "./data-table/card-viewport";
import { DesktopViewport } from "./data-table/desktop-viewport";
import { createPageSelection } from "./data-table/shared";
import { TableFooter } from "./data-table/table-footer";

/**
 * Feature registry shared by the block and its consumers. Export it so a
 * screen can type its own columns with `createColumnHelper<DataTableFeatures, T>()`
 * and stay assignable to this component.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowExpandingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  columnPinningFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns,
});

export type DataTableFeatures = typeof dataTableFeatures;

/**
 * Column helper factory bound to the block's feature set. Using a different
 * feature tree produces column defs this table cannot accept.
 */
export function columnsFor<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData>;

type DataTableSelection<TData> = {
  ids: ReadonlySet<string>;
  getId: (row: TData) => string;
  getLabel: (row: TData) => string;
  pageLabel: string;
  canSelect?: (row: TData) => boolean;
  disabled?: boolean;
  onChange: (ids: ReadonlySet<string>) => void;
};

export type {
  ColumnPinningState,
  ColumnVisibilityState,
  ColumnVisibilityState as VisibilityState,
  ExpandedState,
  PaginationState,
  SortingState,
};

export type DataTableDensity = "comfortable" | "compact";

export type DataTableVirtualizationOptions = {
  /** Enable virtualized row rendering via `@tanstack/react-virtual`. */
  enabled?: boolean;
  /** Estimated row height in pixels. Defaults to `44` (comfortable) or `36` (compact). */
  estimateRowHeight?: number;
  /** Maximum height of the virtualized scroll viewport. Defaults to `480`. */
  height?: number | string;
  /** Number of overscan rows rendered outside the visible viewport. Defaults to `8`. */
  overscan?: number;
};

export type DataTableProps<TData extends RowData> = {
  data: readonly TData[];
  columns: readonly ColumnDef<DataTableFeatures, TData>[];
  /** Total rows on the server. Required when `manualPagination` is set. */
  rowCount?: number;
  pagination?: PaginationState;
  sorting?: SortingState;
  columnVisibility?: ColumnVisibilityState;
  columnPinning?: ColumnPinningState;
  expanded?: ExpandedState;
  onPaginationChange?: (pagination: PaginationState) => void;
  /** Changes are limited to selectable rows in the rendered page. */
  selection?: DataTableSelection<TData>;
  onSortingChange?: (sorting: SortingState) => void;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  onColumnPinningChange?: (pinning: ColumnPinningState) => void;
  onExpandedChange?: (expanded: ExpandedState) => void;
  /** Renders an inline detail panel beneath an expanded row. */
  renderSubRow?: (row: TData) => React.ReactNode;
  /** Override whether a row can be expanded. Defaults to `true` when `renderSubRow` is set. */
  getRowCanExpand?: (row: TData) => boolean;
  /** Hierarchical sub-rows accessor for tree-style expansion. */
  getSubRows?: (originalRow: TData, index: number) => TData[] | undefined;
  /** Stable row ID extractor used for selection/expansion keys. */
  getRowId?: (originalRow: TData, index: number, parent?: Row<DataTableFeatures, TData>) => string;
  /** Accessible label for the row expand/collapse toggle button. */
  getExpandLabel?: (row: TData, isExpanded: boolean) => string;
  /** Enables opt-in `@tanstack/react-virtual` rendering for large datasets. */
  virtualized?: boolean | DataTableVirtualizationOptions;
  /** Sorting, filtering, and paging are performed by the API. */
  manualPagination?: boolean;
  manualSorting?: boolean;
  /** No rows yet: renders skeleton rows sized to the requested page. */
  isLoading?: boolean;
  /**
   * A request is in flight while rows are already rendered. Keeps those rows
   * mounted (and inert) instead of replacing them with skeletons.
   */
  isFetching?: boolean;
  /** Disable row interactions without displaying the fetching rail. */
  disableRows?: boolean;
  /** Renders instead of rows when there is no data and nothing is loading. */
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  className?: string;
  pageSizeOptions?: readonly number[];
  /** Row height. The app supplies this from its UI-preferences store. */
  density?: DataTableDensity;
  /** Accessible name for the scrollable table region. */
  regionLabel?: string;
};

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function DataTable<TData extends RowData>({
  data,
  columns,
  rowCount,
  pagination,
  sorting,
  columnVisibility,
  columnPinning,
  expanded,
  onPaginationChange,
  onSortingChange,
  onColumnVisibilityChange,
  onColumnPinningChange,
  onExpandedChange,
  renderSubRow,
  getRowCanExpand,
  getSubRows,
  getRowId,
  getExpandLabel,
  virtualized = false,
  selection,
  manualPagination = false,
  manualSorting = false,
  isLoading = false,
  isFetching = false,
  disableRows = false,
  emptyState,
  onRowClick,
  rowClassName,
  className,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  density = "comfortable",
  regionLabel = "Data table",
}: DataTableProps<TData>) {
  const tableId = React.useId();
  const isExpandedControlled = expanded !== undefined;
  const [uncontrolledExpanded, setUncontrolledExpanded] = React.useState<ExpandedState>({});
  const activeExpanded = isExpandedControlled ? expanded : uncontrolledExpanded;
  const hasExpanderColumn = Boolean(renderSubRow || getSubRows);
  const hasExpanding = Boolean(hasExpanderColumn || isExpandedControlled || onExpandedChange);

  const isVirtualized =
    typeof virtualized === "boolean"
      ? virtualized
      : Boolean(virtualized && virtualized.enabled !== false);
  const bypassPagination = isVirtualized && pagination === undefined;

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    getSubRows,
    getRowCanExpand: getRowCanExpand
      ? (row) => getRowCanExpand(row.original)
      : renderSubRow
        ? () => true
        : undefined,
    autoResetExpanded: isExpandedControlled ? false : undefined,
    rowCount: manualPagination ? (rowCount ?? data.length) : undefined,
    manualPagination: manualPagination || bypassPagination,
    manualSorting,
    state: {
      ...(pagination ? { pagination } : {}),
      ...(sorting ? { sorting } : {}),
      ...(columnVisibility ? { columnVisibility } : {}),
      ...(columnPinning ? { columnPinning } : {}),
      ...(hasExpanding ? { expanded: activeExpanded } : {}),
    },
    onPaginationChange: (updater) => {
      if (!onPaginationChange) return;
      const next = typeof updater === "function" ? updater(currentPagination(pagination)) : updater;
      onPaginationChange(next);
    },
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      const next = typeof updater === "function" ? updater(sorting ?? []) : updater;
      onSortingChange(next);
    },
    onColumnVisibilityChange: (updater) => {
      if (!onColumnVisibilityChange) return;
      const next = typeof updater === "function" ? updater(columnVisibility ?? {}) : updater;
      onColumnVisibilityChange(next);
    },
    onColumnPinningChange: (updater) => {
      if (!onColumnPinningChange) return;
      const next =
        typeof updater === "function" ? updater(columnPinning ?? { start: [], end: [] }) : updater;
      onColumnPinningChange(next);
    },
    onExpandedChange: (updater) => {
      const next = typeof updater === "function" ? updater(activeExpanded) : updater;
      if (!isExpandedControlled) {
        setUncontrolledExpanded(next);
      }
      onExpandedChange?.(next);
    },
  });

  const pageCount = table.getPageCount();
  const currentIndex = pagination?.pageIndex ?? 0;
  const currentSize = pagination?.pageSize ?? data.length;
  const total = manualPagination
    ? (rowCount ?? data.length)
    : table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  // Only a request with nothing to show may replace content. Once rows exist,
  // a refetch keeps them mounted; see the Loading section above.
  const showSkeleton = isLoading && rows.length === 0;
  const isBusy = showSkeleton || isFetching;
  // Reserve the height of the page the skeleton stands in for, capped in virtualized mode.
  const skeletonRowCount = isVirtualized
    ? Math.min(Math.max(1, currentSize || 8), 10)
    : Math.max(1, currentSize);
  const rowsInert = isBusy || disableRows;

  const viewport = {
    table,
    rows,
    tableId,
    density,
    rowsInert,
    hasExpanderColumn,
    skeletonRowCount,
    showSkeleton,
    emptyState,
    onRowClick,
    rowClassName,
    renderSubRow,
    getExpandLabel,
    regionLabel,
    onSortingChange,
    pageSelection: createPageSelection(rows, selection, rowsInert),
    virtualization: isVirtualized
      ? typeof virtualized === "object"
        ? virtualized
        : {}
      : undefined,
  };

  return (
    <div
      data-slot="data-table"
      data-density={density}
      data-virtualized={isVirtualized ? "true" : undefined}
      aria-busy={isBusy || undefined}
      className={cn("@container relative flex flex-col gap-3", className)}
    >
      {isFetching ? <LoadingRail /> : null}
      <CardViewport {...viewport} />
      <DesktopViewport {...viewport} />
      <TableFooter
        {...{
          pageCount,
          currentIndex,
          currentSize,
          total,
          pageSizeOptions,
          onPaginationChange,
          bypassPagination,
        }}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
      />
    </div>
  );
}

function currentPagination(pagination: PaginationState | undefined): PaginationState {
  return pagination ?? { pageIndex: 0, pageSize: 10 };
}

/**
 * Activity line pinned to the top edge of the block. Absolutely positioned so
 * showing or hiding it never moves the rows underneath.
 */
function LoadingRail() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/60"
    />
  );
}
