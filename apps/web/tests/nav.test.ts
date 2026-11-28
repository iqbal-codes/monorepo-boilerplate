import { describe, expect, test } from "bun:test";
import { UsersIcon } from "lucide-react";

import {
  activeMainItem,
  activeNavSubItem,
  isNavMainItemActive,
  isRouteActive,
  navMain,
  navShortcuts,
  resolveActiveRoute,
  type NavMainItem,
} from "../src/lib/nav";

describe("isRouteActive", () => {
  test("matches exact paths, trailing slashes, and nested child routes without prefix leaks", () => {
    expect(isRouteActive("/customers", "/customers")).toBe(true);
    expect(isRouteActive("/customers/", "/customers")).toBe(true);
    expect(isRouteActive("/customers/123", "/customers")).toBe(true);
    expect(isRouteActive("/customers-extra", "/customers")).toBe(false);
    expect(isRouteActive("/settings", "/customers")).toBe(false);
  });
});

describe("resolveActiveRoute", () => {
  test("prefers the longest matching prefix so sibling sub-routes never both highlight", () => {
    const subItems = [
      { title: "All customers", to: "/customers" },
      { title: "Archived", to: "/customers/archived" },
      { title: "Settings", to: "/settings" },
    ];

    expect(resolveActiveRoute("/customers", subItems)?.title).toBe("All customers");
    expect(resolveActiveRoute("/customers/123", subItems)?.title).toBe("All customers");
    expect(resolveActiveRoute("/customers/archived", subItems)?.title).toBe("Archived");
    expect(resolveActiveRoute("/customers/archived/123", subItems)?.title).toBe("Archived");
    expect(resolveActiveRoute("/settings", subItems)?.title).toBe("Settings");
    expect(resolveActiveRoute("/dashboard", subItems)).toBeUndefined();
  });
});

describe("navMain & navShortcuts active resolution", () => {
  const customersGroup = navMain.find((item) => item.title === "Customers") as NavMainItem;
  const dashboardItem = navMain.find((item) => item.title === "Dashboard") as NavMainItem;

  test("resolves main sections, nested sub-items, and reference shortcuts", () => {
    expect(isNavMainItemActive(dashboardItem, "/dashboard")).toBe(true);
    expect(isNavMainItemActive(customersGroup, "/customers")).toBe(true);
    expect(isNavMainItemActive(customersGroup, "/customers/123")).toBe(true);
    expect(isNavMainItemActive(customersGroup, "/settings")).toBe(true);
    expect(isNavMainItemActive(customersGroup, "/dashboard")).toBe(false);

    expect(activeNavSubItem(customersGroup, "/customers")?.title).toBe("All customers");
    expect(activeNavSubItem(customersGroup, "/customers/123")?.title).toBe("All customers");
    expect(activeNavSubItem(customersGroup, "/settings")?.title).toBe("Settings");

    expect(activeMainItem("/dashboard")?.title).toBe("Dashboard");
    expect(activeMainItem("/customers")?.title).toBe("Customers");
    expect(activeMainItem("/settings")?.title).toBe("Customers");
    expect(activeMainItem("/demo/fields")?.title).toBe("Reference");

    expect(resolveActiveRoute("/demo/fields", navShortcuts)?.name).toBe("Fields");
    expect(resolveActiveRoute("/demo/blocks", navShortcuts)?.name).toBe("Blocks");
    expect(resolveActiveRoute("/demo/kanban", navShortcuts)?.name).toBe("Kanban");
    expect(resolveActiveRoute("/demo/calendar", navShortcuts)?.name).toBe("Calendar");
    expect(resolveActiveRoute("/demo/tree", navShortcuts)?.name).toBe("Tree");
  });

  test("does not depend on removed static isActive config", () => {
    const customGroup: NavMainItem = {
      title: "Mock",
      to: "/customers" as NavMainItem["to"],
      icon: UsersIcon,
      items: [{ title: "List", to: "/customers" }],
    };
    expect(activeNavSubItem(customGroup, "/customers")?.title).toBe("List");
  });
});
