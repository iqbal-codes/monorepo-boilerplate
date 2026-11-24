import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import { FieldGroup } from "@monorepo-boilerplate/ui/components/field";
import {
  Form,
  useAppForm,
  Wizard,
  WizardActions,
  WizardStep,
  WizardStepper,
  type DateRangeValue,
  type FieldOption,
  type WizardStepConfig,
} from "@monorepo-boilerplate/ui/components/form";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@monorepo-boilerplate/ui/components/tabs";
import { DEFAULT_CURRENCY, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { isValidPhoneNumber } from "@monorepo-boilerplate/ui/lib/phone";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { assetUrl } from "@/lib/asset-url";
import { uploadFile } from "@/lib/upload";

export const Route = createFileRoute("/_auth/demo/fields")({
  component: FieldsDemo,
  staticData: { pageTitle: "Fields" },
});

/**
 * DELETABLE DEMO. Exhibits every Field Block, FieldArray, and Form Wizard;
 * nothing else imports this file.
 */

const ROLE_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "owner", label: "Owner", group: "Leadership" },
  { value: "admin", label: "Administrator", group: "Leadership" },
  { value: "editor", label: "Editor", group: "Contributors" },
  { value: "viewer", label: "Viewer", group: "Contributors" },
];

const FRAMEWORK_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "tanstack", label: "TanStack Form", description: "Type-safe headless form state" },
  { value: "trpc", label: "tRPC", description: "End-to-end typed RPC" },
  { value: "drizzle", label: "Drizzle ORM", description: "TypeScript SQL toolkit" },
  { value: "base-ui", label: "Base UI", description: "Unstyled accessible primitives" },
  { value: "zod", label: "Zod", description: "Schema validation" },
];

const PLAN_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "starter", label: "Starter", description: "Up to 5 staff seats and standard support." },
  {
    value: "growth",
    label: "Growth",
    description: "Unlimited staff, audit logs, and priority SLA.",
  },
  { value: "enterprise", label: "Enterprise", description: "Dedicated deployment and custom SSO." },
];

const CHANNEL_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "email", label: "Email digests", description: "Daily summary of workspace activity." },
  { value: "slack", label: "Slack alerts", description: "Instant notifications on key events." },
  { value: "sms", label: "SMS escalations", description: "Critical outages only." },
];

const CADENCE_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const TAG_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "vip", label: "VIP" },
  { value: "beta", label: "Beta" },
  { value: "billing", label: "Billing" },
  { value: "security", label: "Security" },
];

const allFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.email("Enter a valid email address."),
  website: z
    .string()
    .trim()
    .refine((v) => v === "" || z.url().safeParse(v).success, "Enter a full URL (https://…)."),
  password: z.string().min(8, "Use at least 8 characters."),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidPhoneNumber(v), "Enter a valid phone number."),
  quantity: z.number().min(0, "Must be 0 or greater.").max(1000).optional(),
  priceMinor: z.number().int().optional(),
  bio: z.string().max(280),
  role: z.string().min(1, "Choose a role.").optional(),
  primaryStack: z.string().optional(),
  tools: z.array(z.string()),
  plan: z.string().min(1, "Select a plan."),
  channels: z.array(z.string()).min(1, "Pick at least one channel."),
  cadence: z.string().optional(),
  tags: z.array(z.string()),
  marketingOptIn: z.boolean(),
  autoRenew: z.boolean(),
  startDate: z.string(),
  windowRange: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  launchAt: z.string(),
  confidence: z.number().min(0).max(100),
  budgetRange: z.array(z.number()),
  otpCode: z.string().refine((v) => v === "" || v.length === 6, "Enter all 6 digits."),
  avatarUrl: z.string(),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Contact name is required."),
        email: z.email("Enter a valid email."),
      }),
    )
    .min(1, "Add at least one contact."),
});

const wizardSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  workEmail: z.email("Enter a valid work email."),
  workPhone: z
    .string()
    .trim()
    .min(1, "Phone number is required.")
    .refine((v) => v === "" || isValidPhoneNumber(v), "Enter a valid international phone number."),
  plan: z.string().min(1, "Choose a plan."),
  kickoffAt: z.string().min(1, "Select a kickoff date and time."),
  notifyTeam: z.boolean(),
  notes: z.string().max(500),
  acceptTerms: z.boolean().refine((v) => v === true, "You must accept the terms to continue."),
});

