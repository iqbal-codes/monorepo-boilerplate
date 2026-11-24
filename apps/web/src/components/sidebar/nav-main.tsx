import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@monorepo-boilerplate/ui/components/sidebar";

import type { NavMainItem } from "@/lib/nav";

type NavMainProps = {
  items: NavMainItem[];
  /** Item id that is currently active, so its group starts open. */
  activeTitle?: string;
};

/**
 * Primary sidebar navigation from shadcn's `sidebar-07`: one group of items,
 * each optionally collapsible into sub-links. Adapted to TanStack Router, so
 * every destination is a typed `Link` rather than an `<a href>`.
 */
export function NavMain({ items, activeTitle }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.items?.length ? (
            <Collapsible
              key={item.title}
              defaultOpen={activeTitle === item.title}
              className="group/collapsible"
              render={<SidebarMenuItem />}
            >
              <CollapsibleTrigger render={<SidebarMenuButton tooltip={item.title} />}>
                <item.icon />
                <span>{item.title}</span>
                <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.to}>
                      <SidebarMenuSubButton render={<Link to={subItem.to} />}>
                        <span>{subItem.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={activeTitle === item.title}
                render={<Link to={item.to} />}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
