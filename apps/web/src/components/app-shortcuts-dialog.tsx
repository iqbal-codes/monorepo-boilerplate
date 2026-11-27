import { useEffect, type ComponentProps } from "react";

import {
  ShortcutsDialog,
  type ShortcutGroup,
} from "@monorepo-boilerplate/ui/components/shortcuts-dialog";
import { SIDEBAR_KEYBOARD_SHORTCUT } from "@monorepo-boilerplate/ui/components/sidebar";

import {
  COMMAND_CENTER_SHORTCUT_KEYS,
  SHORTCUTS_HELP_KEY,
  isShortcutsHelpKey,
} from "@/lib/command-shortcut";

export const APP_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: "navigation",
    label: "Navigation & Shell",
    items: [
      {
        id: "command-center",
        label: "Open Command Center",
        description: "Search screens, customers, and quick actions.",
        keys: COMMAND_CENTER_SHORTCUT_KEYS,
        keywords: ["search", "jump", "palette"],
      },
      {
        id: "toggle-sidebar",
        label: "Toggle sidebar",
        description: "Collapse or expand the navigation rail.",
        keys: [["mod", SIDEBAR_KEYBOARD_SHORTCUT.toUpperCase()]],
        keywords: ["rail", "nav"],
      },
      {
        id: "keyboard-shortcuts",
        label: "Keyboard shortcuts",
        description: "Open this keyboard shortcuts reference.",
        keys: [[SHORTCUTS_HELP_KEY]],
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

export type AppShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when opened via the global `?` hotkey so the shell can clear prior overlay handoff state. */
  onOpenFromHotkey?: () => void;
  finalFocus?: ComponentProps<typeof ShortcutsDialog>["finalFocus"];
};

/**
 * Application keyboard shortcuts controller and catalogue. Owns the global `?`
 * keydown listener (outside text-entry surfaces) and sources shell chords from
 * their owning modules (`command-shortcut.ts` and `sidebar.tsx`).
 */
export function AppShortcutsDialog({
  open,
  onOpenChange,
  onOpenFromHotkey,
  finalFocus,
}: AppShortcutsDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!isShortcutsHelpKey(event)) return;

      event.preventDefault();
      if (onOpenFromHotkey) {
        onOpenFromHotkey();
      } else {
        onOpenChange(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, onOpenFromHotkey]);

  return (
    <ShortcutsDialog
      open={open}
      onOpenChange={onOpenChange}
      groups={APP_SHORTCUT_GROUPS}
      finalFocus={finalFocus}
    />
  );
}