const WIZARD_STEPS: ReadonlyArray<WizardStepConfig> = [
  {
    id: "account",
    title: "Account",
    description: "Primary owner details",
    fields: ["fullName", "workEmail", "workPhone"],
  },
  {
    id: "schedule",
    title: "Plan & Kickoff",
    description: "Tier and launch time",
    fields: ["plan", "kickoffAt"],
  },
  {
    id: "confirm",
    title: "Review & Confirm",
    description: "Final check before submit",
    fields: ["notes", "acceptTerms"],
  },
];

type AllFieldsValues = z.infer<typeof allFieldsSchema>;

const ALL_FIELDS_DEFAULTS: AllFieldsValues = {
  name: "",
  email: "",
  website: "",
  password: "",
  phone: "",
  quantity: 1,
  priceMinor: 1999,
  bio: "",
  role: "editor",
  primaryStack: "tanstack",
  tools: ["tanstack", "zod"],
  plan: "growth",
  channels: ["email"],
  cadence: "weekly",
  tags: ["vip"],
  marketingOptIn: false,
  autoRenew: true,
  startDate: "2026-11-24",
  windowRange: { from: "2026-11-24", to: "2026-11-30" } as DateRangeValue,
  launchAt: "",
  confidence: 75,
  budgetRange: [20, 80],
  otpCode: "",
  avatarUrl: "",
  contacts: [{ name: "Ada Lovelace", email: "ada@example.com" }],
};

