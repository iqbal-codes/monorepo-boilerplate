import { Link, useRouterState } from "@tanstack/react-router";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@monorepo-boilerplate/ui/components/breadcrumb";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import { SidebarTrigger } from "@monorepo-boilerplate/ui/components/sidebar";

import { usePageTitleOverride } from "@/components/page-title";
import { activeMainItem } from "@/lib/nav";

/**
 * Top bar from shadcn's `sidebar-07`: sidebar trigger, vertical separator, then
 * breadcrumbs, with the height shrinking when the sidebar collapses to icons.
 *
 * The page label comes from the deepest matched route's
 * `staticData.pageTitle`, so every screen names itself without passing props
 * through the layout. The section crumb comes from `nav.ts` and is omitted on a
 * section's index route, which would otherwise read "Customers / Customers".
 */
export function AppTopbar() {
  const { resolvedTheme, setTheme } = useTheme();
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
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
    >
      <div className="flex min-w-0 items-center gap-2 px-4">
        <SidebarTrigger />
        <Separator
          orientation="vertical"
          className="mx-1 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {showSection && section ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink render={<Link to={section.to} />}>{section.title}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
              </>
            ) : null}
            <BreadcrumbItem>
              <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto flex items-center gap-1 px-4">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle theme"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <SunIcon className="dark:hidden" aria-hidden />
          <MoonIcon className="hidden dark:block" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
