"use generative";

import { defineToolkit, externalTool } from "@assistant-ui/react";
import { AssistantToolFallback } from "@monorepo-boilerplate/ui/components/assistant";
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
    render: (props) => <AssistantToolFallback {...props} />,
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
    render: (props) => <AssistantToolFallback {...props} />,
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
    render: (props) => <AssistantToolFallback {...props} />,
  },
});
