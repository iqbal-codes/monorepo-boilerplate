import { useEffect, useEffectEvent, useRef } from "react";
import type { Row, RowData } from "@tanstack/react-table";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import type { DataTableFeatures, DataTableMobileInfinite } from "../data-table";
import { EmptyRows, ExpandToggle, stringifyHeader, type ViewportProps } from "./shared";
import { useRowWindow } from "./use-row-window";

export function CardViewport<TData extends RowData>(
  props: ViewportProps<TData> & {
    mobileInfinite?: DataTableMobileInfinite;
    hideMobileSort: boolean;
    isBusy: boolean;
  },
) {
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
    mobileInfinite,
    hideMobileSort,
    isBusy,
    onRowClick,
    rowClassName,
    renderSubRow,
    getExpandLabel,
    emptyState,
    onSortingChange,
  } = props;
  const isVirtualized = virtualization !== undefined;
  const canActivateRow = Boolean(onRowClick) && !rowsInert;
  const { regionLabel } = props;
  const { scrollRef, height, items, paddingTop, paddingBottom } = useRowWindow(
    rows.length,
    virtualization,
    density,
    true,
  );
  const sortableHeaders =
    !hideMobileSort && onSortingChange
      ? table
          .getFlatHeaders()
          .filter((header) => !header.isPlaceholder && header.column.getCanSort())
      : [];
  const activeSort = table.state.sorting.find((sort) =>
    sortableHeaders.some((header) => header.column.id === sort.id),
  );

  function renderMobileCard(row: Row<DataTableFeatures, TData>) {
    const cells = row.getVisibleCells();
    const actionCell = cells.find((cell) => cell.column.id === "actions");
    const dataCells = cells.filter((cell) => cell.column.id !== "actions");
    const [primaryCell, ...secondaryCells] = dataCells;
    const subRowId = `${tableId}-mobile-subrow-${row.id}`;
    const isExpanded = row.getIsExpanded();

    return (
      <div
        key={`mobile-${row.id}`}
        data-slot="data-table-card-row"
        inert={rowsInert || undefined}
        onClick={canActivateRow ? () => onRowClick?.(row.original) : undefined}
        className={cn(
          "flex items-start gap-3 transition-colors",
          density === "compact" ? "p-2.5" : "p-3",
          canActivateRow && "cursor-pointer hover:bg-muted/50 active:bg-muted/70",
          rowClassName?.(row.original),
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {primaryCell || actionCell || hasExpanderColumn ? (
            <div className="flex min-w-0 items-start justify-between gap-2">
              {primaryCell ? (
                <div className="min-w-0 flex-1">
                  <table.FlexRender cell={primaryCell} />
                </div>
              ) : (
                <span />
              )}
              <div
                className="flex shrink-0 items-center gap-1"
                onClick={(event) => event.stopPropagation()}
              >
                {hasExpanderColumn ? (
                  <ExpandToggle {...{ row, subRowId, rowsInert, getExpandLabel }} />
                ) : null}
                {actionCell ? <table.FlexRender cell={actionCell} /> : null}
              </div>
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
          {renderSubRow && isExpanded ? (
            <div
              id={subRowId}
              data-slot="data-table-subrow"
              className="mt-1 border-t border-border pt-2"
              onClick={(event) => event.stopPropagation()}
            >
              {renderSubRow(row.original)}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  const infiniteFooter =
    mobileInfinite && (mobileInfinite.hasMore || mobileInfinite.isLoadingMore) ? (
      <MobileInfiniteFooter config={mobileInfinite} isBusy={isBusy} />
    ) : null;

  return (
    <div className="flex flex-col gap-2 @lg:hidden">
      {sortableHeaders.length > 0 && (
        <div className="flex items-center justify-end gap-1.5 px-1">
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
              <SelectGroup>
                {sortableHeaders.map((header) => (
                  <SelectItem key={header.column.id} value={header.column.id}>
                    {stringifyHeader(header.column.columnDef.header, header.id)}
                  </SelectItem>
                ))}
              </SelectGroup>
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
              onClick={() => onSortingChange?.([{ id: activeSort.id, desc: !activeSort.desc }])}
            >
              {activeSort.desc ? <ArrowDownIcon aria-hidden /> : <ArrowUpIcon aria-hidden />}
            </Button>
          ) : null}
        </div>
      )}

      {showSkeleton ? (
        <div className="flex flex-col divide-y rounded-lg border">
          {Array.from({ length: Math.min(skeletonRowCount, 8) }, (_, index) => (
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
          {emptyState ?? <EmptyRows className="border-0 py-10" />}
        </div>
      ) : isVirtualized ? (
        <div
          ref={scrollRef}
          data-slot="data-table-card-scroll"
          role="region"
          tabIndex={0}
          aria-label={regionLabel}
          style={{ maxHeight: height }}
          className="divide-y overflow-y-auto overscroll-contain rounded-lg border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {paddingTop > 0 ? <div aria-hidden="true" style={{ height: `${paddingTop}px` }} /> : null}
          {items.map((virtualItem) => renderMobileCard(rows[virtualItem.index]!))}
          {paddingBottom > 0 ? (
            <div aria-hidden="true" style={{ height: `${paddingBottom}px` }} />
          ) : null}
          {infiniteFooter}
        </div>
      ) : (
        <>
          <div className="flex flex-col divide-y rounded-lg border">
            {rows.map((row) => renderMobileCard(row))}
          </div>
          {infiniteFooter}
        </>
      )}
    </div>
  );
}

function MobileInfiniteFooter({
  config,
  isBusy,
}: {
  config: DataTableMobileInfinite;
  isBusy: boolean;
}) {
  const { hasMore, isLoadingMore, onLoadMore, loadMoreLabel = "Load more" } = config;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = hasMore && !isLoadingMore && !isBusy;
  const onIntersection = useEffectEvent(() => {
    if (canLoadMore) onLoadMore();
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!canLoadMore || !sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onIntersection();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore]);

  return (
    <div data-slot="data-table-infinite-footer" className="flex flex-col items-center gap-2 pt-1">
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      {isLoadingMore ? (
        <div role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Spinner aria-hidden />
          <span>Loading more…</span>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!canLoadMore}
          onClick={onLoadMore}
        >
          {loadMoreLabel}
        </Button>
      )}
    </div>
  );
}
