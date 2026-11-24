import { Toaster } from "@monorepo-boilerplate/ui/components/sonner";
import { TooltipProvider } from "@monorepo-boilerplate/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

import { ThemeProvider } from "@/components/theme-provider";
import type { trpc } from "@/utils/trpc";

import "../index.css";

export interface RouterAppContext {
  trpc: typeof trpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "monorepo-boilerplate",
      },
      {
        name: "description",
        content: "monorepo-boilerplate is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <TooltipProvider>
          <NuqsAdapter>
            <Outlet />
          </NuqsAdapter>
          <Toaster richColors />
        </TooltipProvider>
      </ThemeProvider>
      {/* Devtools float at fixed positions, and the shell owns every corner:
          top-right is the theme toggle, bottom-left the sidebar user menu,
          bottom-right the Assistant Modal trigger. Lift both chips clear. */}
      <TanStackRouterDevtools
        position="bottom-left"
        toggleButtonProps={{ style: { bottom: "5.5rem" } }}
      />
      <div className="fixed end-18 bottom-4 z-30">
        <ReactQueryDevtools position="bottom" buttonPosition="relative" />
      </div>
    </>
  );
}
