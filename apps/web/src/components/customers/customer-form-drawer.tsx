import {
  STORED_ASSET_PATH_ERROR,
  storedAssetPathSchema,
} from "@monorepo-boilerplate/api/asset-path";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { FieldGroup } from "@monorepo-boilerplate/ui/components/field";
import {
  Form,
  UnsavedChangesGuard,
  useAppForm,
  type FieldOption,
} from "@monorepo-boilerplate/ui/components/form";
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
import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  tags: z.array(z.string().trim().min(1).max(64)).max(50),
  notes: z.string().max(2000),
  avatarUrl: z
    .string()
    .refine(
      (val) => val === "" || storedAssetPathSchema.safeParse(val).success,
      STORED_ASSET_PATH_ERROR,
    ),
});

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function buildCustomerEditPatch(value: CustomerFormValues, snapshot: CustomerFormValues) {
  return {
    ...(value.name !== snapshot.name ? { name: value.name } : {}),
    ...(value.email !== snapshot.email ? { email: value.email } : {}),
    ...(value.phone.trim() && value.phone !== snapshot.phone ? { phone: value.phone } : {}),
    ...(value.company.trim() && value.company !== snapshot.company
      ? { company: value.company }
      : {}),
    ...(value.status !== snapshot.status ? { status: value.status } : {}),
    ...((value.balanceMinor ?? 0) !== (snapshot.balanceMinor ?? 0)
      ? { balanceMinor: value.balanceMinor ?? 0 }
      : {}),
    ...(value.currency !== snapshot.currency ? { currency: value.currency } : {}),
    ...(!arraysEqual(value.tags, snapshot.tags) ? { tags: value.tags } : {}),
    ...(value.notes.trim() && value.notes !== snapshot.notes ? { notes: value.notes } : {}),
    ...(value.avatarUrl !== snapshot.avatarUrl
      ? { avatarUrl: value.avatarUrl ? value.avatarUrl : null }
      : {}),
  };
}

type CustomerFormValues = z.infer<typeof customerFormSchema>;

const EMPTY_VALUES: CustomerFormValues = {
  name: "",
  email: "",
  phone: "",
  company: "",
  status: "active",
  balanceMinor: 0,
  currency: DEFAULT_CURRENCY,
  tags: [],
  notes: "",
  avatarUrl: "",
};

function toFormValues(row: {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: "active" | "inactive" | "archived";
  balanceMinor: number;
  currency: string;
  tags?: string[] | null;
  notes: string | null;
  avatarUrl: string | null;
}): CustomerFormValues {
  return {
    name: row.name,
    email: row.email,
    phone: row.phone ?? "",
    company: row.company ?? "",
    status: row.status,
    balanceMinor: row.balanceMinor,
    currency: row.currency,
    tags: row.tags ?? [],
    notes: row.notes ?? "",
    avatarUrl: row.avatarUrl ?? "",
  };
}

type CustomerFormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass an id to edit; null creates a new customer. */
  customerId: string | null;
};

