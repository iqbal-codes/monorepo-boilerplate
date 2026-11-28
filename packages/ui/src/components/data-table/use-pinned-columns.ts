import * as React from "react";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { cn } from "cn";
import type { DataTableFeatures } from "../data-table";

export function usePinnedColumns<TData extends RowData>(
  table: ReactTable<DataTableFeatures, TData>,
  selection: boolean,
  hasExpanderColumn: boolean,
) {
  const tableHostRef = React.useRef<HTMLDivElement>(null);
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>({});
  const startPinnedIds = table.getStartVisibleLeafColumns().map((c) => c.id);
  const endPinnedIds = table.getEndVisibleLeafColumns().map((c) => c.id);
  const hasPinnedColumns = startPinnedIds.length > 0 || endPinnedIds.length > 0;
  const headerGroups = table.getHeaderGroups();
  // Reattach when React changes the header nodes (visibility/grouping/pinning).
  const headerSignature = JSON.stringify([
    Boolean(selection),
    hasExpanderColumn,
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
    let leftCursor =
      startPinnedIds.length > 0
        ? (selection ? (columnWidths.__selection ?? 40) : 0) +
          (hasExpanderColumn ? (columnWidths.__expander ?? 40) : 0)
        : 0;
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
  }, [columnWidths, endPinnedIds, hasExpanderColumn, selection, startPinnedIds]);
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
  return {
    tableHostRef,
    headerGroups,
    hasStartPinned: startPinnedIds.length > 0,
    expanderOffset: selection ? (columnWidths.__selection ?? 40) : 0,
    pinnedCellProps,
  };
}
