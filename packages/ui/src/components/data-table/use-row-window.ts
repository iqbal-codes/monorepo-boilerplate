import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { DataTableDensity, DataTableVirtualizationOptions } from "../data-table";

export function useRowWindow(
  count: number,
  options: DataTableVirtualizationOptions | undefined,
  density: DataTableDensity | undefined,
  cardLayout = false,
) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const height = options?.height ?? 480;
  const initialHeight =
    typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 480;
  const rowHeight = options?.estimateRowHeight ?? (density === "compact" ? 36 : 44);
  const virtualizer = useVirtualizer({
    enabled: options !== undefined,
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight + (cardLayout ? 36 : 0),
    overscan: options?.overscan ?? 8,
    initialRect: { width: cardLayout ? 320 : 800, height: initialHeight },
  });

  const items = virtualizer.getVirtualItems();
  // An initially hidden container query branch reports a zero-height viewport.
  // Keep its estimated extent even with no window, so showing it gives the
  // ResizeObserver a non-zero client height and repopulates the window.
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0));
  return { scrollRef, height, items, paddingTop, paddingBottom };
}
