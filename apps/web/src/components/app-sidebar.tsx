import { Link } from "@tanstack/react-router";
import { GalleryVerticalEndIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@monorepo-boilerplate/ui/components/sidebar";

import { NavMain } from "@/components/sidebar/nav-main";
import { NavShortcuts } from "@/components/sidebar/nav-shortcuts";
import { NavUser } from "@/components/sidebar/nav-user";
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
 */
export function AppSidebar({ currentPath }: { currentPath: string }) {
  const active = activeMainItem(currentPath);

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
