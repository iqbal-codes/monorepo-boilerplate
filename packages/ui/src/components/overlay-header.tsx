import * as React from "react";
import { cn } from "cn";

import { Button } from "@monorepo-boilerplate/ui/components/button";

export type OverlaySurface = "sheet" | "dialog" | "drawer";

const HEADER_SURFACE_CLASSES: Record<OverlaySurface, string> = {
  sheet:
    "gap-1.5 px-5 pt-5 pb-4 sm:px-6 sm:pt-6 sm:pb-5 [.border-b]:pb-4 sm:[.border-b]:pb-5 has-data-[slot=sheet-action]:grid-cols-[minmax(0,1fr)_auto] has-data-[slot=sheet-action]:gap-x-3",
  dialog:
    "gap-2 [.border-b]:pb-4 has-data-[slot=dialog-action]:grid-cols-[minmax(0,1fr)_auto] has-data-[slot=dialog-action]:gap-x-3",
  drawer:
    "shrink-0 gap-1 p-4 pb-0 text-start md:gap-2 [.border-b]:pb-4 has-data-[slot=drawer-action]:grid-cols-[minmax(0,1fr)_auto] has-data-[slot=drawer-action]:gap-x-3",
};

const CLOSE_CLEARANCE_CLASSES: Record<OverlaySurface, string> = {
  sheet: "[&:not(.sr-only)]:pe-16 sm:[&:not(.sr-only)]:pe-18",
  dialog: "[&:not(.sr-only)]:pe-12",
  drawer: "[&:not(.sr-only)]:pe-16",
};

const CLOSE_POSITION_CLASSES: Record<OverlaySurface, string> = {
  sheet: "top-4 end-5 sm:top-5 sm:end-6",
  dialog: "top-5 end-6",
  drawer: "top-3 end-4",
};

const ACTION_ROW_SPAN_CLASSES: Record<OverlaySurface, string> = {
  sheet: "group-has-data-[slot=sheet-description]/overlay-header:row-span-2",
  dialog: "group-has-data-[slot=dialog-description]/overlay-header:row-span-2",
  drawer: "group-has-data-[slot=drawer-description]/overlay-header:row-span-2",
};

type OverlayHeaderProps = React.ComponentProps<"div"> & {
  surface: OverlaySurface;
  hasCloseButton?: boolean;
};

/**
 * Shared header layout for sheets, dialogs, and drawers.
 * Reserves trailing space when the overlay renders a corner close button and
 * aligns optional header actions in a dedicated trailing track.
 */
function OverlayHeader({
  surface,
  hasCloseButton = false,
  className,
  ...props
}: OverlayHeaderProps) {
  return (
    <div
      data-slot={`${surface}-header`}
      className={cn(
        "group/overlay-header grid min-w-0 auto-rows-min grid-cols-[minmax(0,1fr)] items-start",
        HEADER_SURFACE_CLASSES[surface],
        hasCloseButton && CLOSE_CLEARANCE_CLASSES[surface],
        className,
      )}
      {...props}
    />
  );
}

type OverlayActionProps = React.ComponentProps<"div"> & {
  surface: OverlaySurface;
};

function OverlayHeaderAction({ surface, className, ...props }: OverlayActionProps) {
  return (
    <div
      data-slot={`${surface}-action`}
      className={cn(
        "col-start-2 row-start-1 flex shrink-0 items-center gap-2 self-start justify-self-end",
        ACTION_ROW_SPAN_CLASSES[surface],
        className,
      )}
      {...props}
    />
  );
}

function OverlayCloseButtonVisual({
  surface,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { surface: OverlaySurface }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("absolute z-10 bg-secondary", CLOSE_POSITION_CLASSES[surface], className)}
      {...props}
    />
  );
}

export { OverlayCloseButtonVisual, OverlayHeader, OverlayHeaderAction };
