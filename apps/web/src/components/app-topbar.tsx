import { Link, useRouterState } from "@tanstack/react-router";
import { MoonIcon, SearchIcon, SunIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@monorepo-boilerplate/ui/components/breadcrumb";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  NotificationCenter,
  type NotificationItem,
} from "@monorepo-boilerplate/ui/components/notification-center";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import { SidebarTrigger } from "@monorepo-boilerplate/ui/components/sidebar";

import { usePageTitleOverride } from "@/components/page-title";
import { activeMainItem } from "@/lib/nav";
import { useThemeToggle } from "@/lib/use-theme-toggle";

export type AppTopbarProps = {
  onOpenCommandCenter: (launcher?: HTMLElement | null) => void;
  notifications?: readonly NotificationItem[];
  notificationsLoading?: boolean;
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
};

/**
 * Top bar from shadcn's `sidebar-07`: sidebar trigger, vertical separator, then
 * breadcrumbs, with the height shrinking when the sidebar collapses to icons.
 *
 * The page label comes from the deepest matched route's
 * `staticData.pageTitle`, so every screen names itself without passing props
 * through the layout. The section crumb comes from `nav.ts` and is omitted on a
 * section's index route, which would otherwise read "Customers / Customers".
 *
 * Below `md` the sidebar is a Sheet, so the top bar carries an icon-only
 * Command Center trigger; above `md` the trigger lives in the sidebar header.
 */
export function AppTopbar({
  onOpenCommandCenter,
  notifications = [],
  notificationsLoading = false,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
}: AppTopbarProps) {
  const { toggleTheme } = useThemeToggle();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pageTitle = useRouterState({
    select: (state) => {
      for (let index = state.matches.length - 1; index >= 0; index -= 1) {
        const title = state.matches[index]?.staticData?.pageTitle;
        if (typeof title === "string") return title;
      }
      return undefined;
    },
  });

  const override = usePageTitleOverride();
  const section = activeMainItem(pathname);
  const isSectionIndex =
    pageTitle === undefined || (section !== undefined && pathname === section.to);
  const pageLabel = override ?? pageTitle ?? section?.title ?? "Home";
  const showSection = section !== undefined && !isSectionIndex;

  return (
    <header
      data-slot="app-topbar"
      className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear md:h-16 group-has-data-[collapsible=icon]/sidebar-wrapper:md:h-12"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:px-4">
        <SidebarTrigger className="shrink-0" />
        <Separator
          orientation="vertical"
          className="mx-1 shrink-0 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="min-w-0 flex-nowrap">
            {showSection && section ? (
              <>
                <BreadcrumbItem className="hidden shrink-0 md:inline-flex">
                  <BreadcrumbLink render={<Link to={section.to} />}>{section.title}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden shrink-0 md:list-item" />
              </>
            ) : null}
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{pageLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-1 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          aria-label="Search or jump to"
          onClick={(event) => onOpenCommandCenter(event.currentTarget)}
        >
          <SearchIcon aria-hidden />
        </Button>
        <NotificationCenter
          items={notifications}
          isLoading={notificationsLoading}
          onMarkRead={onMarkNotificationRead}
          onMarkAllRead={onMarkAllNotificationsRead}
          renderLink={({ item, className, children, onNavigate }) => (
            <Link to={item.href as never} className={className} onClick={onNavigate}>
              {children}
            </Link>
          )}
        />
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggleTheme}>
          <SunIcon className="dark:hidden" aria-hidden />
          <MoonIcon className="hidden dark:block" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
