import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, UserCheckIcon, WifiOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { SystemBanner } from "@monorepo-boilerplate/ui/components/system-banner";

import { authClient } from "@/lib/auth-client";
import { useOnlineStatus } from "@/lib/use-online-status";

export type AppSession = typeof authClient.$Infer.Session;

export type AppSystemBannersProps = {
  /** Route-verified session from `/_auth` `beforeLoad`, preserved if live session refresh fails. */
  initialSession?: AppSession | null;
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
export function AppSystemBanners({ initialSession = null, onReload }: AppSystemBannersProps) {
  const { data: liveSession, error: sessionError, refetch } = authClient.useSession();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const [stopping, setStopping] = useState(false);

  const session = isUnauthorizedError(sessionError) ? liveSession : (liveSession ?? initialSession);
  const isImpersonating = Boolean(session?.session?.impersonatedBy);
  const hasSessionError = Boolean(sessionError);

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
      queryClient.clear();
      toast.success("Stopped impersonating");
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
