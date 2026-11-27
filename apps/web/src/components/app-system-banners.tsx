import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangleIcon, UserCheckIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { SystemBanner } from "@monorepo-boilerplate/ui/components/system-banner";

import { authClient } from "@/lib/auth-client";
import { useOnlineStatus } from "@/lib/use-online-status";

export type AppSession = typeof authClient.$Infer.Session;

export type AppSystemBannersProps = {
  /** Route-verified session from `/_auth` `beforeLoad`, preserved only while loading or on transient refresh failure. */
  initialSession?: AppSession | null;
  /** Authoritative session returned by an in-flight identity switch (e.g. `stopImpersonating`) before `useSession` finishes refetching. */
  sessionOverride?: AppSession | null;
  /** Called immediately after a successful identity change (e.g. stopping impersonation) with the restored session so identity-bound client trees reset before refresh/reload. */
  onIdentityReset?: (restoredSession: AppSession | null) => void;
  /** Override for reloading the page after stopping impersonation (defaults to `window.location.reload()`). */
  onReload?: () => void;
};

function isUnauthorizedError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "status" in error && error.status === 401);
}

/**
 * Operational banners pinned at the top of `SidebarInset` directly above
 * `AppTopbar`: active Better Auth admin impersonation, session refresh
 * failures, and browser offline state.
 */
export function AppSystemBanners({
  initialSession = null,
  sessionOverride = null,
  onIdentityReset,
  onReload,
}: AppSystemBannersProps) {
  const { data: liveSession, error: sessionError, isPending, refetch } = authClient.useSession();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [hasAuthoritativeNoSession, setHasAuthoritativeNoSession] = useState(false);

  const hasSessionError = Boolean(sessionError);
  const isUnauthorized = isUnauthorizedError(sessionError);

  useEffect(() => {
    if (liveSession !== null) {
      setHasAuthoritativeNoSession(false);
    } else if (isUnauthorized || (!isPending && !hasSessionError)) {
      setHasAuthoritativeNoSession(true);
    }
  }, [liveSession, isPending, hasSessionError, isUnauthorized]);

  // Honor a settled `null` (200/null expired or signed-out session) and 401s as authoritative;
  // latch both so a subsequent Retry (which clears Better Auth's error) never resurrects the seed.
  const canUseSeed =
    !hasAuthoritativeNoSession && !isUnauthorized && (Boolean(isPending) || hasSessionError);
  const activeLiveSession =
    sessionOverride && liveSession?.session?.id !== sessionOverride.session?.id
      ? sessionOverride
      : liveSession;
  const session = activeLiveSession ?? (canUseSeed ? initialSession : null);
  const isImpersonating = Boolean(session?.session?.impersonatedBy);

  if (!isImpersonating && !hasSessionError && isOnline) {
    return null;
  }

  const targetLabel = session?.user?.name || session?.user?.email || "user";

  async function handleStopImpersonating() {
    setStopping(true);
    try {
      const result = await authClient.admin.stopImpersonating();
      if (result.error) {
        toast.error(result.error.message ?? "Could not stop impersonating");
        return;
      }
      const restoredSession =
        "data" in result &&
        result.data &&
        typeof result.data === "object" &&
        "user" in result.data &&
        "session" in result.data
          ? (result.data as AppSession)
          : null;
      queryClient.clear();
      // Reset identity-bound client state immediately from the Stop response before
      // awaiting background refreshes or page reload (which may stall or be cancelled).
      onIdentityReset?.(restoredSession);
      toast.success("Stopped impersonating");
      void refetch();
      void router.invalidate();
      if (onReload) {
        onReload();
      } else {
        window.location.reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not stop impersonating");
    } finally {
      setStopping(false);
    }
  }

  return (
    <div data-slot="app-system-banners" className="flex shrink-0 flex-col">
      {isImpersonating ? (
        <SystemBanner
          tone="warning"
          icon={<UserCheckIcon aria-hidden="true" className="size-4 shrink-0" />}
          message={
            <span>
              Viewing as <strong>{targetLabel}</strong>
            </span>
          }
          action={
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={stopping}
              onClick={() => {
                void handleStopImpersonating();
              }}
            >
              {stopping ? "Stopping…" : "Stop impersonating"}
            </Button>
          }
        />
      ) : null}

      {hasSessionError ? (
        <SystemBanner
          tone="warning"
          icon={<AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />}
          message="Could not refresh session status. Active permissions or impersonation state may be out of date."
          action={
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                void refetch();
              }}
            >
              Retry
            </Button>
          }
        />
      ) : null}

      {!isOnline ? (
        <SystemBanner
          tone="danger"
          icon={<WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />}
          message="You are offline. Changes may not be saved until your connection returns."
        />
      ) : null}
    </div>
  );
}
