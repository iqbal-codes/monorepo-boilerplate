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
 * asked for through `onPaginationChange` / `onSortingChange` and renders
 * `data` as given. `apps/web/src/lib/use-data-table-search-params.ts` bridges
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
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LoaderIcon,
} from "lucide-react";
import {
  columnFilteringFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnVisibilityState,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@monorepo-boilerplate/ui/components/table";

/**
 * Feature registry shared by the block and its consumers. Export it so a
 * screen can type its own columns with `createColumnHelper<DataTableFeatures, T>()`
 * and stay assignable to this component.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  columnPinningFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
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
  PaginationState,
  SortingState,
};

export type DataTableDensity = "comfortable" | "compact";

export type DataTableProps<TData extends RowData> = {
  data: readonly TData[];
  columns: readonly ColumnDef<DataTableFeatures, TData>[];
  /** Total rows on the server. Required when `manualPagination` is set. */
  rowCount?: number;
  pagination?: PaginationState;
  sorting?: SortingState;
  columnVisibility?: ColumnVisibilityState;
  columnPinning?: ColumnPinningState;
  onPaginationChange?: (pagination: PaginationState) => void;
  /** Changes are limited to selectable rows in the rendered page. */
  selection?: DataTableSelection<TData>;
  onSortingChange?: (sorting: SortingState) => void;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;
  onColumnPinningChange?: (pinning: ColumnPinningState) => void;
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
  onPaginationChange,
  onSortingChange,
  onColumnVisibilityChange,
  onColumnPinningChange,
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
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    rowCount: manualPagination ? (rowCount ?? data.length) : undefined,
    manualPagination,
    manualSorting,
    state: {
      ...(pagination ? { pagination } : {}),
      ...(sorting ? { sorting } : {}),
      ...(columnVisibility ? { columnVisibility } : {}),
      ...(columnPinning ? { columnPinning } : {}),
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
  });

  const tableHostRef = React.useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const startPinnedIds = table.getStartVisibleLeafColumns().map((c) => c.id);
  const endPinnedIds = table.getEndVisibleLeafColumns().map((c) => c.id);
  const hasPinnedColumns = startPinnedIds.length > 0 || endPinnedIds.length > 0;
  const headerGroups = table.getHeaderGroups();
  // Reattach when React changes the header nodes (visibility/grouping/pinning).
  const headerSignature = JSON.stringify([
    Boolean(selection),
    headerGroups.map(({ headers }) => headers.map(({ id }) => id)),
  ]);

  React.useEffect(() => {
    if (!hasPinnedColumns) return;
    const host = tableHostRef.current;
    if (!host) return;
    const headers = Array.from(host.querySelectorAll<HTMLElement>("thead th[data-pin-measure-id]"));
    const measure = () => {
      const next: Record<string, number> = Object.create(null);
      for (const th of headers) {
        const id = th.dataset.pinMeasureId;
        if (id) next[id] = th.getBoundingClientRect().width;
      }
      setColumnWidths((previous) =>
        Object.keys(previous).length === Object.keys(next).length &&
        Object.keys(next).every((id) => next[id] === previous[id])
          ? previous
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    // Auto-layout can redistribute widths without changing the scroll host.
    for (const th of headers) observer.observe(th, { box: "border-box" });
    return () => observer.disconnect();
  }, [hasPinnedColumns, headerSignature]);

  const pinOffsets = React.useMemo(() => {
    const start: Record<string, number> = {};
    const end: Record<string, number> = {};
    let leftCursor = selection && startPinnedIds.length > 0 ? (columnWidths.__selection ?? 40) : 0;
    for (const id of startPinnedIds) {
      start[id] = leftCursor;
      leftCursor += columnWidths[id] ?? 0;
    }
    let rightCursor = 0;
    for (let index = endPinnedIds.length - 1; index >= 0; index -= 1) {
      const id = endPinnedIds[index]!;
      end[id] = rightCursor;
      rightCursor += columnWidths[id] ?? 0;
    }
    return { start, end };
  }, [columnWidths, endPinnedIds, selection, startPinnedIds]);

  const pageCount = table.getPageCount();
  const currentIndex = pagination?.pageIndex ?? 0;
  const currentSize = pagination?.pageSize ?? data.length;
  const total = manualPagination
    ? (rowCount ?? data.length)
    : table.getFilteredRowModel().rows.length;
  const firstRow = total === 0 ? 0 : currentIndex * currentSize + 1;
  const lastRow = Math.min((currentIndex + 1) * currentSize, total);
  const rows = table.getRowModel().rows;
  // Only a request with nothing to show may replace content. Once rows exist,
  // a refetch keeps them mounted; see the Loading section above.
  const showSkeleton = isLoading && rows.length === 0;
  const isBusy = showSkeleton || isFetching;
  // Reserve the height of the page the skeleton stands in for, not a fixed cap.
  const skeletonRowCount = Math.max(1, currentSize);
  const rowsInert = isBusy || disableRows;
  const canActivateRow = Boolean(onRowClick) && !rowsInert;
  const columnCount = table.getVisibleLeafColumns().length + Number(Boolean(selection));
  const pageIds = selection
    ? rows
        .filter((row) => selection.canSelect?.(row.original) !== false)
        .map((row) => selection.getId(row.original))
    : [];
  const selectedCount = pageIds.filter((id) => selection?.ids.has(id)).length;
  const allSelected = pageIds.length > 0 && selectedCount === pageIds.length;

  function changeSelection(ids: readonly string[], checked: boolean) {
    if (!selection || selection.disabled || rowsInert) return;
    const next = new Set(pageIds.filter((id) => selection.ids.has(id)));
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  }

  const sortableHeaders = table
    .getFlatHeaders()
    .filter((header) => !header.isPlaceholder && header.column.getCanSort());
  const activeSort = sorting?.[0];

  function pinnedCellProps(columnId: string, pinned: false | "start" | "end") {
    if (!pinned) return {};
    const style: React.CSSProperties =
      pinned === "start"
        ? { insetInlineStart: pinOffsets.start[columnId] ?? 0 }
        : { insetInlineEnd: pinOffsets.end[columnId] ?? 0 };
    const isLastStart = pinned === "start" && startPinnedIds.at(-1) === columnId;
    const isFirstEnd = pinned === "end" && endPinnedIds[0] === columnId;
    return {
      "data-pinned": pinned,
      style,
      className: cn(
        "sticky z-10 bg-background group-hover/row:bg-muted/50",
        isLastStart && "border-e border-border",
        isFirstEnd && "border-s border-border",
      ),
    };
  }

  return (
    <div
      data-slot="data-table"
      data-density={density}
      aria-busy={isBusy || undefined}
      className={cn("@container relative flex flex-col gap-3", className)}
    >
      {isFetching ? <LoadingRail /> : null}
      {/* Narrow-container stacked card list */}
      <div className="flex flex-col gap-2 @lg:hidden">
        {(selection || sortableHeaders.length > 0) && (
          <div className="flex items-center justify-between gap-2 px-1">
            {selection ? (
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                <Checkbox
                  aria-label={selection.pageLabel}
                  checked={allSelected}
                  indeterminate={selectedCount > 0 && !allSelected}
                  disabled={selection.disabled || rowsInert || pageIds.length === 0}
                  className="data-indeterminate:before:h-px data-indeterminate:before:w-2.5 data-indeterminate:before:bg-current data-indeterminate:[&>span]:hidden"
                  onCheckedChange={(checked) => changeSelection(pageIds, checked)}
                />
                <span>Select all</span>
              </label>
            ) : (
              <span />
            )}
            {sortableHeaders.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Select
                  value={activeSort?.id ?? ""}
                  onValueChange={(columnId) => {
                    if (!columnId) return;
                    const nextDesc = activeSort?.id === columnId ? !activeSort.desc : false;
                    onSortingChange?.([{ id: columnId, desc: nextDesc }]);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-auto min-w-28 border border-input px-2.5 text-xs"
                    aria-label="Sort by"
                  >
                    <ArrowUpDownIcon className="size-3 text-muted-foreground" aria-hidden />
                    <SelectValue placeholder="Sort">
                      {(value) => {
                        const header = sortableHeaders.find((h) => h.column.id === value);
                        return header
                          ? stringifyHeader(header.column.columnDef.header, header.id)
                          : "Sort";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent align="end">
                    {sortableHeaders.map((header) => (
                      <SelectItem key={header.column.id} value={header.column.id}>
                        {stringifyHeader(header.column.columnDef.header, header.id)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeSort ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={
                      activeSort.desc
                        ? "Sort descending, switch to ascending"
                        : "Sort ascending, switch to descending"
                    }
                    onClick={() =>
                      onSortingChange?.([{ id: activeSort.id, desc: !activeSort.desc }])
                    }
                  >
                    {activeSort.desc ? <ArrowDownIcon aria-hidden /> : <ArrowUpIcon aria-hidden />}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {showSkeleton ? (
          <div className="flex flex-col divide-y rounded-lg border">
            {Array.from({ length: skeletonRowCount }, (_, index) => (
              <div key={`mobile-skeleton-${index}`} className="flex flex-col gap-2 p-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border">
            {emptyState ?? (
              <Empty className="border-0 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LoaderIcon />
                  </EmptyMedia>
                  <EmptyTitle>No results</EmptyTitle>
                  <EmptyDescription>
                    Nothing matches the current filters. Adjust them and try again.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-lg border">
            {rows.map((row) => {
              const cells = row.getVisibleCells();
              const actionCell = cells.find((cell) => cell.column.id === "actions");
              const dataCells = cells.filter((cell) => cell.column.id !== "actions");
              const [primaryCell, ...secondaryCells] = dataCells;
              const rowId = selection?.getId(row.original);
              const isSelectable = selection
                ? selection.canSelect?.(row.original) !== false
                : false;

              return (
                <div
                  key={`mobile-${row.id}`}
                  inert={rowsInert || undefined}
                  onClick={canActivateRow ? () => onRowClick?.(row.original) : undefined}
                  className={cn(
                    "flex items-start gap-3 transition-colors",
                    density === "compact" ? "p-2.5" : "p-3",
                    canActivateRow && "cursor-pointer hover:bg-muted/50",
                    rowClassName?.(row.original),
                  )}
                >
                  {selection && (
                    <div className="pt-0.5" onClick={(event) => event.stopPropagation()}>
                      {isSelectable && rowId !== undefined ? (
                        <Checkbox
                          aria-label={selection.getLabel(row.original)}
                          checked={selection.ids.has(rowId)}
                          disabled={selection.disabled || rowsInert}
                          onCheckedChange={(checked) => changeSelection([rowId], checked)}
                        />
                      ) : null}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {primaryCell || actionCell ? (
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        {primaryCell ? (
                          <div className="min-w-0 flex-1">
                            <table.FlexRender cell={primaryCell} />
                          </div>
                        ) : (
                          <span />
                        )}
                        {actionCell ? (
                          <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                            <table.FlexRender cell={actionCell} />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {secondaryCells.length > 0 ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {secondaryCells.map((cell) => (
                          <div key={cell.id} className="flex min-w-0 flex-col gap-0.5">
                            <dt className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                              {stringifyHeader(cell.column.columnDef.header, cell.column.id)}
                            </dt>
                            <dd className="min-w-0 truncate">
                              <table.FlexRender cell={cell} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Wide-container table */}
      <div ref={tableHostRef} className="hidden overflow-hidden rounded-lg border @lg:block">
        <Table regionLabel={regionLabel}>
          <TableHeader>
            {headerGroups.map((headerGroup, index, groups) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {selection && index === 0 && (
                  <TableHead
                    scope="col"
                    rowSpan={groups.length}
                    data-pin-measure-id="__selection"
                    style={startPinnedIds.length > 0 ? { insetInlineStart: 0 } : undefined}
                    className={cn(
                      "w-10 ps-3",
                      density === "compact" && "h-9 py-1.5",
                      startPinnedIds.length > 0 && "sticky z-20 bg-background",
                    )}
                  >
                    <Checkbox
                      aria-label={selection.pageLabel}
                      checked={allSelected}
                      indeterminate={selectedCount > 0 && !allSelected}
                      disabled={selection.disabled || rowsInert || pageIds.length === 0}
                      className="data-indeterminate:before:h-px data-indeterminate:before:w-2.5 data-indeterminate:before:bg-current data-indeterminate:[&>span]:hidden"
                      onCheckedChange={(checked) => changeSelection(pageIds, checked)}
                    />
                  </TableHead>
                )}
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const pinned = header.column.getIsPinned();
                  const pinProps = pinnedCellProps(header.column.id, pinned);
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      data-pin-measure-id={
                        header.column.columns.length === 0 && !header.isPlaceholder
                          ? header.column.id
                          : undefined
                      }
                      data-pinned={pinProps["data-pinned"]}
                      style={pinProps.style}
                      className={cn(
                        density === "compact" && "h-9 py-1.5",
                        pinProps.className,
                        pinned && "z-20",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 py-1 text-xs font-medium tracking-wider uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          aria-label={`Sort by ${stringifyHeader(header.column.columnDef.header, header.id)}`}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon className="size-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon className="size-3" />
                          ) : (
                            <ChevronsUpDownIcon className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              Array.from({ length: skeletonRowCount }, (_, index) => (
                <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                  {Array.from({ length: columnCount }, (_, cellIndex) => (
                    <TableCell key={`skeleton-${index}-${cellIndex}`}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0">
                  {emptyState ?? (
                    <Empty className="border-0 py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <LoaderIcon />
                        </EmptyMedia>
                        <EmptyTitle>No results</EmptyTitle>
                        <EmptyDescription>
                          Nothing matches the current filters. Adjust them and try again.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  inert={rowsInert || undefined}
                  onClick={canActivateRow ? () => onRowClick?.(row.original) : undefined}
                  className={cn(
                    "group/row",
                    canActivateRow && "cursor-pointer",
                    rowClassName?.(row.original),
                  )}
                >
                  {selection && (
                    <TableCell
                      style={startPinnedIds.length > 0 ? { insetInlineStart: 0 } : undefined}
                      className={cn(
                        "w-10 ps-3",
                        density === "compact" && "py-1.5",
                        startPinnedIds.length > 0 &&
                          "sticky z-10 bg-background group-hover/row:bg-muted/50",
                      )}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {selection.canSelect?.(row.original) !== false && (
                        <Checkbox
                          aria-label={selection.getLabel(row.original)}
                          checked={selection.ids.has(selection.getId(row.original))}
                          disabled={selection.disabled || rowsInert}
                          onCheckedChange={(checked) =>
                            changeSelection([selection.getId(row.original)], checked)
                          }
                        />
                      )}
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const pinned = cell.column.getIsPinned();
                    const pinProps = pinnedCellProps(cell.column.id, pinned);
                    return (
                      <TableCell
                        key={cell.id}
                        data-pinned={pinProps["data-pinned"]}
                        style={pinProps.style}
                        className={cn(density === "compact" && "py-1.5", pinProps.className)}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground sm:gap-3 sm:text-sm">
        <p aria-live="polite" className="tabular-nums">
          {total === 0 ? "No rows" : `${firstRow}–${lastRow} of ${total}`}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <span className="hidden sm:inline">Rows per page</span>
          <Select
            value={String(currentSize)}
            onValueChange={(value) => {
              const pageSize = Number(value);
              onPaginationChange?.({ pageIndex: 0, pageSize });
            }}
          >
            <SelectTrigger
              size="sm"
              className="w-16 border border-input px-2.5"
              aria-label="Rows per page"
            >
              <SelectValue>{(value) => String(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="px-2 sm:px-3"
            aria-label="Previous page"
            onClick={() =>
              onPaginationChange?.({ pageIndex: currentIndex - 1, pageSize: currentSize })
            }
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeftIcon className="sm:hidden" aria-hidden />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="px-1 tabular-nums">
            <span className="sm:hidden">
              {pageCount === 0 ? 0 : currentIndex + 1}/{pageCount}
            </span>
            <span className="hidden sm:inline">
              Page {pageCount === 0 ? 0 : currentIndex + 1} of {pageCount}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="px-2 sm:px-3"
            aria-label="Next page"
            onClick={() =>
              onPaginationChange?.({ pageIndex: currentIndex + 1, pageSize: currentSize })
            }
            disabled={!table.getCanNextPage()}
          >
            <ChevronRightIcon className="sm:hidden" aria-hidden />
            <span className="hidden sm:inline">Next</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function currentPagination(pagination: PaginationState | undefined): PaginationState {
  return pagination ?? { pageIndex: 0, pageSize: 10 };
}

function stringifyHeader(header: unknown, fallback: string): string {
  if (typeof header === "string") return header;
  return fallback;
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