function AllFieldBlocksTab() {
  const form = useAppForm({
    defaultValues: ALL_FIELDS_DEFAULTS,
    validators: {
      onChange: allFieldsSchema,
      onSubmit: allFieldsSchema,
    },
    onSubmit: ({ value }) => {
      const contactCount =
        value.contacts.length === 1 ? "1 contact" : `${value.contacts.length} contacts`;
      toast.success("Form validated", {
        description: `${value.name} · ${formatMoney({
          minor: value.priceMinor ?? 0,
          currency: DEFAULT_CURRENCY,
        })} · ${contactCount}`,
      });
    },
  });

  return (
    <Form form={form} aria-label="Field block catalog demo">
      <form.FormError />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Text, numeric &amp; phone</CardTitle>
            <CardDescription>
              TextField, PasswordField, TextareaField, NumberField, CurrencyField, PhoneField, and
              SliderField.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label="Name"
                    autoComplete="name"
                    placeholder="Jane Doe"
                    required
                  />
                )}
              </form.AppField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <form.AppField name="email">
                  {(field) => (
                    <field.TextField
                      label="Email"
                      type="email"
                      autoComplete="email"
                      placeholder="jane@acme.com"
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="website">
                  {(field) => (
                    <field.TextField
                      label="Website"
                      type="url"
                      startAddon="https://"
                      placeholder="acme.com"
                    />
                  )}
                </form.AppField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <form.AppField name="password">
                  {(field) => (
                    <field.PasswordField
                      label="Password"
                      autoComplete="new-password"
                      description="At least 8 characters."
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="phone">
                  {(field) => (
                    <field.PhoneField
                      label="Phone"
                      defaultCountry="ID"
                      description="Stored as E.164 string."
                    />
                  )}
                </form.AppField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <form.AppField name="quantity">
                  {(field) => (
                    <field.NumberField
                      label="Quantity"
                      unit="pcs"
                      min={0}
                      max={1000}
                      description="Clearing stores undefined."
                    />
                  )}
                </form.AppField>
                <form.AppField name="priceMinor">
                  {(field) => (
                    <field.CurrencyField
                      label="Price"
                      currency={DEFAULT_CURRENCY}
                      description="Stored as integer minor units."
                    />
                  )}
                </form.AppField>
              </div>

              <form.AppField name="confidence">
                {(field) => (
                  <field.SliderField
                    label="Confidence"
                    min={0}
                    max={100}
                    formatValue={(val) => `${val}%`}
                  />
                )}
              </form.AppField>

              <form.AppField name="budgetRange">
                {(field) => (
                  <field.SliderField
                    label="Allocation range"
                    min={0}
                    max={100}
                    step={5}
                    formatValue={(val) =>
                      Array.isArray(val) ? `${val[0]}% – ${val[1]}%` : `${val}%`
                    }
                  />
                )}
              </form.AppField>

              <form.AppField name="bio">
                {(field) => (
                  <field.TextareaField
                    label="Bio"
                    placeholder="Short internal note…"
                    maxLength={280}
                    rows={3}
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Choice &amp; boolean</CardTitle>
            <CardDescription>
              SelectField, ComboboxField (single &amp; multi), RadioGroupField, CheckboxField,
              CheckboxGroupField, SwitchField, and ToggleGroupField.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <form.AppField name="role">
                  {(field) => (
                    <field.SelectField label="Role" options={ROLE_OPTIONS} clearable required />
                  )}
                </form.AppField>

                <form.AppField name="primaryStack">
                  {(field) => (
                    <field.ComboboxField
                      label="Primary library"
                      options={FRAMEWORK_OPTIONS}
                      placeholder="Search libraries…"
                    />
                  )}
                </form.AppField>
              </div>

              <form.AppField name="tools">
                {(field) => (
                  <field.ComboboxField
                    label="Stack modules"
                    multiple
                    options={FRAMEWORK_OPTIONS}
                    placeholder="Add libraries…"
                  />
                )}
              </form.AppField>

              <form.AppField name="plan">
                {(field) => (
                  <field.RadioGroupField
                    label="Plan"
                    options={PLAN_OPTIONS}
                    variant="card"
                    required
                  />
                )}
              </form.AppField>

              <form.AppField name="channels">
                {(field) => (
                  <field.CheckboxGroupField
                    label="Notification channels"
                    options={CHANNEL_OPTIONS}
                    variant="card"
                    required
                  />
                )}
              </form.AppField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <form.AppField name="cadence">
                  {(field) => (
                    <field.ToggleGroupField label="Report cadence" options={CADENCE_OPTIONS} />
                  )}
                </form.AppField>
                <form.AppField name="tags">
                  {(field) => (
                    <field.ToggleGroupField label="Tags" options={TAG_OPTIONS} multiple />
                  )}
                </form.AppField>
              </div>

              <Separator />

              <form.AppField name="autoRenew">
                {(field) => (
                  <field.SwitchField
                    label="Auto-renew subscription"
                    description="Bill the default payment method automatically."
                  />
                )}
              </form.AppField>

              <form.AppField name="marketingOptIn">
                {(field) => (
                  <field.CheckboxField
                    label="Send release notes"
                    description="Occasional product updates by email."
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date, time, OTP &amp; upload</CardTitle>
            <CardDescription>
              DateField (YYYY-MM-DD), DateRangeField, DateTimeField (UTC ISO-8601), OtpField, and
              UploadField.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <form.AppField name="startDate">
                  {(field) => (
                    <field.DateField label="Start date" description="Stored as YYYY-MM-DD." />
                  )}
                </form.AppField>
                <form.AppField name="launchAt">
                  {(field) => (
                    <field.DateTimeField
                      label="Launch date & time"
                      description="Edited locally; stored as UTC ISO-8601."
                    />
                  )}
                </form.AppField>
              </div>

              <form.AppField name="windowRange">
                {(field) => (
                  <field.DateRangeField
                    label="Maintenance window"
                    description="Two-month calendar range picker."
                  />
                )}
              </form.AppField>

              <form.AppField name="otpCode">
                {(field) => (
                  <field.OtpField
                    label="Verification code"
                    length={6}
                    separatorAfter={3}
                    description="6-digit one-time code."
                  />
                )}
              </form.AppField>

              <form.AppField name="avatarUrl">
                {(field) => (
                  <field.UploadField
                    label="Avatar"
                    hint="PNG, JPEG, WebP, or GIF up to 5 MB — posts to POST /uploads"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    upload={uploadFile}
                    resolvePreviewUrl={assetUrl}
                    onError={(error) => toast.error(error.message)}
                  />
                )}
              </form.AppField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repeatable FieldArray</CardTitle>
            <CardDescription>
              Add, remove, and reorder rows with minItems/maxItems bounds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form.AppField name="contacts" mode="array">
              {(field) => (
                <field.FieldArray
                  label="Escalation contacts"
                  description="Between 1 and 5 contacts."
                  addLabel="Add contact"
                  minItems={1}
                  maxItems={5}
                  reorderable
                  createItem={() => ({ name: "", email: "" })}
                  renderItem={({ index }) => (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <form.AppField name={`contacts[${index}].name`}>
                        {(subField) => (
                          <subField.TextField label={`Contact ${index + 1} name`} required />
                        )}
                      </form.AppField>
                      <form.AppField name={`contacts[${index}].email`}>
                        {(subField) => (
                          <subField.TextField
                            label={`Contact ${index + 1} email`}
                            type="email"
                            required
                          />
                        )}
                      </form.AppField>
                    </div>
                  )}
                />
              )}
            </form.AppField>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form.SubmitButton loadingLabel="Validating…">Validate all fields</form.SubmitButton>
        <form.ResetButton>Reset</form.ResetButton>
      </div>
    </Form>
  );
}

function FormWizardTab() {
  const form = useAppForm({
    defaultValues: {
      fullName: "",
      workEmail: "",
      workPhone: "",
      plan: "growth",
      kickoffAt: "",
      notifyTeam: true,
      notes: "",
      acceptTerms: false,
    },
    validators: {
      onChange: wizardSchema,
      onSubmit: wizardSchema,
    },
    onSubmit: ({ value }) => {
      toast.success("Onboarding wizard submitted", {
        description: `${value.fullName} · ${value.plan} · ${value.workPhone}`,
      });
    },
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>3-Step Onboarding Form Wizard</CardTitle>
        <CardDescription>
          One shared TanStack Form instance across steps, per-step validation on Next, free Back
          navigation, and zero router coupling.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form form={form} aria-label="Onboarding wizard">
          <Wizard steps={WIZARD_STEPS}>
            <WizardStepper />
            <Separator />
            <form.FormError />

            <WizardStep id="account">
              <FieldGroup className="gap-4">
                <form.AppField name="fullName">
                  {(field) => (
                    <field.TextField
                      label="Full name"
                      autoComplete="name"
                      enterKeyHint="next"
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="workEmail">
                  {(field) => (
                    <field.TextField
                      label="Work email"
                      type="email"
                      autoComplete="email"
                      enterKeyHint="next"
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="workPhone">
                  {(field) => <field.PhoneField label="Work phone" defaultCountry="ID" required />}
                </form.AppField>
              </FieldGroup>
            </WizardStep>

            <WizardStep id="schedule">
              <FieldGroup className="gap-4">
                <form.AppField name="plan">
                  {(field) => (
                    <field.RadioGroupField
                      label="Workspace plan"
                      options={PLAN_OPTIONS}
                      variant="card"
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="kickoffAt">
                  {(field) => (
                    <field.DateTimeField
                      label="Kickoff call"
                      description="Scheduled in your local timezone and stored as UTC ISO-8601."
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="notifyTeam">
                  {(field) => (
                    <field.SwitchField
                      label="Notify administrators"
                      description="Send an invite summary once provisioned."
                    />
                  )}
                </form.AppField>
              </FieldGroup>
            </WizardStep>

            <WizardStep id="confirm">
              <FieldGroup className="gap-4">
                <form.AppField name="notes">
                  {(field) => (
                    <field.TextareaField
                      label="Provisioning notes"
                      placeholder="Optional context for the onboarding team…"
                      maxLength={500}
                      rows={3}
                    />
                  )}
                </form.AppField>
                <form.AppField name="acceptTerms">
                  {(field) => (
                    <field.CheckboxField
                      label="I confirm these workspace details are accurate."
                      variant="card"
                      required
                    />
                  )}
                </form.AppField>
              </FieldGroup>
            </WizardStep>

            <Separator />
            <WizardActions submitLabel="Complete setup" loadingLabel="Completing…" />
          </Wizard>
        </Form>
      </CardContent>
    </Card>
  );
}

function FieldsDemo() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fields"
        description="Every Field Block, FieldArray, and Form Wizard wired to TanStack Form with Zod validation. Deletable demo."
      />

      <Tabs defaultValue="catalog" className="gap-6">
        <TabsList>
          <TabsTrigger value="catalog">All Field Blocks</TabsTrigger>
          <TabsTrigger value="wizard">Form Wizard</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <AllFieldBlocksTab />
        </TabsContent>

        <TabsContent value="wizard">
          <FormWizardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
