"use client";

import * as React from "react";
import { cn } from "cn";
import { BellIcon, BellOffIcon, CheckCheckIcon, CheckIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@monorepo-boilerplate/ui/components/drawer";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@monorepo-boilerplate/ui/components/tabs";
import { useIsMobile } from "@monorepo-boilerplate/ui/hooks/use-mobile";

export type NotificationItem = {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  read: boolean;
  href?: string;
  category?: string;
};

export type NotificationCenterFilter = "all" | "unread";

export type NotificationLinkRenderer = (props: {
  item: NotificationItem;
  className: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) => React.ReactElement;

export type NotificationCenterProps = {
  items: readonly NotificationItem[];
  /** Optional explicit unread count; defaults to the count of unread items. */
  unreadCount?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  filter?: NotificationCenterFilter;
  defaultFilter?: NotificationCenterFilter;
  onFilterChange?: (filter: NotificationCenterFilter) => void;
  isLoading?: boolean;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  renderLink?: NotificationLinkRenderer;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  triggerLabel?: string;
  className?: string;
};

function formatUnreadBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Controlled, router-free Notification Center Block. Renders as a Popover on
 * `md+` viewports and a bottom Drawer below `md`.
 */
export function NotificationCenter({
  items,
  unreadCount,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  filter: controlledFilter,
  defaultFilter = "all",
  onFilterChange,
  isLoading = false,
  onMarkRead,
  onMarkAllRead,
  renderLink,
  title = "Notifications",
  emptyTitle = "You're all caught up",
  emptyDescription,
  triggerLabel = "Notifications",
  className,
}: NotificationCenterProps) {
  const isMobile = useIsMobile();

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  const [uncontrolledFilter, setUncontrolledFilter] =
    React.useState<NotificationCenterFilter>(defaultFilter);
  const filter = controlledFilter ?? uncontrolledFilter;

  const resolvedUnreadCount = React.useMemo(
    () => unreadCount ?? items.filter((item) => !item.read).length,
    [items, unreadCount],
  );
  const badgeText = resolvedUnreadCount > 0 ? formatUnreadBadge(resolvedUnreadCount) : null;

  function handleOpenChange(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  function handleFilterChange(nextFilter: NotificationCenterFilter) {
    if (controlledFilter === undefined) {
      setUncontrolledFilter(nextFilter);
    }
    onFilterChange?.(nextFilter);
  }

  const triggerAriaLabel =
    resolvedUnreadCount > 0 ? `${triggerLabel} (${resolvedUnreadCount} unread)` : triggerLabel;

  const triggerButton = (
    <Button
      type="button"
      data-slot="notification-center-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn("relative", className)}
      aria-label={triggerAriaLabel}
    >
      <BellIcon aria-hidden="true" />
      {badgeText ? (
        <span
          data-slot="notification-center-badge"
          aria-hidden="true"
          className="pointer-events-none absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center bg-destructive px-1 text-[0.625rem] leading-none font-semibold text-destructive-foreground tabular-nums"
        >
          {badgeText}
        </span>
      ) : null}
    </Button>
  );

  const markAllAction = onMarkAllRead ? (
    <Button
      type="button"
      data-slot="notification-mark-all-read"
      variant="ghost"
      size="xs"
      disabled={isLoading || resolvedUnreadCount === 0}
      onClick={onMarkAllRead}
    >
      <CheckCheckIcon aria-hidden="true" data-icon="inline-start" />
      Mark all read
    </Button>
  ) : null;

  function renderItemList(targetFilter: NotificationCenterFilter) {
    if (isLoading) {
      return (
        <div
          data-slot="notification-center-loading"
          aria-busy="true"
          className="flex flex-col divide-y divide-border"
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      );
    }

    const visibleItems = targetFilter === "unread" ? items.filter((item) => !item.read) : items;

    if (visibleItems.length === 0) {
      return (
        <Empty data-slot="notification-center-empty" className="border-0 px-4 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellOffIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {emptyDescription ??
                (targetFilter === "unread"
                  ? "No unread notifications right now."
                  : "New updates will appear here.")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <ul data-slot="notification-center-list" className="flex flex-col divide-y divide-border">
        {visibleItems.map((item) => {
          const itemBody = (
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                {!item.read ? (
                  <span
                    data-slot="notification-unread-dot"
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-info"
                  />
                ) : null}
                <span
                  className={cn(
                    "min-w-0 truncate text-sm",
                    item.read ? "font-normal text-foreground" : "font-semibold text-foreground",
                  )}
                >
                  {item.title}
                </span>
              </span>
              {item.description ? (
                <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
              <span className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted-foreground">
                <span>{item.timestamp}</span>
                {item.category ? <Badge variant="secondary">{item.category}</Badge> : null}
              </span>
            </span>
          );

          const handleNavigate = () => {
            if (!item.read) {
              onMarkRead?.(item.id);
            }
            handleOpenChange(false);
          };

          const linkClassName =
            "flex min-w-0 flex-1 items-start text-left transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

          return (
            <li
              key={item.id}
              data-slot="notification-item"
              data-unread={item.read ? undefined : ""}
              className={cn(
                "flex items-start justify-between gap-2 px-4 py-3 transition-colors",
                !item.read && "bg-muted/35",
              )}
            >
              {item.href ? (
                renderLink ? (
                  renderLink({
                    item,
                    className: linkClassName,
                    children: itemBody,
                    onNavigate: handleNavigate,
                  })
                ) : (
                  <a href={item.href} className={linkClassName} onClick={handleNavigate}>
                    {itemBody}
                  </a>
                )
              ) : (
                <div className="flex min-w-0 flex-1 items-start">{itemBody}</div>
              )}

              {!item.read && onMarkRead ? (
                <Button
                  type="button"
                  data-slot="notification-mark-read"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Mark "${item.title}" as read`}
                  title="Mark as read"
                  onClick={() => onMarkRead(item.id)}
                >
                  <CheckIcon aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  const panelBody = (
    <Tabs
      value={filter}
      onValueChange={(value) => handleFilterChange(value as NotificationCenterFilter)}
      className="min-h-0 flex-1 gap-0"
    >
      <div className="border-b border-border px-4 py-2">
        <TabsList className="w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread{badgeText ? ` (${badgeText})` : ""}</TabsTrigger>
        </TabsList>
      </div>
      <div className="max-h-[min(60dvh,24rem)] min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <TabsContent value="all">{renderItemList("all")}</TabsContent>
        <TabsContent value="unread">{renderItemList("unread")}</TabsContent>
      </div>
    </Tabs>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} swipeDirection="down">
        <DrawerTrigger render={triggerButton} />
        <DrawerContent
          data-slot="notification-center-drawer"
          showCloseButton
          className="max-h-[85dvh]"
        >
          <DrawerHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between gap-2 pe-8">
              <DrawerTitle>{title}</DrawerTitle>
              {markAllAction}
            </div>
            <DrawerDescription className="sr-only">
              Recent notifications and unread updates.
            </DrawerDescription>
          </DrawerHeader>
          {panelBody}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={triggerButton} />
      <PopoverContent
        data-slot="notification-center-popover"
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] gap-0 p-0"
      >
        <PopoverHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <PopoverTitle>{title}</PopoverTitle>
            <PopoverDescription className="sr-only">
              Recent notifications and unread updates.
            </PopoverDescription>
          </div>
          {markAllAction}
        </PopoverHeader>
        {panelBody}
      </PopoverContent>
    </Popover>
  );
}
