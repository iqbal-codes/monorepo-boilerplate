import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@monorepo-boilerplate/ui/components/field";
import { Form, useAppForm } from "@monorepo-boilerplate/ui/components/form";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { useUiPrefs } from "@/lib/ui-prefs-store";

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsScreen,
  staticData: { pageTitle: "Settings" },
});

const DENSITY_ITEMS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const PAGE_SIZE_ITEMS = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
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

function SettingsScreen() {
  const { data: session } = authClient.useSession();
  const tableDensity = useUiPrefs((state) => state.tableDensity);
  const setTableDensity = useUiPrefs((state) => state.setTableDensity);
  const defaultPageSize = useUiPrefs((state) => state.defaultPageSize);
  const setDefaultPageSize = useUiPrefs((state) => state.setDefaultPageSize);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Profile and credential forms built on the reusable TanStack Form system."
      />

      <Card>
        <CardHeader>
          <CardTitle id="settings-profile-heading">Profile</CardTitle>
          <CardDescription>Shown to other users of this tool.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            form={profileForm}
            aria-labelledby="settings-profile-heading"
            className="max-w-md gap-4"
          >
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
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Interface</CardTitle>
          <CardDescription>
            Cross-route preferences kept in a zustand store with persistence. Server data never
            enters it.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <FieldGroup className="gap-4">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="density">Table density</FieldLabel>
              <Select
                items={DENSITY_ITEMS}
                value={tableDensity}
                onValueChange={(value) => {
                  if (value === "comfortable" || value === "compact") {
                    setTableDensity(value);
                  }
                }}
              >
                <SelectTrigger id="density" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DENSITY_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Applies to every DataTable; try it on Customers.</FieldDescription>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="page-size">Default rows per page</FieldLabel>
              <Select
                items={PAGE_SIZE_ITEMS}
                value={String(defaultPageSize)}
                onValueChange={(value) => {
                  if (value) setDefaultPageSize(Number(value));
                }}
              >
                <SelectTrigger id="page-size" className="w-full">
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
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle id="settings-password-heading">Password</CardTitle>
          <CardDescription>Changing it revokes other sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            form={passwordForm}
            aria-labelledby="settings-password-heading"
            className="max-w-md gap-4"
          >
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
        </CardContent>
      </Card>
    </div>
  );
}
