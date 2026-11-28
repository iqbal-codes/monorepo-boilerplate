import type { AppRouter } from "@monorepo-boilerplate/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import { serverUrl } from "@/lib/server-url";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: () => {
            query.invalidate();
          },
        },
      });
    },
  }),
});

const httpOptions = {
  url: `${serverUrl}/trpc`,
  fetch: (url: RequestInfo | URL, options?: RequestInit) =>
    fetch(url, { ...options, credentials: "include" }),
};

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      // A valid set of percent-encoded Unicode tags can exceed Bun's request-line limit.
      condition: (operation) => operation.path === "customers.list",
      true: httpLink({ ...httpOptions, methodOverride: "POST" }),
      false: httpBatchLink(httpOptions),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
