import type { ReactTable, Row, RowData } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import type {
  DataTableFeatures,
  DataTableProps,
  DataTableVirtualizationOptions,
} from "../data-table";

export type ViewportProps<TData extends RowData> = Pick<
  DataTableProps<TData>,
  | "density"
  | "emptyState"
  | "getExpandLabel"
  | "onRowClick"
  | "onSortingChange"
  | "regionLabel"
  | "renderSubRow"
  | "rowClassName"
> & {
  table: ReactTable<DataTableFeatures, TData>;
  rows: readonly Row<DataTableFeatures, TData>[];
  tableId: string;
  rowsInert: boolean;
  hasExpanderColumn: boolean;
  skeletonRowCount: number;
  showSkeleton: boolean;
  virtualization: DataTableVirtualizationOptions | undefined;
  pageSelection: ReturnType<typeof createPageSelection<TData>>;
};

export function createPageSelection<TData extends RowData>(
  rows: readonly Row<DataTableFeatures, TData>[],
  selection: DataTableProps<TData>["selection"],
  rowsInert: boolean,
) {
  if (!selection) return;
  const pageIds = rows
    .filter((row) => selection.canSelect?.(row.original) !== false)
    .map((row) => selection.getId(row.original));
  const selectedCount = pageIds.filter((id) => selection.ids.has(id)).length;
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

  return {
    selection,
    pageIds,
    allSelected,
    indeterminate: selectedCount > 0 && !allSelected,
    changeSelection,
  };
}

export function EmptyRows({ className }: { className: string }) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LoaderIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>No results</EmptyTitle>
        <EmptyDescription>
          Nothing matches the current filters. Adjust them and try again.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function stringifyHeader(header: unknown, fallback: string): string {
  return typeof header === "string" ? header : fallback;
}

export function ExpandToggle<TData extends RowData>({
  row,
  subRowId,
  rowsInert,
  getExpandLabel,
}: {
  row: Row<DataTableFeatures, TData>;
  subRowId: string;
  rowsInert: boolean;
  getExpandLabel: DataTableProps<TData>["getExpandLabel"];
}) {
  if (!row.getCanExpand()) return null;
  const isExpanded = row.getIsExpanded();
  const label = getExpandLabel
    ? getExpandLabel(row.original, isExpanded)
    : isExpanded
      ? "Collapse row"
      : "Expand row";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      data-slot="data-table-expand-toggle"
      aria-expanded={isExpanded}
      aria-controls={isExpanded ? subRowId : undefined}
      aria-label={label}
      disabled={rowsInert}
      onClick={(event) => {
        event.stopPropagation();
        row.getToggleExpandedHandler()();
      }}
    >
      {isExpanded ? (
        <ChevronDownIcon aria-hidden="true" />
      ) : (
        <ChevronRightIcon aria-hidden="true" />
      )}
    </Button>
  );
}
