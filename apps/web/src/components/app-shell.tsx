import type * as React from "react";
import { useRouterState } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "@monorepo-boilerplate/ui/components/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { PageTitleProvider } from "@/components/page-title";
import { AppTopbar } from "@/components/app-topbar";

/**
 * The persistent frame for authenticated screens: sidebar, top bar, and a
 * scrollable content area. Mounted by the `_auth` layout.
 *
 * The wrapper is exactly `h-svh` rather than the sidebar primitive's default
 * `min-h-svh`: with a minimum, the document grows with the content and scrolls
 * as a whole, so the outer frame scrolls away and nothing can pin the top bar.
 * Fixing the height makes the content pane the scroll container, which is what
 * lets `AppTopbar` stay put while rows scroll under it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <PageTitleProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar currentPath={pathname} />
        <SidebarInset className="min-w-0 overflow-hidden">
          <AppTopbar />
          <div
            data-slot="app-content"
            className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 md:p-6"
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </PageTitleProvider>
  );
}
