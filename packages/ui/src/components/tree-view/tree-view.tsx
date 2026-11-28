"use client";

import * as React from "react";
import { cn } from "cn";
import { FolderTreeIcon, SearchXIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { TreeRow } from "./tree-row";
import { TreeVirtualBody, type TreeVirtualBodyHandle } from "./tree-virtual-body";
import type { FlattenedTreeItem, TreeNode, TreeViewProps } from "./types";
import {
  collectExpandableIds,
  filterTreeNodes,
  flattenVisibleTree,
  getResolvedChildren,
  toIdSet,
} from "./utils";

/**
 * Controlled, router-free Tree View block implementing WAI-ARIA `role="tree"` /
 * `role="treeitem"` / roving tabindex keyboard navigation, single/multi selection,
 * async lazy-loading branches, search filtering, and optional TanStack Virtual
 * row virtualization.
 */
export function TreeView<TMeta = unknown>({
  nodes,
  expandedIds: controlledExpandedIds,
  defaultExpandedIds,
  onExpandedIdsChange,
  selectedIds: controlledSelectedIds,
  defaultSelectedIds,
  onSelectedIdsChange,
  selectionMode = "single",
  onNodeActivate,
  onLoadChildren,
  loadingNodeIds: externalLoadingNodeIds,
  searchQuery = "",
  isLoading = false,
  loadingCount = 6,
  emptyState,
  searchEmptyState,
  virtualized = false,
  renderNodeContent,
  ariaLabel = "Tree view",
  className,
}: TreeViewProps<TMeta>) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = React.useState<Set<string>>(() =>
    toIdSet(defaultExpandedIds),
  );
  const [uncontrolledSelected, setUncontrolledSelected] = React.useState<Set<string>>(() =>
    toIdSet(defaultSelectedIds),
  );
  const [loadedChildren, setLoadedChildren] = React.useState<
    Map<string, readonly TreeNode<TMeta>[]>
  >(() => new Map());
  const [internalLoadingIds, setInternalLoadingIds] = React.useState<Set<string>>(() => new Set());

  const itemRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingFocusIdRef = React.useRef<string | null>(null);
  const virtualHandleRef = React.useRef<TreeVirtualBodyHandle>(null);

  const expandedIds = React.useMemo(
    () =>
      controlledExpandedIds !== undefined ? toIdSet(controlledExpandedIds) : uncontrolledExpanded,
    [controlledExpandedIds, uncontrolledExpanded],
  );

  const selectedIds = React.useMemo(
    () =>
      controlledSelectedIds !== undefined ? toIdSet(controlledSelectedIds) : uncontrolledSelected,
    [controlledSelectedIds, uncontrolledSelected],
  );

  const loadingIds = React.useMemo(() => {
    if (!externalLoadingNodeIds && internalLoadingIds.size === 0) {
      return internalLoadingIds;
    }
    const merged = new Set(internalLoadingIds);
    if (externalLoadingNodeIds) {
      for (const id of externalLoadingNodeIds) {
        merged.add(id);
      }
    }
    return merged;
  }, [externalLoadingNodeIds, internalLoadingIds]);

  const trimmedQuery = searchQuery.trim();
  const displayNodes = React.useMemo(
    () => (trimmedQuery ? filterTreeNodes(nodes, trimmedQuery, loadedChildren) : nodes),
    [loadedChildren, nodes, trimmedQuery],
  );

  const effectiveExpandedIds = React.useMemo(() => {
    if (!trimmedQuery) return expandedIds;
    const merged = new Set(expandedIds);
    for (const id of collectExpandableIds(displayNodes, loadedChildren)) {
      merged.add(id);
    }
    return merged;
  }, [displayNodes, expandedIds, loadedChildren, trimmedQuery]);

  const visibleItems = React.useMemo(
    () => flattenVisibleTree(displayNodes, effectiveExpandedIds, loadedChildren),
    [displayNodes, effectiveExpandedIds, loadedChildren],
  );

  const [focusedId, setFocusedId] = React.useState<string | null>(
    () => visibleItems[0]?.node.id ?? null,
  );

  const activeNodeId = React.useMemo(() => {
    if (visibleItems.length === 0) return null;
    if (focusedId && visibleItems.some((item) => item.node.id === focusedId)) {
      return focusedId;
    }
    const firstSelected = visibleItems.find((item) => selectedIds.has(item.node.id));
    return firstSelected?.node.id ?? visibleItems[0]!.node.id;
  }, [focusedId, selectedIds, visibleItems]);

  React.useLayoutEffect(() => {
    const targetId = pendingFocusIdRef.current;
    if (!targetId) return;
    const targetEl = itemRefs.current.get(targetId);
    if (targetEl) {
      pendingFocusIdRef.current = null;
      targetEl.focus();
    }
  });

  const setItemRef = React.useCallback((nodeId: string, element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(nodeId, element);
    } else {
      itemRefs.current.delete(nodeId);
    }
  }, []);

  function commitExpandedIds(next: Set<string>) {
    if (controlledExpandedIds === undefined) {
      setUncontrolledExpanded(next);
    }
    onExpandedIdsChange?.(next);
  }

  function commitSelectedIds(next: Set<string>) {
    if (controlledSelectedIds === undefined) {
      setUncontrolledSelected(next);
    }
    onSelectedIdsChange?.(next);
  }

  function focusIndex(index: number) {
    if (index < 0 || index >= visibleItems.length) return;
    const nextId = visibleItems[index]!.node.id;
    setFocusedId(nextId);
    pendingFocusIdRef.current = nextId;
    virtualHandleRef.current?.scrollToIndex(index);
    const el = itemRefs.current.get(nextId);
    if (el) {
      pendingFocusIdRef.current = null;
      el.focus();
    }
  }

  function focusNodeById(nodeId: string) {
    const index = visibleItems.findIndex((item) => item.node.id === nodeId);
    if (index >= 0) {
      focusIndex(index);
    }
  }

  async function setNodeExpanded(item: FlattenedTreeItem<TMeta>, nextExpanded: boolean) {
    const { node, isBranch } = item;
    if (!isBranch || node.disabled) return;

    const next = new Set(expandedIds);
    if (nextExpanded) {
      next.add(node.id);
    } else {
      next.delete(node.id);
    }
    commitExpandedIds(next);

    const existingChildren = getResolvedChildren(node, loadedChildren);
    const needsLazyLoad =
      nextExpanded &&
      Boolean(node.hasChildren) &&
      (!existingChildren || existingChildren.length === 0) &&
      onLoadChildren !== undefined &&
      !internalLoadingIds.has(node.id);

    if (!needsLazyLoad) return;

    setInternalLoadingIds((prev) => new Set(prev).add(node.id));
    try {
      const result = await onLoadChildren(node);
      if (Array.isArray(result)) {
        setLoadedChildren((prev) => {
          const nextMap = new Map(prev);
          nextMap.set(node.id, result);
          return nextMap;
        });
      }
    } finally {
      setInternalLoadingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(node.id);
        return nextSet;
      });
    }
  }

  function handleToggleExpand(item: FlattenedTreeItem<TMeta>) {
    void setNodeExpanded(item, !item.isExpanded);
  }

  function applySelection(node: TreeNode<TMeta>) {
    if (node.disabled || selectionMode === "none") return;

    if (selectionMode === "single") {
      commitSelectedIds(new Set([node.id]));
      return;
    }

    const next = new Set(selectedIds);
    if (next.has(node.id)) {
      next.delete(node.id);
    } else {
      next.add(node.id);
    }
    commitSelectedIds(next);
  }

  function handleSelectOrActivate(item: FlattenedTreeItem<TMeta>) {
    if (item.node.disabled) return;
    if (selectionMode === "none") {
      if (item.isBranch) {
        handleToggleExpand(item);
      }
      onNodeActivate?.(item.node);
      return;
    }
    applySelection(item.node);
    onNodeActivate?.(item.node);
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    item: FlattenedTreeItem<TMeta>,
  ) {
    const currentIndex = visibleItems.findIndex((entry) => entry.node.id === item.node.id);
    if (currentIndex < 0) return;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (currentIndex + 1 < visibleItems.length) {
          focusIndex(currentIndex + 1);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (currentIndex - 1 >= 0) {
          focusIndex(currentIndex - 1);
        }
        break;
      }
      case "ArrowRight": {
        event.preventDefault();
        if (item.node.disabled || !item.isBranch) return;
        if (!item.isExpanded) {
          void setNodeExpanded(item, true);
        } else {
          const children = getResolvedChildren(item.node, loadedChildren);
          if (children && children.length > 0 && currentIndex + 1 < visibleItems.length) {
            focusIndex(currentIndex + 1);
          }
        }
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        if (item.isBranch && item.isExpanded && !item.node.disabled) {
          void setNodeExpanded(item, false);
        } else if (item.parentId !== null) {
          focusNodeById(item.parentId);
        }
        break;
      }
      case "Home": {
        event.preventDefault();
        focusIndex(0);
        break;
      }
      case "End": {
        event.preventDefault();
        focusIndex(visibleItems.length - 1);
        break;
      }
      case " ": {
        event.preventDefault();
        if (!item.node.disabled) {
          applySelection(item.node);
        }
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (!item.node.disabled) {
          handleSelectOrActivate(item);
        }
        break;
      }
      default:
        break;
    }
  }

  if (isLoading) {
    return (
      <div
        data-slot="tree-view"
        data-state="loading"
        aria-busy="true"
        aria-label={ariaLabel}
        className={cn(
          "flex flex-col divide-y divide-border border border-border bg-card",
          className,
        )}
      >
        {Array.from({ length: Math.max(1, loadingCount) }, (_, index) => (
          <div
            key={`tree-skeleton-${index}`}
            style={{ paddingInlineStart: `${(index % 3) * 18 + 12}px` }}
            className="flex min-h-9 items-center gap-2 pe-3"
          >
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="h-3.5 w-40 max-w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div
        data-slot="tree-view"
        data-state="empty"
        className={cn("border border-border bg-card", className)}
      >
        {emptyState ?? (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderTreeIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No nodes</EmptyTitle>
              <EmptyDescription>There are no tree items to display.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }

  if (trimmedQuery && visibleItems.length === 0) {
    return (
      <div data-slot="tree-search-empty" className={cn("border border-border bg-card", className)}>
        {searchEmptyState ?? (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No matching nodes</EmptyTitle>
              <EmptyDescription>
                No tree items matched “{trimmedQuery}”. Try a different search term.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }

  if (virtualized) {
    const virtualOptions = typeof virtualized === "object" ? virtualized : {};
    return (
      <TreeVirtualBody
        ref={virtualHandleRef}
        items={visibleItems}
        options={virtualOptions}
        ariaLabel={ariaLabel}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        loadingIds={loadingIds}
        activeNodeId={activeNodeId}
        setItemRef={setItemRef}
        onToggleExpand={handleToggleExpand}
        onSelectOrActivate={handleSelectOrActivate}
        onKeyDown={handleKeyDown}
        onFocus={setFocusedId}
        renderNodeContent={renderNodeContent}
        className={className}
      />
    );
  }

  return (
    <div
      role="tree"
      aria-label={ariaLabel}
      aria-multiselectable={selectionMode === "multiple" ? "true" : undefined}
      data-slot="tree-view"
      className={cn(
        "flex w-full min-w-0 flex-col divide-y divide-border/50 border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {visibleItems.map((item) => {
        const nodeId = item.node.id;
        return (
          <TreeRow
            key={nodeId}
            item={item}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(nodeId)}
            isLoading={loadingIds.has(nodeId)}
            isFocused={nodeId === activeNodeId}
            setItemRef={setItemRef}
            onToggleExpand={handleToggleExpand}
            onSelectOrActivate={handleSelectOrActivate}
            onKeyDown={handleKeyDown}
            onFocus={setFocusedId}
            renderNodeContent={renderNodeContent}
          />
        );
      })}
    </div>
  );
}
