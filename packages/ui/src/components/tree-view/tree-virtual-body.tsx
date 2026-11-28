"use client";

import * as React from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { cn } from "cn";

import { TreeRow } from "./tree-row";
import type {
  FlattenedTreeItem,
  TreeNodeRenderContext,
  TreeSelectionMode,
  TreeVirtualizationOptions,
} from "./types";

export type TreeVirtualBodyHandle = {
  scrollToIndex: (index: number) => void;
};

export const TreeVirtualBody = React.forwardRef(function TreeVirtualBody<TMeta>(
  {
    items,
    options,
    ariaLabel,
    selectionMode,
    selectedIds,
    loadingIds,
    activeNodeId,
    setItemRef,
    onToggleExpand,
    onSelectOrActivate,
    onKeyDown,
    onFocus,
    renderNodeContent,
    className,
  }: {
    items: readonly FlattenedTreeItem<TMeta>[];
    options: TreeVirtualizationOptions;
    ariaLabel: string;
    selectionMode: TreeSelectionMode;
    selectedIds: ReadonlySet<string>;
    loadingIds: ReadonlySet<string>;
    activeNodeId: string | null;
    setItemRef: (nodeId: string, element: HTMLDivElement | null) => void;
    onToggleExpand: (item: FlattenedTreeItem<TMeta>) => void;
    onSelectOrActivate: (item: FlattenedTreeItem<TMeta>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, item: FlattenedTreeItem<TMeta>) => void;
    onFocus: (nodeId: string) => void;
    renderNodeContent?: (context: TreeNodeRenderContext<TMeta>) => React.ReactNode;
    className?: string;
  },
  ref: React.ForwardedRef<TreeVirtualBodyHandle>,
) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const height = options.height ?? 360;
  const estimateSize = options.estimateSize ?? 36;
  const overscan = options.overscan ?? 6;
  const resolvedNumericHeight =
    typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 360;
  const resolvedHeightStyle = typeof height === "number" ? `${height}px` : height;

  const activeIndex = React.useMemo(
    () => (activeNodeId ? items.findIndex((item) => item.node.id === activeNodeId) : -1),
    [activeNodeId, items],
  );

  const rangeExtractor = React.useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !indexes.includes(activeIndex)) {
        indexes.push(activeIndex);
        indexes.sort((a, b) => a - b);
      }
      return indexes;
    },
    [activeIndex],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    getItemKey: (index) => items[index]!.node.id,
    overscan,
    rangeExtractor,
    initialRect: { width: 480, height: resolvedNumericHeight },
  });

  React.useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index: number) => {
        if (index >= 0 && index < items.length) {
          virtualizer.scrollToIndex(index, { align: "auto" });
        }
      },
    }),
    [items.length, virtualizer],
  );

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label={ariaLabel}
      aria-multiselectable={selectionMode === "multiple" ? "true" : undefined}
      data-slot="tree-view"
      data-virtualized="true"
      style={{ height: resolvedHeightStyle }}
      className={cn(
        "relative w-full overflow-y-auto overscroll-contain border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div
        role="presentation"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]!;
          const nodeId = item.node.id;
          return (
            <TreeRow
              key={virtualItem.key}
              item={item}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(nodeId)}
              isLoading={loadingIds.has(nodeId)}
              isFocused={nodeId === activeNodeId}
              setItemRef={setItemRef}
              onToggleExpand={onToggleExpand}
              onSelectOrActivate={onSelectOrActivate}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              renderNodeContent={renderNodeContent}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="border-b border-border/50"
            />
          );
        })}
      </div>
    </div>
  );
}) as <TMeta>(props: {
  items: readonly FlattenedTreeItem<TMeta>[];
  options: TreeVirtualizationOptions;
  ariaLabel: string;
  selectionMode: TreeSelectionMode;
  selectedIds: ReadonlySet<string>;
  loadingIds: ReadonlySet<string>;
  activeNodeId: string | null;
  setItemRef: (nodeId: string, element: HTMLDivElement | null) => void;
  onToggleExpand: (item: FlattenedTreeItem<TMeta>) => void;
  onSelectOrActivate: (item: FlattenedTreeItem<TMeta>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, item: FlattenedTreeItem<TMeta>) => void;
  onFocus: (nodeId: string) => void;
  renderNodeContent?: (context: TreeNodeRenderContext<TMeta>) => React.ReactNode;
  className?: string;
  ref?: React.Ref<TreeVirtualBodyHandle>;
}) => React.ReactElement;
