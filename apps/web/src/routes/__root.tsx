import { Toaster } from "@monorepo-boilerplate/ui/components/sonner";
import { TooltipProvider } from "@monorepo-boilerplate/ui/components/tooltip";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";

import { ErrorScreen, NotFoundScreen } from "@/components/status-screens";
import { ThemeProvider } from "@/components/theme-provider";
import type { trpc } from "@/utils/trpc";

import "../index.css";

export interface RouterAppContext {
  trpc: typeof trpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: RootNotFoundComponent,
  errorComponent: RootErrorComponent,
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

function RootProviders({ children }: { children: React.ReactNode }) {
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
          <NuqsAdapter>{children}</NuqsAdapter>
          <Toaster richColors />
        </TooltipProvider>
      </ThemeProvider>
    </>
  );
}

function RootComponent() {
  return (
    <RootProviders>
      <Outlet />
      {/* React Query devtools floats at a fixed position; lift it clear of the
          bottom-right Assistant Modal trigger. */}
      <div className="fixed end-18 bottom-4 z-30">
        <ReactQueryDevtools position="bottom" buttonPosition="relative" />
      </div>
    </RootProviders>
  );
}

function RootNotFoundComponent() {
  return (
    <main>
      <NotFoundScreen layout="page" />
    </main>
  );
}

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter({ warn: false });

  return (
    <RootProviders>
      <main>
        <ErrorScreen
          error={error}
          reset={reset}
          layout="page"
          onRetry={() => {
            void router.invalidate();
            reset();
          }}
        />
      </main>
    </RootProviders>
  );
}
