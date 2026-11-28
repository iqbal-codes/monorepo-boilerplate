"use client";

import * as React from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { cn } from "cn";
import { InboxIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";

export type VirtualListItemContext<TItem> = {
  item: TItem;
  index: number;
  isActive: boolean;
};

export type VirtualListProps<TItem> = {
  items: readonly TItem[];
  /** Fixed or estimated item height in pixels. */
  estimateSize: number | ((index: number, item: TItem) => number);
  /** Render callback for each visible virtual item. */
  renderItem: (context: VirtualListItemContext<TItem>) => React.ReactNode;
  /** Stable key extractor; defaults to row index. */
  getItemKey?: (item: TItem, index: number) => string | number;
  /** Scroll viewport height (number in px or CSS length). Defaults to `360`. */
  height?: number | string;
  /** Extra items rendered outside the visible viewport. Defaults to `5`. */
  overscan?: number;
  /** Vertical gap in pixels between items. Defaults to `0`. */
  gap?: number;
  /** Measure actual DOM item heights for variable-height rows. */
  measureDynamic?: boolean;
  /** Initial loading skeleton state. */
  isLoading?: boolean;
  /** Number of skeleton placeholders to render while loading. */
  loadingCount?: number;
  /** Custom skeleton item renderer. */
  renderSkeleton?: (index: number) => React.ReactNode;
  /** Custom empty slot when `items` is empty and not loading. */
  emptyState?: React.ReactNode;
  /** Accessible label for the scrollable list region/listbox. */
  ariaLabel?: string;
  /** Controlled active item index for keyboard navigation. */
  activeIndex?: number;
  /** Initial active item index for uncontrolled keyboard navigation. */
  defaultActiveIndex?: number;
  /** Called when keyboard navigation or item click changes the active index. */
  onActiveIndexChange?: (index: number) => void;
  /** Called when an item is activated via Enter/Space or click. */
  onItemActivate?: (item: TItem, index: number) => void;
  className?: string;
  listClassName?: string;
  itemClassName?: string;
};

function resolveNumericHeight(height: number | string): number {
  return typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 360;
}

/**
 * Controlled, router-free virtualized list block backed by `@tanstack/react-virtual`
 * and isolated behind `@monorepo-boilerplate/ui/components/virtual-list`.
 */
export function VirtualList<TItem>({
  items,
  estimateSize,
  renderItem,
  getItemKey,
  height = 360,
  overscan = 5,
  gap = 0,
  measureDynamic = false,
  isLoading = false,
  loadingCount = 6,
  renderSkeleton,
  emptyState,
  ariaLabel = "Virtualized list",
  activeIndex: controlledActiveIndex,
  defaultActiveIndex = -1,
  onActiveIndexChange,
  onItemActivate,
  className,
  listClassName,
  itemClassName,
}: VirtualListProps<TItem>) {
  const listId = React.useId();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [uncontrolledActiveIndex, setUncontrolledActiveIndex] =
    React.useState<number>(defaultActiveIndex);

  const isInteractive =
    controlledActiveIndex !== undefined ||
    onActiveIndexChange !== undefined ||
    onItemActivate !== undefined;

  const activeIndex = controlledActiveIndex ?? uncontrolledActiveIndex;
  const hasActiveOption = isInteractive && activeIndex >= 0 && activeIndex < items.length;
  const rangeExtractor = React.useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      // Keyboard focus stays on the same option when a pointer scrolls the list.
      // Keep only that extra option mounted, not the intervening items.
      if (hasActiveOption && !indexes.includes(activeIndex)) {
        indexes.push(activeIndex);
        indexes.sort((a, b) => a - b);
      }
      return indexes;
    },
    [activeIndex, hasActiveOption],
  );
  const resolvedNumericHeight = resolveNumericHeight(height);
  const resolvedHeightStyle = typeof height === "number" ? `${height}px` : height;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      typeof estimateSize === "function" ? estimateSize(index, items[index]!) : estimateSize,
    getItemKey: getItemKey ? (index) => getItemKey(items[index]!, index) : undefined,
    overscan,
    rangeExtractor,
    gap,
    initialRect: { width: 640, height: resolvedNumericHeight },
  });

  const virtualItems = virtualizer.getVirtualItems();
  const activeDescendantId =
    hasActiveOption && virtualItems.some((item) => item.index === activeIndex)
      ? `${listId}-item-${activeIndex}`
      : undefined;

  function updateActiveIndex(nextIndex: number, scrollIntoView = true) {
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(items.length - 1, nextIndex));
    if (controlledActiveIndex === undefined) {
      setUncontrolledActiveIndex(clamped);
    }
    onActiveIndexChange?.(clamped);
    if (scrollIntoView) {
      virtualizer.scrollToIndex(clamped, { align: "auto" });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isInteractive || items.length === 0) return;
    if (event.target !== event.currentTarget) return;

    const current = activeIndex >= 0 && activeIndex < items.length ? activeIndex : 0;
    const approxStep = Math.max(
      1,
      Math.floor(
        resolvedNumericHeight / Math.max(24, typeof estimateSize === "number" ? estimateSize : 44),
      ),
    );

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = activeIndex < 0 ? 0 : Math.min(items.length - 1, current + 1);
        updateActiveIndex(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const next = activeIndex < 0 ? 0 : Math.max(0, current - 1);
        updateActiveIndex(next);
        break;
      }
      case "PageDown": {
        event.preventDefault();
        updateActiveIndex(Math.min(items.length - 1, current + approxStep));
        break;
      }
      case "PageUp": {
        event.preventDefault();
        updateActiveIndex(Math.max(0, current - approxStep));
        break;
      }
      case "Home": {
        event.preventDefault();
        updateActiveIndex(0);
        break;
      }
      case "End": {
        event.preventDefault();
        updateActiveIndex(items.length - 1);
        break;
      }
      case "Enter":
      case " ": {
        if (activeDescendantId) {
          event.preventDefault();
          virtualizer.scrollToIndex(activeIndex, { align: "auto" });
          onItemActivate?.(items[activeIndex]!, activeIndex);
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
        data-slot="virtual-list"
        data-state="loading"
        aria-busy="true"
        aria-label={ariaLabel}
        style={{ maxHeight: resolvedHeightStyle }}
        className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
      >
        <div className="flex flex-col divide-y divide-border">
          {Array.from({ length: Math.max(1, loadingCount) }, (_, index) => (
            <div key={`virtual-skeleton-${index}`} className="px-3 py-2.5">
              {renderSkeleton ? (
                renderSkeleton(index)
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        data-slot="virtual-list"
        data-state="empty"
        className={cn("rounded-lg border border-border bg-card", className)}
      >
        {emptyState ?? (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No items</EmptyTitle>
              <EmptyDescription>There are no entries to display.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-slot="virtual-list"
      data-interactive={isInteractive ? "true" : undefined}
      role={isInteractive ? "listbox" : "region"}
      aria-label={ariaLabel}
      aria-activedescendant={activeDescendantId}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ height: resolvedHeightStyle }}
      className={cn(
        "relative w-full overflow-y-auto overscroll-contain rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <div
        role={isInteractive ? "presentation" : "list"}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
        className={listClassName}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index]!;
          const isActive = isInteractive && virtualItem.index === activeIndex;
          return (
            <div
              key={virtualItem.key}
              id={`${listId}-item-${virtualItem.index}`}
              ref={measureDynamic ? virtualizer.measureElement : undefined}
              data-index={virtualItem.index}
              data-slot="virtual-list-item"
              data-active={isActive ? "true" : undefined}
              role={isInteractive ? "option" : "listitem"}
              aria-selected={isInteractive ? isActive : undefined}
              aria-posinset={virtualItem.index + 1}
              aria-setsize={items.length}
              onClick={
                isInteractive
                  ? () => {
                      updateActiveIndex(virtualItem.index, false);
                      onItemActivate?.(item, virtualItem.index);
                    }
                  : undefined
              }
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className={cn(
                "border-b border-border/70 transition-colors",
                isInteractive && "cursor-pointer hover:bg-muted/50",
                isActive && "bg-muted",
                itemClassName,
              )}
            >
              {renderItem({ item, index: virtualItem.index, isActive })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
