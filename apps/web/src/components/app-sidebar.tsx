import { Link } from "@tanstack/react-router";
import { GalleryVerticalEndIcon, SearchIcon } from "lucide-react";

import { Kbd } from "@monorepo-boilerplate/ui/components/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@monorepo-boilerplate/ui/components/sidebar";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavShortcuts } from "@/components/sidebar/nav-shortcuts";
import { NavUser } from "@/components/sidebar/nav-user";
import { commandShortcutLabel } from "@/lib/command-shortcut";
import { activeMainItem, navMain, navShortcuts } from "@/lib/nav";

/**
 * App sidebar, following shadcn's official `sidebar-07` block: brand header,
 * primary group, secondary group, user menu footer, and a draggable rail.
 *
 * Adaptations from the registry source, all deliberate:
 * - **No `TeamSwitcher`** — the template is single-tenant (docs/adr/0003), so a
 *   team picker would be a control with nothing behind it.
 * - **Real session** in `NavUser` instead of sample data.
 * - **Typed router links** instead of `<a href="#">`.
 * - **Command Center trigger** below the brand, keeping search with navigation;
 *   it collapses to the search icon and gains a tooltip in icon mode.
 */
export function AppSidebar({
  currentPath,
  onOpenCommandCenter,
}: {
  currentPath: string;
  onOpenCommandCenter: () => void;
}) {
  const active = activeMainItem(currentPath);
  const { state } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GalleryVerticalEndIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">monorepo-boilerplate</span>
                <span className="truncate text-xs text-muted-foreground">Internal tools</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="max-md:hidden">
            <SidebarMenuButton
              type="button"
              variant={state === "collapsed" ? "default" : "outline"}
              tooltip="Search or jump to"
              aria-label="Search or jump to"
              onClick={onOpenCommandCenter}
            >
              <SearchIcon />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                Search or jump to…
              </span>
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
                {commandShortcutLabel()}
              </Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} activeTitle={active?.title} />
        <NavShortcuts items={navShortcuts} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
