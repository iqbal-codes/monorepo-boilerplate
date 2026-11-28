import type { LucideIcon } from "lucide-react";
import {
  CalendarIcon,
  FolderTreeIcon,
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
  | "/demo/kanban"
  | "/demo/calendar"
  | "/demo/tree";

export type NavSubItem = {
  title: string;
  to: NavRoute;
};

export type NavMainItem = {
  title: string;
  to: NavRoute;
  icon: LucideIcon;
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
  { name: "Calendar", to: "/demo/calendar", icon: CalendarIcon },
  { name: "Tree", to: "/demo/tree", icon: FolderTreeIcon },
];

export const REFERENCE_SECTION = { title: "Reference", to: "/demo/blocks" as NavRoute };

/** Returns true when `pathname` matches `to` directly or as a nested child route. */
export function isRouteActive(pathname: string, to: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized === to || normalized.startsWith(`${to}/`);
}

/**
 * Picks the single most specific matching route from a list (longest `to`),
 * so sibling routes sharing a prefix (e.g. `/customers` and `/customers/archived`)
 * never highlight together while detail routes (`/customers/123`) still match.
 */
export function resolveActiveRoute<T extends { to: string }>(
  pathname: string,
  items: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (!isRouteActive(pathname, item.to)) continue;
    if (!best || item.to.length > best.to.length) {
      best = item;
    }
  }
  return best;
}

/** Returns the active sub-item for a nav group (by longest-prefix match), if any. */
export function activeNavSubItem(item: NavMainItem, pathname: string): NavSubItem | undefined {
  return item.items?.length ? resolveActiveRoute(pathname, item.items) : undefined;
}

/** Returns true when `pathname` matches a nav item directly or any of its sub-items. */
export function isNavMainItemActive(item: NavMainItem, pathname: string): boolean {
  return isRouteActive(pathname, item.to) || activeNavSubItem(item, pathname) !== undefined;
}

/**
 * Matches a pathname to the nav section that should look active. Checked against
 * primary items (and their sub-items) first, then the reference shortcuts, so
 * demo routes do not fall back to "Home" in breadcrumbs.
 */
export function activeMainItem(pathname: string): { title: string; to: NavRoute } | undefined {
  const main = navMain.find((item) => isNavMainItemActive(item, pathname));
  if (main) return main;

  const isDemo = /^\/demo(\/|$)/.test(pathname);
  return isDemo ? REFERENCE_SECTION : undefined;
}

export { InboxIcon, SettingsIcon, UsersIcon };
