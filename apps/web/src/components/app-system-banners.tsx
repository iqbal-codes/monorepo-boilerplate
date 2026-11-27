import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { UserCheckIcon, WifiOffIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { SystemBanner } from "@monorepo-boilerplate/ui/components/system-banner";

import { authClient } from "@/lib/auth-client";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Operational banners pinned at the top of `SidebarInset` directly above
 * `AppTopbar`: active Better Auth admin impersonation and browser offline state.
 */
export function AppSystemBanners() {
  const { data: session, refetch } = authClient.useSession();
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);

  const isImpersonating = Boolean(session?.session?.impersonatedBy);

  if (!isImpersonating && isOnline) {
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
      await refetch();
      await queryClient.invalidateQueries();
      await router.invalidate();
      toast.success("Stopped impersonating");
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
