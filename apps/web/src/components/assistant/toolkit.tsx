"use generative";

import { defineToolkit, externalTool } from "@assistant-ui/react";
import { CheckIcon, CompassIcon, ServerIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import { navigateFromAssistant } from "@/lib/assistant-navigation";

const NAV_ROUTES = [
  "/dashboard",
  "/customers",
  "/settings",
  "/demo/fields",
  "/demo/blocks",
] as const;

export default defineToolkit({
  get_runtime_info: {
    description: "Return current server time, runtime environment, and authenticated user summary.",
    parameters: z.object({}),
    execute: externalTool(),
    render: ({ result, isError, status }) => {
      if (isError) {
        return (
          <div className="my-1 flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span>Unable to load runtime info.</span>
          </div>
        );
      }
      if (status.type === "running" || !result) {
        return (
          <div className="my-1 flex items-center gap-2 border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            <ServerIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span>Checking server runtime info…</span>
          </div>
        );
      }
      const data = result as {
        serverTimeIso?: string;
        environment?: string;
        user?: { name?: string; email?: string; role?: string };
      };
      return (
        <div className="my-1 space-y-1 border border-border bg-background/80 px-2.5 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <ServerIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span>Runtime info ({data.environment ?? "unknown"})</span>
          </div>
          {data.user && (
            <p className="text-muted-foreground">
              {data.user.name ?? data.user.email} ({data.user.role ?? "user"})
            </p>
          )}
          {data.serverTimeIso && (
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {data.serverTimeIso}
            </p>
          )}
        </div>
      );
    },
  },

  get_current_screen: {
    description: "Read the current screen route path and document title in the App Shell.",
    parameters: z.object({}),
    execute: async () => {
      "use client";
      return {
        pathname: window.location.pathname,
        title: document.title,
      };
    },
    render: ({ result, status }) => {
      if (status.type === "running" || !result) {
        return (
          <div className="my-1 flex items-center gap-2 border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            <CompassIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span>Reading active screen…</span>
          </div>
        );
      }
      return (
        <div className="my-1 flex items-center gap-2 border border-border bg-background/80 px-2.5 py-2 text-xs">
          <CompassIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-foreground">{result.pathname}</span>
        </div>
      );
    },
  },

  navigate_screen: {
    description: "Navigate the App Shell to one of the application screens.",
    parameters: z.object({
      path: z.enum(NAV_ROUTES).describe("Destination route inside the App Shell"),
    }),
    execute: async ({ path }) => {
      "use client";
      return navigateFromAssistant(path);
    },
    render: ({ args, result, isError, status }) => {
      if (isError) {
        return (
          <div className="my-1 flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span>Unable to navigate to {args.path}.</span>
          </div>
        );
      }
      if (status.type === "running" || !result) {
        return (
          <div className="my-1 flex items-center gap-2 border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            <CompassIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span>Opening {args.path}…</span>
          </div>
        );
      }
      return (
        <div className="my-1 flex items-center gap-2 border border-border bg-background/80 px-2.5 py-2 text-xs">
          <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span>Navigated to {result.navigatedTo}</span>
        </div>
      );
    },
  },
});
