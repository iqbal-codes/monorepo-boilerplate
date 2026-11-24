import { Link } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@monorepo-boilerplate/ui/components/sidebar";

import type { NavShortcut } from "@/lib/nav";

type NavShortcutsProps = {
  items: NavShortcut[];
};

/**
 * Secondary sidebar links, from shadcn's `sidebar-07` projects group. The
 * per-item "more" dropdown is dropped: it needs actions the template does not
 * define, and a menu of dead items is worse than none.
 */
export function NavShortcuts({ items }: NavShortcutsProps) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Reference</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton render={<Link to={item.to} />}>
              <item.icon />
              <span>{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
