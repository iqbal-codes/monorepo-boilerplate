import { useState } from "react";
import {
  PaintbrushIcon,
  RotateCcwIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  SettingsDialog,
  type SettingsNavGroup,
} from "@monorepo-boilerplate/ui/components/settings-dialog";

import {
  AppearanceSettingsSection,
  GeneralSettingsSection,
  ProfileSettingsSection,
  SecuritySettingsSection,
} from "@/components/settings/settings-sections";
import { useTheme } from "@/components/theme-provider";
import { useUiPrefs } from "@/lib/ui-prefs-store";

export type SettingsSectionId = "general" | "appearance" | "profile" | "security";

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    id: "workspace",
    label: "Preferences",
    items: [
      {
        id: "general",
        label: "General",
        description: "Table density and default page size",
        icon: <SlidersHorizontalIcon />,
        keywords: ["tables", "density", "compact", "pagination", "rows", "defaults"],
      },
      {
        id: "appearance",
        label: "Appearance",
        description: "Light, dark, or system theme",
        icon: <PaintbrushIcon />,
        keywords: ["theme", "dark", "light", "system", "color"],
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "profile",
        label: "Profile",
        description: "Display name and email address",
        icon: <UserIcon />,
        keywords: ["name", "email", "identity"],
      },
      {
        id: "security",
        label: "Security",
        description: "Password and active session",
        icon: <ShieldIcon />,
        keywords: ["password", "session", "role", "logout", "sign out"],
      },
    ],
  },
];

/**
 * Application settings overlay opened from the App Shell (`NavUser` and Command
 * Center). Uses the responsive two-layer `SettingsDialog` block from `packages/ui`.
 */
export function AppSettingsDialog({
  open,
  onOpenChange,
  defaultSection = "general",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSection?: SettingsSectionId;
}) {
  const [activeId, setActiveId] = useState<SettingsSectionId>(defaultSection);
  const resetUiPrefs = useUiPrefs((state) => state.resetUiPrefs);
  const { setTheme } = useTheme();

  const showRestoreAction = activeId === "general" || activeId === "appearance";

  function handleRestoreDefaults() {
    if (activeId === "appearance") {
      setTheme("system");
    } else {
      resetUiPrefs();
    }
    toast.success("Device defaults restored");
  }

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      groups={SETTINGS_NAV_GROUPS}
      activeId={activeId}
      onActiveIdChange={(id) => setActiveId(id as SettingsSectionId)}
      headerActions={
        showRestoreAction ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRestoreDefaults}
            aria-label="Restore defaults"
            title="Restore defaults"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcwIcon aria-hidden />
            <span className="hidden sm:inline">Restore defaults</span>
          </Button>
        ) : null
      }
    >
      {activeId === "general" && <GeneralSettingsSection />}
      {activeId === "appearance" && <AppearanceSettingsSection />}
      {activeId === "profile" && <ProfileSettingsSection />}
      {activeId === "security" && (
        <SecuritySettingsSection onAfterSignOut={() => onOpenChange(false)} />
      )}
    </SettingsDialog>
  );
}
