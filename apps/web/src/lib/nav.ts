import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboardIcon,
  SettingsIcon,
  UsersIcon,
  WrenchIcon,
  BoxesIcon,
  InboxIcon,
  KanbanIcon,
} from "lucide-react";

/**
 * Sidebar navigation, shaped after shadcn's official `sidebar-07` block:
 * a primary group with collapsible sub-items, a secondary group of shortcuts,
 * and a user menu in the footer.
 *
 * Static and hand-ordered on purpose: derived-from-route navigation cannot
 * express order, grouping, icons, or permissions (docs/adr/0005). `to` stays a
 * literal union so a removed route fails the type check.
 */
export type NavRoute =
  | "/dashboard"
  | "/customers"
  | "/settings"
  | "/demo/fields"
  | "/demo/blocks"
  | "/demo/kanban";

export type NavSubItem = {
  title: string;
  to: NavRoute;
};

export type NavMainItem = {
  title: string;
  to: NavRoute;
  icon: LucideIcon;
  isActive?: boolean;
  items?: NavSubItem[];
};

export type NavShortcut = {
  name: string;
  to: NavRoute;
  icon: LucideIcon;
};

/** Primary navigation; an item with `items` renders as a collapsible group. */
export const navMain: NavMainItem[] = [
  {
    title: "Dashboard",
    to: "/dashboard",
    icon: LayoutDashboardIcon,
  },
  {
    title: "Customers",
    to: "/customers",
    icon: UsersIcon,
    items: [
      { title: "All customers", to: "/customers" },
      { title: "Settings", to: "/settings" },
    ],
  },
];

/** Secondary links. `_demo` routes are deletable; remove these entries with them. */
export const navShortcuts: NavShortcut[] = [
  { name: "Fields", to: "/demo/fields", icon: WrenchIcon },
  { name: "Blocks", to: "/demo/blocks", icon: BoxesIcon },
  { name: "Kanban", to: "/demo/kanban", icon: KanbanIcon },
];

export const REFERENCE_SECTION = { title: "Reference", to: "/demo/blocks" as NavRoute };

/**
 * Matches a pathname to the nav section that should look active. Checked against
 * primary items first, then the reference shortcuts, so demo routes do not fall
 * back to "Home" in breadcrumbs.
 */
export function activeMainItem(pathname: string): { title: string; to: NavRoute } | undefined {
  const main = navMain.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (main) return main;

  const isDemo = /^\/demo(\/|$)/.test(pathname);
  return isDemo ? REFERENCE_SECTION : undefined;
}

export { InboxIcon, SettingsIcon, UsersIcon };
