import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@monorepo-boilerplate/ui/components/field";
import { Form, useAppForm } from "@monorepo-boilerplate/ui/components/form";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection,
} from "@monorepo-boilerplate/ui/components/settings-dialog";
import { Switch } from "@monorepo-boilerplate/ui/components/switch";

import { useTheme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth-client";
import { useUiPrefs } from "@/lib/ui-prefs-store";

const PAGE_SIZE_ITEMS = [
  { value: "10", label: "10 rows" },
  { value: "20", label: "20 rows" },
  { value: "50", label: "50 rows" },
];

const THEME_ITEMS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

/** Workspace display defaults backed by the persisted Zustand UI preferences store. */
export function GeneralSettingsSection() {
  const tableDensity = useUiPrefs((state) => state.tableDensity);
  const setTableDensity = useUiPrefs((state) => state.setTableDensity);
  const defaultPageSize = useUiPrefs((state) => state.defaultPageSize);
  const setDefaultPageSize = useUiPrefs((state) => state.setDefaultPageSize);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Data tables"
        description="Cross-route display defaults kept on this device. Server data never enters this store."
      >
        <SettingsGroup>
          <SettingsRow
            inline
            htmlFor="settings-compact-density"
            title="Compact table rows"
            description="Tighten row padding in every DataTable, such as Customers."
          >
            <Switch
              id="settings-compact-density"
              checked={tableDensity === "compact"}
              onCheckedChange={(checked) => {
                setTableDensity(checked ? "compact" : "comfortable");
              }}
            />
          </SettingsRow>

          <SettingsRow
            htmlFor="settings-page-size"
            title="Default rows per page"
            description="Initial page size for new list views; URL parameters override it per route."
          >
            <Select
              items={PAGE_SIZE_ITEMS}
              value={String(defaultPageSize)}
              onValueChange={(value) => {
                if (value) setDefaultPageSize(Number(value));
              }}
            >
              <SelectTrigger id="settings-page-size" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PAGE_SIZE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

/** Theme preference backed by `next-themes`. */
export function AppearanceSettingsSection() {
  const { theme, setTheme } = useTheme();
  const activeTheme = theme ?? "system";

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Theme"
        description="Choose how the workspace adapts to light and dark environments."
      >
        <SettingsGroup>
          <SettingsRow
            htmlFor="settings-color-mode"
            title="Color mode"
            description="Follow your operating system appearance or lock light or dark mode."
          >
            <Select
              items={THEME_ITEMS}
              value={activeTheme}
              onValueChange={(value) => {
                if (value === "system" || value === "light" || value === "dark") {
                  setTheme(value);
                }
              }}
            >
              <SelectTrigger id="settings-color-mode" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {THEME_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}

/** Profile editing form wired to Better Auth's `updateUser` mutation. */
export function ProfileSettingsSection() {
  const { data: session } = authClient.useSession();
  const [profileError, setProfileError] = useState<string | null>(null);

  const profileForm = useAppForm({
    defaultValues: { name: session?.user.name ?? "" },
    validators: { onChange: profileSchema, onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      setProfileError(null);
      const res = await authClient.updateUser({ name: value.name });
      if (res?.error) {
        const message = res.error.message || "Could not update profile.";
        setProfileError(message);
        toast.error(message);
        return;
      }
      toast.success("Profile updated");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Profile"
        description="Identity details shown to other members of this workspace."
      >
        <div className="border bg-card p-4 text-card-foreground sm:p-5">
          <Form form={profileForm} aria-label="Profile settings" className="max-w-md gap-4">
            <profileForm.FormError error={profileError} title="Profile update failed" />
            <FieldGroup className="gap-4">
              <profileForm.AppField name="name">
                {(field) => <field.TextField label="Name" autoComplete="name" required />}
              </profileForm.AppField>

              <Field data-disabled className="gap-1.5">
                <FieldLabel htmlFor="settings-email">Email</FieldLabel>
                <Input
                  id="settings-email"
                  type="email"
                  value={session?.user.email ?? ""}
                  disabled
                  readOnly
                />
                <FieldDescription>
                  Email changes go through Better Auth&apos;s verification flow.
                </FieldDescription>
              </Field>
            </FieldGroup>

            <profileForm.SubmitButton className="self-start" loadingLabel="Saving…">
              Save profile
            </profileForm.SubmitButton>
          </Form>
        </div>
      </SettingsSection>
    </div>
  );
}

/** Password update form and session controls wired to Better Auth. */
export function SecuritySettingsSection({ onAfterSignOut }: { onAfterSignOut?: () => void }) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordForm = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onChange: passwordSchema, onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setPasswordError(null);
      const res = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      });
      if (res?.error) {
        const message = res.error.message || "Could not change password.";
        setPasswordError(message);
        toast.error(message);
        return;
      }
      passwordForm.reset();
      toast.success("Password changed");
    },
  });

  const role = session?.user.role ?? "user";

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Password"
        description="Changing your password revokes active sessions on other devices."
      >
        <div className="border bg-card p-4 text-card-foreground sm:p-5">
          <Form form={passwordForm} aria-label="Password settings" className="max-w-md gap-4">
            <passwordForm.FormError error={passwordError} title="Password change failed" />
            <FieldGroup className="gap-4">
              <passwordForm.AppField name="currentPassword">
                {(field) => (
                  <field.PasswordField
                    label="Current password"
                    autoComplete="current-password"
                    required
                  />
                )}
              </passwordForm.AppField>

              <passwordForm.AppField name="newPassword">
                {(field) => (
                  <field.PasswordField
                    label="New password"
                    autoComplete="new-password"
                    description="At least 8 characters."
                    required
                  />
                )}
              </passwordForm.AppField>

              <passwordForm.AppField name="confirmPassword">
                {(field) => (
                  <field.PasswordField
                    label="Confirm new password"
                    autoComplete="new-password"
                    required
                  />
                )}
              </passwordForm.AppField>
            </FieldGroup>

            <passwordForm.SubmitButton className="self-start" loadingLabel="Updating…">
              Change password
            </passwordForm.SubmitButton>
          </Form>
        </div>
      </SettingsSection>

      <SettingsSection title="Session">
        <SettingsGroup>
          <SettingsRow
            inline
            title="Account role"
            description="Access tier assigned to your signed-in account."
          >
            <Badge variant="secondary">{role}</Badge>
          </SettingsRow>
          <SettingsRow
            inline
            title="Sign out"
            description="End your session on this browser and return to sign-in."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      onAfterSignOut?.();
                      void navigate({ to: "/sign-in" });
                    },
                  },
                });
              }}
            >
              <LogOutIcon aria-hidden />
              Log out
            </Button>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
