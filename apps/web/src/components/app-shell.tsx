import { useCallback, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { SidebarInset, SidebarProvider } from "@monorepo-boilerplate/ui/components/sidebar";

import { AppShortcutsDialog } from "@/components/app-shortcuts-dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { AppSystemBanners, type AppSession } from "@/components/app-system-banners";
import { AppTopbar } from "@/components/app-topbar";
import { CommandCenter } from "@/components/command-center";
import { PageTitleProvider } from "@/components/page-title";
import { AppSettingsDialog } from "@/components/settings/app-settings-dialog";

/**
 * The persistent frame for authenticated screens: sidebar, operational banners,
 * top bar, and a scrollable content area. Mounted by the `_auth` layout.
 *
 * The wrapper is exactly `h-svh` rather than the sidebar primitive's default
 * `min-h-svh`: with a minimum, the document grows with the content and scrolls
 * as a whole, so the outer frame scrolls away and nothing can pin the top bar.
 * Fixing the height makes the content pane the scroll container, which is what
 * lets `AppSystemBanners` and `AppTopbar` stay put while rows scroll under them.
 */
export function AppShell({
  children,
  initialSession = null,
  sessionOverride = null,
  onIdentityReset,
}: {
  children: ReactNode;
  initialSession?: AppSession | null;
  sessionOverride?: AppSession | null;
  onIdentityReset?: (restoredSession: AppSession | null) => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const commandOpenRef = useRef(commandOpen);
  commandOpenRef.current = commandOpen;
  const commandLauncherRef = useRef<HTMLElement | null>(null);
  const suppressCommandReturnFocusRef = useRef(false);
  const [shortcutsReturnTarget, setShortcutsReturnTarget] = useState<HTMLElement | null>(null);

  const openCommandCenter = useCallback((launcher?: HTMLElement | null) => {
    // Capture the launcher only on a closed-to-open transition so reissuing the
    // Command Center shortcut while open never overwrites it with CommandInput.
    if (!commandOpenRef.current) {
      commandLauncherRef.current =
        launcher ??
        (typeof document !== "undefined" && document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
    }
    suppressCommandReturnFocusRef.current = false;
    commandOpenRef.current = true;
    setCommandOpen(true);
  }, []);

  const handleCommandOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        openCommandCenter();
        return;
      }
      commandOpenRef.current = false;
      setCommandOpen(false);
    },
    [openCommandCenter],
  );

  const openShortcutsFromHotkey = useCallback(() => {
    setShortcutsReturnTarget(null);
    setShortcutsOpen(true);
  }, []);

  const openShortcutsFromCommandCenter = useCallback(() => {
    suppressCommandReturnFocusRef.current = true;
    setShortcutsReturnTarget(commandLauncherRef.current);
    commandOpenRef.current = false;
    setCommandOpen(false);
    setShortcutsOpen(true);
  }, []);

  return (
    <PageTitleProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar
          currentPath={pathname}
          onOpenCommandCenter={openCommandCenter}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SidebarInset className="min-w-0 overflow-hidden">
          <AppSystemBanners
            initialSession={initialSession}
            sessionOverride={sessionOverride}
            onIdentityReset={onIdentityReset}
          />
          <AppTopbar onOpenCommandCenter={openCommandCenter} />
          <div
            data-slot="app-content"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pt-3 pb-20 md:gap-6 md:p-6"
          >
            {children}
          </div>
        </SidebarInset>
        <CommandCenter
          open={commandOpen}
          onOpenChange={handleCommandOpenChange}
          finalFocus={() =>
            suppressCommandReturnFocusRef.current ? false : (commandLauncherRef.current ?? true)
          }
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={openShortcutsFromCommandCenter}
        />
        <AppSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <AppShortcutsDialog
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          onOpenFromHotkey={openShortcutsFromHotkey}
          finalFocus={
            shortcutsReturnTarget
              ? () => (shortcutsReturnTarget.isConnected ? shortcutsReturnTarget : true)
              : undefined
          }
        />
      </SidebarProvider>
    </PageTitleProvider>
  );
}
