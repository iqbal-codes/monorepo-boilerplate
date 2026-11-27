import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import type { AppSession } from "@/components/app-system-banners";
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
  const [restoredSession, setRestoredSession] = useState<AppSession | null>(null);
  const [identityEpoch, setIdentityEpoch] = useState(0);

  useEffect(() => {
    if (
      restoredSession &&
      liveSession?.session?.id &&
      liveSession.session.id === restoredSession.session?.id
    ) {
      setRestoredSession(null);
    }
  }, [liveSession, restoredSession]);

  const effectiveSeed = restoredSession ?? session.data;
  const activeUserId =
    restoredSession?.user?.id ?? liveSession?.user?.id ?? session.data?.user?.id ?? "anonymous";
  const handleIdentityReset = useCallback((nextSession: AppSession | null) => {
    setRestoredSession(nextSession);
    setIdentityEpoch((epoch) => epoch + 1);
  }, []);

  return (
    <AssistantProvider key={`${activeUserId}:${identityEpoch}`}>
      <AppShell
        initialSession={effectiveSeed}
        sessionOverride={restoredSession}
        onIdentityReset={handleIdentityReset}
      >
        <Outlet />
      </AppShell>
    </AssistantProvider>
  );
}
