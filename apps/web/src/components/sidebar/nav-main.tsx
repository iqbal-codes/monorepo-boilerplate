import { useState } from "react";
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
  useSidebar,
} from "@monorepo-boilerplate/ui/components/sidebar";

import { activeNavSubItem, isNavMainItemActive, type NavMainItem } from "@/lib/nav";

type NavMainCollapsible = NavMainItem & {
  items: NonNullable<NavMainItem["items"]>;
};

type NavMainProps = {
  items: NavMainItem[];
  currentPath: string;
};

/**
 * Collapsible nav group that expands both the desktop icon-collapsed sidebar
 * and its sub-menu when tapped in collapsed mode instead of toggling invisibly.
 */
function NavMainCollapsibleItem({
  item,
  currentPath,
}: {
  item: NavMainCollapsible;
  currentPath: string;
}) {
  const { state, isMobile, setOpen } = useSidebar();
  const activeSubItem = activeNavSubItem(item, currentPath);
  const isGroupActive = isNavMainItemActive(item, currentPath);
  const [menuOpen, setMenuOpen] = useState(isGroupActive);
  const [prevGroupActive, setPrevGroupActive] = useState(isGroupActive);

  if (isGroupActive !== prevGroupActive) {
    setPrevGroupActive(isGroupActive);
    if (isGroupActive) {
      setMenuOpen(true);
    }
  }

  // Highlight the parent trigger when its sub-links are hidden (collapsed rail or closed accordion).
  const isParentHighlighted = isGroupActive && (!menuOpen || (state === "collapsed" && !isMobile));

  function handleOpenChange(nextOpen: boolean) {
    if (state === "collapsed" && !isMobile) {
      setOpen(true);
      setMenuOpen(true);
      return;
    }
    setMenuOpen(nextOpen);
  }

  return (
    <Collapsible
      open={menuOpen}
      onOpenChange={handleOpenChange}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={<SidebarMenuButton tooltip={item.title} isActive={isParentHighlighted} />}
      >
        <item.icon />
        <span>{item.title}</span>
        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.items.map((subItem) => (
            <SidebarMenuSubItem key={subItem.to}>
              <SidebarMenuSubButton
                isActive={activeSubItem?.to === subItem.to}
                render={<Link to={subItem.to} />}
              >
                <span>{subItem.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Primary sidebar navigation from shadcn's `sidebar-07`: one group of items,
 * each optionally collapsible into sub-links. Adapted to TanStack Router, so
 * every destination is a typed `Link` rather than an `<a href>`.
 */
export function NavMain({ items, currentPath }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.items?.length ? (
            <NavMainCollapsibleItem
              key={item.title}
              item={{ ...item, items: item.items }}
              currentPath={currentPath}
            />
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                isActive={isNavMainItemActive(item, currentPath)}
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
