import * as React from "react";
import type { Row, RowData } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@monorepo-boilerplate/ui/components/table";
import type { DataTableFeatures } from "../data-table";
import { EmptyRows, ExpandToggle, stringifyHeader, type ViewportProps } from "./shared";
import { usePinnedColumns } from "./use-pinned-columns";
import { useRowWindow } from "./use-row-window";

export function DesktopViewport<TData extends RowData>(props: ViewportProps<TData>) {
  const {
    table,
    rows,
    tableId,
    density,
    rowsInert,
    hasExpanderColumn,
    skeletonRowCount,
    showSkeleton,
    virtualization,
    pageSelection,
    onRowClick,
    rowClassName,
    renderSubRow,
    getExpandLabel,
    emptyState,
    onSortingChange,
  } = props;
  const isVirtualized = virtualization !== undefined;
  const selection = pageSelection?.selection;
  const canActivateRow = Boolean(onRowClick) && !rowsInert;
  const { regionLabel } = props;
  const { tableHostRef, headerGroups, hasStartPinned, expanderOffset, pinnedCellProps } =
    usePinnedColumns(table, Boolean(selection), hasExpanderColumn);
  const { scrollRef, height, items, paddingTop, paddingBottom } = useRowWindow(
    rows.length,
    virtualization,
    density,
  );
  const columnCount =
    table.getVisibleLeafColumns().length + Number(Boolean(selection)) + Number(hasExpanderColumn);
  const primarySort = table.state.sorting[0];

  function renderDesktopRow(row: Row<DataTableFeatures, TData>, virtualIndex?: number) {
    const subRowId = `${tableId}-subrow-${row.id}`;
    const isExpanded = row.getIsExpanded();

    return (
      <React.Fragment key={row.id}>
        <TableRow
          data-index={virtualIndex}
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
              style={hasStartPinned ? { insetInlineStart: 0 } : undefined}
              className={cn(
                "w-10 ps-3",
                density === "compact" && "py-1.5",
                hasStartPinned && "sticky z-10 bg-background group-hover/row:bg-muted/50",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {selection.canSelect?.(row.original) !== false && (
                <Checkbox
                  aria-label={selection.getLabel(row.original)}
                  checked={selection.ids.has(selection.getId(row.original))}
                  disabled={selection.disabled || rowsInert}
                  onCheckedChange={(checked) =>
                    pageSelection.changeSelection([selection.getId(row.original)], checked)
                  }
                />
              )}
            </TableCell>
          )}
          {hasExpanderColumn && (
            <TableCell
              style={hasStartPinned ? { insetInlineStart: expanderOffset } : undefined}
              className={cn(
                "w-10",
                !selection && "ps-3",
                density === "compact" && "py-1.5",
                hasStartPinned && "sticky z-10 bg-background group-hover/row:bg-muted/50",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <ExpandToggle {...{ row, subRowId, rowsInert, getExpandLabel }} />
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
        {renderSubRow && isExpanded ? (
          <TableRow
            id={subRowId}
            data-slot="data-table-subrow"
            inert={rowsInert || undefined}
            className="bg-muted/25 hover:bg-muted/25"
          >
            <TableCell colSpan={columnCount} className="p-4 whitespace-normal">
              {renderSubRow(row.original)}
            </TableCell>
          </TableRow>
        ) : null}
      </React.Fragment>
    );
  }
  const tableHeaderNode = (
    <TableHeader
      className={
        isVirtualized
          ? "sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--color-border)]"
          : undefined
      }
    >
      {headerGroups.map((headerGroup, index, groups) => (
        <TableRow key={headerGroup.id} className="hover:bg-transparent">
          {pageSelection && index === 0 && (
            <TableHead
              scope="col"
              rowSpan={groups.length}
              data-pin-measure-id="__selection"
              style={hasStartPinned ? { insetInlineStart: 0 } : undefined}
              className={cn(
                "w-10 ps-3",
                density === "compact" && "h-9 py-1.5",
                hasStartPinned && "sticky z-20 bg-background",
              )}
            >
              <Checkbox
                aria-label={pageSelection.selection.pageLabel}
                checked={pageSelection.allSelected}
                indeterminate={pageSelection.indeterminate}
                disabled={
                  pageSelection.selection.disabled ||
                  rowsInert ||
                  pageSelection.pageIds.length === 0
                }
                className="data-indeterminate:before:h-px data-indeterminate:before:w-2.5 data-indeterminate:before:bg-current data-indeterminate:[&>span]:hidden"
                onCheckedChange={(checked) =>
                  pageSelection.changeSelection(pageSelection.pageIds, checked)
                }
              />
            </TableHead>
          )}
          {hasExpanderColumn && index === 0 && (
            <TableHead
              scope="col"
              rowSpan={groups.length}
              data-pin-measure-id="__expander"
              style={hasStartPinned ? { insetInlineStart: expanderOffset } : undefined}
              className={cn(
                "w-10",
                !selection && "ps-3",
                density === "compact" && "h-9 py-1.5",
                hasStartPinned && "sticky z-20 bg-background",
              )}
            >
              <span className="sr-only">Expand</span>
            </TableHead>
          )}
          {headerGroup.headers.map((header) => {
            const canSort = Boolean(onSortingChange) && header.column.getCanSort();
            const sorted = header.column.getIsSorted();
            const pinned = header.column.getIsPinned();
            const pinProps = pinnedCellProps(header.column.id, pinned);
            return (
              <TableHead
                key={header.id}
                colSpan={header.colSpan}
                scope={header.subHeaders.length > 0 ? "colgroup" : "col"}
                aria-sort={
                  !header.isPlaceholder && primarySort?.id === header.column.id
                    ? primarySort.desc
                      ? "descending"
                      : "ascending"
                    : undefined
                }
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={header.column.getToggleSortingHandler()}
                    className="-mx-1 inline-flex min-h-8 items-center gap-1 rounded px-1 py-1 text-xs font-medium tracking-wider uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`Sort by ${stringifyHeader(header.column.columnDef.header, header.id)}`}
                  >
                    <table.FlexRender header={header} />
                    {sorted === "asc" ? (
                      <ArrowUpIcon aria-hidden className="size-3" />
                    ) : sorted === "desc" ? (
                      <ArrowDownIcon aria-hidden className="size-3" />
                    ) : (
                      <ChevronsUpDownIcon aria-hidden className="size-3 opacity-50" />
                    )}
                  </Button>
                ) : (
                  <table.FlexRender header={header} />
                )}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );

  const tableBodyNode = (
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
            {emptyState ?? <EmptyRows className="border-0 py-12" />}
          </TableCell>
        </TableRow>
      ) : isVirtualized ? (
        <>
          {paddingTop > 0 ? (
            <tr aria-hidden="true" style={{ height: `${paddingTop}px` }}>
              <td colSpan={columnCount} style={{ padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {items.map((virtualItem) => {
            const row = rows[virtualItem.index]!;
            return renderDesktopRow(row, virtualItem.index);
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true" style={{ height: `${paddingBottom}px` }}>
              <td colSpan={columnCount} style={{ padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </>
      ) : (
        rows.map((row) => renderDesktopRow(row))
      )}
    </TableBody>
  );

  return (
    <div ref={tableHostRef} className="hidden overflow-hidden rounded-lg border @lg:block">
      {isVirtualized ? (
        <div
          ref={scrollRef}
          data-slot="table-container"
          tabIndex={0}
          role="region"
          aria-label={regionLabel}
          style={{ maxHeight: height }}
          className="relative w-full overflow-auto overscroll-contain focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <table data-slot="table" className="w-full caption-bottom text-sm">
            {tableHeaderNode}
            {tableBodyNode}
          </table>
        </div>
      ) : (
        <Table regionLabel={regionLabel}>
          {tableHeaderNode}
          {tableBodyNode}
        </Table>
      )}
    </div>
  );
}
