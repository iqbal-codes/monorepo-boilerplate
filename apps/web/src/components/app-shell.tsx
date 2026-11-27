import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import {
  ShortcutsDialog,
  type ShortcutGroup,
} from "@monorepo-boilerplate/ui/components/shortcuts-dialog";
import { SidebarInset, SidebarProvider } from "@monorepo-boilerplate/ui/components/sidebar";

import { AppSidebar } from "@/components/app-sidebar";
import { AppSystemBanners } from "@/components/app-system-banners";
import { AppTopbar } from "@/components/app-topbar";
import { CommandCenter } from "@/components/command-center";
import { PageTitleProvider } from "@/components/page-title";
import { AppSettingsDialog } from "@/components/settings/app-settings-dialog";
import { isShortcutsHelpKey } from "@/lib/command-shortcut";

const APP_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: "navigation",
    label: "Navigation & Shell",
    items: [
      {
        id: "command-center",
        label: "Open Command Center",
        description: "Search screens, customers, and quick actions.",
        keys: [
          ["mod", "K"],
          ["mod", "Enter"],
        ],
        keywords: ["search", "jump", "palette"],
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        description: "Collapse or expand the navigation rail.",
        keys: [["mod", "B"]],
        keywords: ["rail", "nav"],
      },
      {
        id: "keyboard-shortcuts",
        label: "Keyboard shortcuts",
        description: "Open this keyboard shortcuts reference.",
        keys: [["?"]],
        keywords: ["help", "hotkeys"],
      },
    ],
  },
  {
    id: "overlays",
    label: "Overlays & Dialogs",
    items: [
      {
        id: "close-overlay",
        label: "Close active dialog or drawer",
        description: "Prompts for confirmation if a form has unsaved edits.",
        keys: [["Esc"]],
        keywords: ["dismiss", "cancel"],
      },
      {
        id: "focus-settings-search",
        label: "Focus Settings search",
        description: "Jump to the search input while Settings is open.",
        keys: [["/"]],
        keywords: ["filter", "preferences"],
      },
    ],
  },
];

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
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!isShortcutsHelpKey(event)) return;

      event.preventDefault();
      setShortcutsOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <PageTitleProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar
          currentPath={pathname}
          onOpenCommandCenter={() => setCommandOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <SidebarInset className="min-w-0 overflow-hidden">
          <AppSystemBanners />
          <AppTopbar onOpenCommandCenter={() => setCommandOpen(true)} />
          <div
            data-slot="app-content"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-3 md:gap-6 md:p-6"
          >
            {children}
          </div>
        </SidebarInset>
        <CommandCenter
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        <AppSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <ShortcutsDialog
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          groups={APP_SHORTCUT_GROUPS}
        />
      </SidebarProvider>
    </PageTitleProvider>
  );
}
