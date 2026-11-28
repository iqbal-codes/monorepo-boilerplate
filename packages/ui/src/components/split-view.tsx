"use client";

import * as React from "react";
import { cn } from "cn";
import { XIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@monorepo-boilerplate/ui/components/resizable";
import {
  Sheet,
  SheetAction,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@monorepo-boilerplate/ui/components/sheet";
import { useIsMobile } from "@monorepo-boilerplate/ui/hooks/use-mobile";

export type DetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Controlled, router-free DetailSheet Block built on Base UI `Sheet`.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  footer,
  side = "right",
  showCloseButton = true,
  className,
  children,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={showCloseButton}
        className={cn(
          "gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full sm:max-w-md",
          className,
        )}
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className={title ? undefined : "sr-only"}>{title ?? "Details"}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
          {headerActions ? <SheetAction>{headerActions}</SheetAction> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {children}
        </div>
        {footer ? (
          <SheetFooter className="border-t border-border bg-card">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export type SplitViewProps = {
  /** Primary master/list content. */
  master: React.ReactNode;
  /** Detail content; rendered once in either the split panel (`md+`) or `DetailSheet` (`<md`). */
  detail?: React.ReactNode;
  /** Controlled open state for the detail pane/sheet. Defaults to `Boolean(detail)`. */
  detailOpen?: boolean;
  onDetailOpenChange?: (open: boolean) => void;
  detailTitle?: React.ReactNode;
  detailDescription?: React.ReactNode;
  detailHeaderActions?: React.ReactNode;
  detailFooter?: React.ReactNode;
  /** Optional empty placeholder shown in the desktop split pane when `detailOpen` is false. */
  emptyDetail?: React.ReactNode;
  /** Default master pane size on `md+` (CSS percentage string, e.g. `"60%"`). */
  masterDefaultSize?: number | string;
  masterMinSize?: number | string;
  /** Default detail pane size on `md+` (CSS percentage string, e.g. `"40%"`). */
  detailDefaultSize?: number | string;
  detailMinSize?: number | string;
  /** Shows a close button in the desktop detail pane header when `onDetailOpenChange` is provided. */
  showCloseButtonOnDesktop?: boolean;
  ariaLabel?: string;
  className?: string;
  masterClassName?: string;
  detailClassName?: string;
};

/**
 * Responsive SplitView / DetailSheet Block. Renders resizable side-by-side
 * panes on `md+` viewports and collapses to a slide-over `DetailSheet` below
 * `md` without duplicating detail content in the DOM.
 */
export function SplitView({
  master,
  detail,
  detailOpen,
  onDetailOpenChange,
  detailTitle,
  detailDescription,
  detailHeaderActions,
  detailFooter,
  emptyDetail,
  masterDefaultSize = "60%",
  masterMinSize = "35%",
  detailDefaultSize = "40%",
  detailMinSize = "25%",
  showCloseButtonOnDesktop = true,
  ariaLabel = "Split view",
  className,
  masterClassName,
  detailClassName,
}: SplitViewProps) {
  const isMobile = useIsMobile();
  const isOpen = detailOpen ?? Boolean(detail);
  const hasDetailContent = isOpen && Boolean(detail);

  if (isMobile) {
    return (
      <div data-slot="split-view" data-mode="sheet" className={cn("min-w-0", className)}>
        <div data-slot="split-view-master" className={cn("min-w-0", masterClassName)}>
          {master}
        </div>
        <DetailSheet
          open={hasDetailContent}
          onOpenChange={(next) => onDetailOpenChange?.(next)}
          title={detailTitle}
          description={detailDescription}
          headerActions={detailHeaderActions}
          footer={detailFooter}
        >
          {hasDetailContent ? detail : null}
        </DetailSheet>
      </div>
    );
  }

  const showSecondPane = hasDetailContent || Boolean(emptyDetail);

  if (!showSecondPane) {
    return (
      <div data-slot="split-view" data-mode="single" className={cn("min-w-0", className)}>
        <div data-slot="split-view-master" className={cn("min-w-0", masterClassName)}>
          {master}
        </div>
      </div>
    );
  }

  return (
    <div data-slot="split-view" data-mode="split" className={cn("min-h-0 min-w-0", className)}>
      <ResizablePanelGroup
        orientation="horizontal"
        aria-label={ariaLabel}
        className="min-h-0 min-w-0 rounded-lg border border-border"
      >
        <ResizablePanel
          defaultSize={masterDefaultSize}
          minSize={masterMinSize}
          className={cn("min-w-0 p-4", masterClassName)}
        >
          {master}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={detailDefaultSize}
          minSize={detailMinSize}
          className={cn("flex min-w-0 flex-col bg-card", detailClassName)}
        >
          {hasDetailContent ? (
            <>
              {(detailTitle ||
                detailDescription ||
                detailHeaderActions ||
                (showCloseButtonOnDesktop && onDetailOpenChange)) && (
                <div
                  data-slot="split-view-detail-header"
                  className="flex items-start justify-between gap-3 border-b border-border px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    {detailTitle ? (
                      <h3 className="font-heading text-sm font-semibold tracking-wider text-foreground uppercase">
                        {detailTitle}
                      </h3>
                    ) : null}
                    {detailDescription ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{detailDescription}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {detailHeaderActions}
                    {showCloseButtonOnDesktop && onDetailOpenChange ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Close detail pane"
                        onClick={() => onDetailOpenChange(false)}
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
              <div
                data-slot="split-view-detail"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
              >
                {detail}
              </div>
              {detailFooter ? (
                <div
                  data-slot="split-view-detail-footer"
                  className="border-t border-border bg-card px-4 py-3"
                >
                  {detailFooter}
                </div>
              ) : null}
            </>
          ) : (
            <div
              data-slot="split-view-empty"
              className="flex min-h-48 flex-1 items-center justify-center p-6"
            >
              {emptyDetail}
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
