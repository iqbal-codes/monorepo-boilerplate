import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/sign-in",
      });
    }
    return { session };
  },
});

function AuthLayout() {
  const { session } = Route.useRouteContext();
  return (
    <AssistantProvider>
      <AppShell initialSession={session.data}>
        <Outlet />
      </AppShell>
    </AssistantProvider>
  );
}