export function CustomerFormDrawer({ open, onOpenChange, customerId }: CustomerFormDrawerProps) {
  const queryClient = useQueryClient();
  const isEditing = customerId !== null;
  const [tagInputValue, setTagInputValue] = useState("");

  const detail = useQuery({
    ...trpc.customers.byId.queryOptions({ id: customerId ?? "" }),
    enabled: open && isEditing,
  });

  const tagsQuery = useQuery({
    ...trpc.customers.tags.queryOptions(),
    enabled: open,
  });

  const initialCachedSnapshot =
    open && isEditing && detail.data && detail.data.id === customerId
      ? toFormValues(detail.data)
      : EMPTY_VALUES;
  const [snapshot, setSnapshot] = useState<CustomerFormValues>(() => initialCachedSnapshot);
  const hydratedSessionRef = useRef<string | null>(
    open && (!isEditing || (detail.data && detail.data.id === customerId))
      ? (customerId ?? "__new__")
      : null,
  );

  const blockerRef = useRef<{ status: string; reset?: () => void } | null>(null);

  const create = useMutation(
    trpc.customers.create.mutationOptions({
      onSuccess: () => {
        toast.success("Customer created");
        setSnapshot(EMPTY_VALUES);
        form.reset(EMPTY_VALUES);
        setTagInputValue("");
        hydratedSessionRef.current = null;
        if (blockerRef.current?.status === "blocked") {
          blockerRef.current.reset?.();
        }
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
        setSnapshot(EMPTY_VALUES);
        form.reset(EMPTY_VALUES);
        setTagInputValue("");
        hydratedSessionRef.current = null;
        if (blockerRef.current?.status === "blocked") {
          blockerRef.current.reset?.();
        }
        void queryClient.invalidateQueries(trpc.customers.pathFilter());
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const form = useAppForm({
    defaultValues: snapshot,
    validators: {
      onChange: customerFormSchema,
      onSubmit: customerFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        if (isEditing && customerId) {
          const patch = buildCustomerEditPatch(value, snapshot);
          if (Object.keys(patch).length === 0) {
            setSnapshot(EMPTY_VALUES);
            form.reset(EMPTY_VALUES);
            setTagInputValue("");
            hydratedSessionRef.current = null;
            if (blockerRef.current?.status === "blocked") {
              blockerRef.current.reset?.();
            }
            onOpenChange(false);
            return;
          }
          await update.mutateAsync({
            id: customerId,
            ...patch,
          });
        } else {
          await create.mutateAsync({
            name: value.name,
            email: value.email,
            status: value.status,
            balanceMinor: value.balanceMinor ?? 0,
            currency: value.currency,
            tags: value.tags,
            ...(value.phone ? { phone: value.phone } : {}),
            ...(value.company ? { company: value.company } : {}),
            ...(value.notes ? { notes: value.notes } : {}),
            ...(value.avatarUrl ? { avatarUrl: value.avatarUrl } : {}),
          });
        }
      } catch {
        // Surfaced via mutation onError toast and FormError (create.error / update.error).
      }
    },
  });

  // Snapshot initial values once per drawer open/record session so background or
  // focus refetches never overwrite in-progress local edits.
  useEffect(() => {
    if (!open) {
      hydratedSessionRef.current = null;
      setSnapshot(EMPTY_VALUES);
      form.reset(EMPTY_VALUES);
      setTagInputValue("");
      return;
    }

    const sessionKey = customerId ?? "__new__";
    if (hydratedSessionRef.current === sessionKey) {
      return;
    }

    if (!isEditing) {
      hydratedSessionRef.current = sessionKey;
      setSnapshot(EMPTY_VALUES);
      form.reset(EMPTY_VALUES);
      setTagInputValue("");
      return;
    }

    if (detail.data && detail.data.id === customerId) {
      const nextSnapshot = toFormValues(detail.data);
      hydratedSessionRef.current = sessionKey;
      setSnapshot(nextSnapshot);
      form.reset(nextSnapshot);
      setTagInputValue("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, customerId, detail.data]);

  const [isDirty, isFormSubmitting] = useStore(form.store, (state) => [
    state.isDirty,
    state.isSubmitting,
  ]);
  const hasPendingTagText = tagInputValue.trim().length > 0;
  const hasUnsavedChanges = isDirty || hasPendingTagText;
  const submitting = create.isPending || update.isPending || isFormSubmitting;
  const currency = form.getFieldValue("currency") || DEFAULT_CURRENCY;

  const blocker = useBlocker({
    shouldBlockFn: () => open && (hasUnsavedChanges || submitting),
    enableBeforeUnload: () => open && (hasUnsavedChanges || submitting),
    disabled: !(open && (hasUnsavedChanges || submitting)),
    withResolver: true,
  });
  blockerRef.current = blocker;

  return (
    <UnsavedChangesGuard
      form={form}
      isDirty={hasUnsavedChanges}
      enabled={open}
      pending={submitting}
      blocker={blocker}
      onOpenChange={onOpenChange}
      onDiscard={() => {
        setSnapshot(EMPTY_VALUES);
        form.reset(EMPTY_VALUES);
        setTagInputValue("");
        hydratedSessionRef.current = null;
      }}
      title="Discard unsaved changes?"
      description="You have unsaved changes to this customer. Leaving now will discard them."
    >
      {({ requestClose, guardOpenChange }) => (
        <Sheet open={open} onOpenChange={guardOpenChange}>
          <SheetContent className="gap-0 overflow-y-auto overscroll-contain">
            <SheetHeader>
              <SheetTitle>{isEditing ? "Edit customer" : "New customer"}</SheetTitle>
              <SheetDescription>
                {isEditing
                  ? "Update the record. Money is edited in major units and stored in minor units."
                  : "Creates a row through the reference-flow tRPC mutation."}
              </SheetDescription>
            </SheetHeader>

            <Form form={form} className="flex-1 gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
              <form.FormError
                error={create.error ?? update.error}
                title="Could not save customer"
              />

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
                    {(field) => (
                      <field.SelectField label="Status" options={STATUS_OPTIONS} required />
                    )}
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

                <form.AppField name="tags">
                  {(field) => (
                    <field.TagField
                      label="Tags"
                      placeholder="Add a tag…"
                      suggestions={tagsQuery.data ?? []}
                      maxTags={20}
                      inputValue={tagInputValue}
                      onInputValueChange={setTagInputValue}
                      description="Press Enter or comma to add tags."
                    />
                  )}
                </form.AppField>

                <form.AppField name="avatarUrl">
                  {(field) => (
                    <field.UploadField
                      label="Avatar"
                      hint="PNG, JPEG, WebP, or GIF up to 5 MB"
                      removeLabel="Remove avatar"
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
                  onClick={requestClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </SheetFooter>
            </Form>
          </SheetContent>
        </Sheet>
      )}
    </UnsavedChangesGuard>
  );
}
