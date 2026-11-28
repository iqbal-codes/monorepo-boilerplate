"use client";

import * as React from "react";
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type VirtualItem,
} from "@tanstack/react-virtual";
import { cn } from "cn";

import { TreeRow } from "./tree-row";
import { groupTreeRows } from "./utils";
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

  const indexesById = React.useMemo(
    () => new Map(items.map(({ node }, index) => [node.id, index])),
    [items],
  );
  const rangeExtractor = React.useCallback(
    (range: Range) => {
      const indexes = new Set(defaultRangeExtractor(range));
      if (activeIndex >= 0) indexes.add(activeIndex);
      // Only retain ancestors of mounted or focused rows, not their siblings.
      for (const index of indexes) {
        const parentId = items[index]!.parentId;
        const parentIndex = parentId !== null ? indexesById.get(parentId) : undefined;
        if (parentIndex !== undefined) indexes.add(parentIndex);
      }
      return [...indexes].sort((a, b) => a - b);
    },
    [activeIndex, indexesById, items],
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

  const rowsByParent = groupTreeRows(
    virtualizer.getVirtualItems(),
    ({ index }) => items[index]!.parentId,
  );

  function renderRows(parentId: string | null, parentRow?: VirtualItem): React.ReactNode {
    return rowsByParent.get(parentId)?.map((virtualItem) => {
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
            top: virtualItem.start - (parentRow?.start ?? 0),
            insetInline: 0,
            height: `${virtualItem.size}px`,
          }}
          className="border-b border-border/50"
        >
          {renderRows(nodeId, virtualItem)}
        </TreeRow>
      );
    });
  }

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
        {renderRows(null)}
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
