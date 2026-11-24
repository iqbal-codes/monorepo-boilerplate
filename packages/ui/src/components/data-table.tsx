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
 */
import * as React from "react";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, LoaderIcon } from "lucide-react";
import {
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  columnFilteringFeature,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
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

export type DataTableProps<TData extends RowData> = {
  data: readonly TData[];
  columns: readonly ColumnDef<DataTableFeatures, TData>[];
  /** Total rows on the server. Required when `manualPagination` is set. */
  rowCount?: number;
  pagination?: PaginationState;
  sorting?: SortingState;
  onPaginationChange?: (pagination: PaginationState) => void;
  /** Changes are limited to selectable rows in the rendered page. */
  selection?: DataTableSelection<TData>;
  onSortingChange?: (sorting: SortingState) => void;
  /** Sorting, filtering, and paging are performed by the API. */
  manualPagination?: boolean;
  manualSorting?: boolean;
  isLoading?: boolean;
  /** Renders instead of rows when there is no data and nothing is loading. */
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  className?: string;
  pageSizeOptions?: readonly number[];
  /** Row height. The app supplies this from its UI-preferences store. */
  density?: "comfortable" | "compact";
};

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function DataTable<TData extends RowData>({
  data,
  columns,
  rowCount,
  pagination,
  sorting,
  onPaginationChange,
  onSortingChange,
  selection,
  manualPagination = false,
  manualSorting = false,
  isLoading = false,
  emptyState,
  onRowClick,
  rowClassName,
  className,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  density = "comfortable",
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
  });

  const pageCount = table.getPageCount();
  const currentIndex = pagination?.pageIndex ?? 0;
  const currentSize = pagination?.pageSize ?? data.length;
  const total = manualPagination
    ? (rowCount ?? data.length)
    : table.getFilteredRowModel().rows.length;
  const firstRow = total === 0 ? 0 : currentIndex * currentSize + 1;
  const lastRow = Math.min((currentIndex + 1) * currentSize, total);
  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length + Number(Boolean(selection));
  const pageIds = selection
    ? rows
        .filter((row) => selection.canSelect?.(row.original) !== false)
        .map((row) => selection.getId(row.original))
    : [];
  const selectedCount = pageIds.filter((id) => selection?.ids.has(id)).length;
  const allSelected = pageIds.length > 0 && selectedCount === pageIds.length;

  function changeSelection(ids: readonly string[], checked: boolean) {
    if (!selection || selection.disabled || isLoading) return;
    const next = new Set(pageIds.filter((id) => selection.ids.has(id)));
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    selection.onChange(next);
  }

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup, index, groups) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {selection && index === 0 && (
                  <TableHead scope="col" rowSpan={groups.length} className="w-10 ps-3">
                    <Checkbox
                      aria-label={selection.pageLabel}
                      checked={allSelected}
                      indeterminate={selectedCount > 0 && !allSelected}
                      disabled={selection.disabled || isLoading || pageIds.length === 0}
                      className="data-indeterminate:before:h-px data-indeterminate:before:w-2.5 data-indeterminate:before:bg-current data-indeterminate:[&>span]:hidden"
                      onCheckedChange={(checked) => changeSelection(pageIds, checked)}
                    />
                  </TableHead>
                )}
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium tracking-wider uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            {isLoading ? (
              Array.from({ length: Math.min(currentSize, 10) }, (_, index) => (
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
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                >
                  {selection && (
                    <TableCell className="w-10 ps-3" onClick={(event) => event.stopPropagation()}>
                      {selection.canSelect?.(row.original) !== false && (
                        <Checkbox
                          aria-label={selection.getLabel(row.original)}
                          checked={selection.ids.has(selection.getId(row.original))}
                          disabled={selection.disabled}
                          onCheckedChange={(checked) =>
                            changeSelection([selection.getId(row.original)], checked)
                          }
                        />
                      )}
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={density === "compact" ? "py-1.5" : undefined}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
        <p aria-live="polite">{total === 0 ? "No rows" : `${firstRow}–${lastRow} of ${total}`}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="hidden sm:inline">Rows per page</span>
          <Select
            value={String(currentSize)}
            onValueChange={(value) => {
              const pageSize = Number(value);
              onPaginationChange?.({ pageIndex: 0, pageSize });
            }}
          >
            <SelectTrigger size="sm" className="w-[5.5rem]" aria-label="Rows per page">
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
            onClick={() =>
              onPaginationChange?.({ pageIndex: currentIndex - 1, pageSize: currentSize })
            }
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="tabular-nums">
            Page {pageCount === 0 ? 0 : currentIndex + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onPaginationChange?.({ pageIndex: currentIndex + 1, pageSize: currentSize })
            }
            disabled={!table.getCanNextPage()}
          >
            Next
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
