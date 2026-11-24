import { Button } from "@monorepo-boilerplate/ui/components/button";
import { FieldGroup } from "@monorepo-boilerplate/ui/components/field";
import { Form, useAppForm, type FieldOption } from "@monorepo-boilerplate/ui/components/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@monorepo-boilerplate/ui/components/sheet";
import { DEFAULT_CURRENCY } from "@monorepo-boilerplate/ui/lib/format";
import { isValidPhoneNumber } from "@monorepo-boilerplate/ui/lib/phone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import z from "zod";

import { assetUrl } from "@/lib/asset-url";
import { uploadFile } from "@/lib/upload";
import { trpc } from "@/utils/trpc";

const STATUS_OPTIONS: ReadonlyArray<FieldOption> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  email: z.email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((val) => val === "" || isValidPhoneNumber(val), "Enter a valid phone number."),
  company: z.string().trim().max(200),
  status: z.enum(["active", "inactive", "archived"]),
  balanceMinor: z.number().int().optional(),
  currency: z.string().length(3),
  notes: z.string().max(2000),
  avatarUrl: z.string().max(2048),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

const EMPTY_VALUES: CustomerFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  status: "active",
  balanceMinor: 0,
  currency: DEFAULT_CURRENCY,
  notes: "",
  avatarUrl: "",
};

type CustomerFormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an id to edit; null creates a new customer. */
  customerId: string | null;
};

export function CustomerFormDrawer({ open, onOpenChange, customerId }: CustomerFormDrawerProps) {
  const queryClient = useQueryClient();
  const isEditing = customerId !== null;

  const detail = useQuery({
    ...trpc.customers.byId.queryOptions({ id: customerId ?? "" }),
    enabled: open && isEditing,
  });

  const create = useMutation(
    trpc.customers.create.mutationOptions({
      onSuccess: () => {
        toast.success("Customer created");
        void queryClient.invalidateQueries(trpc.customers.pathFilter());
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const update = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: () => {
        toast.success("Customer updated");
        void queryClient.invalidateQueries(trpc.customers.pathFilter());
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: EMPTY_VALUES,
    validators: {
      onChange: customerFormSchema,
      onSubmit: customerFormSchema,
    },
    onSubmit: async ({ value }) => {
      const payload = {
        name: value.name,
        email: value.email,
        status: value.status,
        balanceMinor: value.balanceMinor ?? 0,
        currency: value.currency,
        ...(value.phone ? { phone: value.phone } : {}),
        ...(value.company ? { company: value.company } : {}),
        ...(value.notes ? { notes: value.notes } : {}),
        ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}),
      };
      if (isEditing && customerId) {
        await update.mutateAsync({ id: customerId, ...payload });
      } else {
        await create.mutateAsync(payload);
      }
    },
  });

  // Reset the form whenever the drawer opens for a different record.
  useEffect(() => {
    if (!open) return;
    if (isEditing && detail.data) {
      const row = detail.data;
      form.reset({
        name: row.name,
        email: row.email,
        phone: row.phone ?? "",
        company: row.company ?? "",
        status: row.status,
        balanceMinor: row.balanceMinor,
        currency: row.currency,
        notes: row.notes ?? "",
        avatarUrl: row.avatarUrl ?? "",
      });
    } else if (!isEditing) {
      form.reset(EMPTY_VALUES);
    }
    // `form` is stable; re-running on data arrival is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, customerId, detail.data]);

  const submitting = create.isPending || update.isPending;
  const currency = form.getFieldValue("currency") || DEFAULT_CURRENCY;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto overscroll-contain">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit customer" : "New customer"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the record. Money is edited in major units and stored in minor units."
              : "Creates a row through the reference-flow tRPC mutation."}
          </SheetDescription>
        </SheetHeader>

        <Form form={form} className="flex-1 gap-4 px-8 pb-8">
          <form.FormError error={create.error ?? update.error} title="Could not save customer" />

          <FieldGroup className="gap-5">
            <form.AppField name="name">
              {(field) => <field.TextField label="Name" autoComplete="name" required />}
            </form.AppField>

            <form.AppField name="email">
              {(field) => (
                <field.TextField label="Email" type="email" autoComplete="email" required />
              )}
            </form.AppField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <form.AppField name="company">
                {(field) => <field.TextField label="Company" autoComplete="organization" />}
              </form.AppField>
              <form.AppField name="phone">
                {(field) => <field.PhoneField label="Phone" defaultCountry="US" />}
              </form.AppField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <form.AppField name="status">
                {(field) => <field.SelectField label="Status" options={STATUS_OPTIONS} required />}
              </form.AppField>

              <form.AppField name="balanceMinor">
                {(field) => (
                  <field.CurrencyField
                    label="Balance"
                    currency={currency}
                    description="Can be negative; stored in minor units."
                  />
                )}
              </form.AppField>
            </div>

            <form.AppField name="avatarUrl">
              {(field) => (
                <field.UploadField
                  label="Avatar"
                  hint="PNG, JPEG, WebP, or GIF up to 5 MB"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  upload={uploadFile}
                  resolvePreviewUrl={assetUrl}
                  onError={(error) => toast.error(error.message)}
                />
              )}
            </form.AppField>

            <form.AppField name="notes">
              {(field) => <field.TextareaField label="Notes" rows={3} maxLength={2000} />}
            </form.AppField>
          </FieldGroup>

          <SheetFooter className="mt-auto px-0">
            <form.SubmitButton
              disabled={submitting}
              loadingLabel={isEditing ? "Saving…" : "Creating…"}
            >
              {isEditing ? "Save changes" : "Create customer"}
            </form.SubmitButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
          </SheetFooter>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
