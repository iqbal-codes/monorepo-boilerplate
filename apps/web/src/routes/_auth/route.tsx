import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useState } from "react";

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
  const { data: liveSession } = authClient.useSession();
  const [identityEpoch, setIdentityEpoch] = useState(0);

  const activeUserId = liveSession?.user?.id ?? session.data?.user?.id ?? "anonymous";
  const handleIdentityReset = useCallback(() => {
    setIdentityEpoch((epoch) => epoch + 1);
  }, []);

  return (
    <AssistantProvider key={`${activeUserId}:${identityEpoch}`}>
      <AppShell initialSession={session.data} onIdentityReset={handleIdentityReset}>
        <Outlet />
      </AppShell>
    </AssistantProvider>
  );
}
