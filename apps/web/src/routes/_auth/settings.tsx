import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";

import {
  AppearanceSettingsSection,
  GeneralSettingsSection,
  ProfileSettingsSection,
  SecuritySettingsSection,
} from "@/components/settings/settings-sections";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsScreen,
  staticData: { pageTitle: "Settings" },
});

function SettingsScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Workspace preferences, theme, profile, and account security."
      />

      <GeneralSettingsSection />
      <Separator />
      <AppearanceSettingsSection />
      <Separator />
      <ProfileSettingsSection />
      <Separator />
      <SecuritySettingsSection />
    </div>
  );
}
