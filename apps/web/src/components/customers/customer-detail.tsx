import {
  ActivityTimeline,
  ActivityTimelineComposer,
  type ActivityTimelineItem,
} from "@monorepo-boilerplate/ui/components/activity-timeline";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@monorepo-boilerplate/ui/components/avatar";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button, buttonVariants } from "@monorepo-boilerplate/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@monorepo-boilerplate/ui/components/card";
import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";
import { DescriptionList } from "@monorepo-boilerplate/ui/components/description-list";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { RadioGroup, RadioGroupItem } from "@monorepo-boilerplate/ui/components/radio-group";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@monorepo-boilerplate/ui/components/status-badge";
import { StatusScreen } from "@monorepo-boilerplate/ui/components/status-screen";
import { formatDate, formatDateTime, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import type * as React from "react";
import { useState } from "react";

import { assetUrl } from "@/lib/asset-url";

export type CustomerDetailRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: "active" | "inactive" | "archived";
  balanceMinor: number;
  currency: string;
  avatarUrl: string | null;
  tags: readonly string[];
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type CustomerEventRecord = {
  id: string;
  customerId: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
  summary: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
};

const CUSTOMER_STATUS_META: Record<
  CustomerDetailRecord["status"],
  { label: string; tone: StatusBadgeTone }
> = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  archived: { label: "Archived", tone: "warning" },
};

export function toTimelineItems(events: readonly CustomerEventRecord[]): ActivityTimelineItem[] {
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    title: event.summary,
    description: event.body ?? undefined,
    actor: event.actorName
      ? {
          name: event.actorName,
          avatarUrl: assetUrl(event.actorAvatarUrl),
        }
      : undefined,
    timestamp: event.createdAt,
    metadata: event.metadata ?? undefined,
  }));
}

export type CustomerDetailViewProps = {
  customer: CustomerDetailRecord | null | undefined;
  isLoading: boolean;
  error?: string | null;
  onRetryCustomer?: () => void;
  events: readonly CustomerEventRecord[];
  eventsLoading?: boolean;
  eventsError?: string | null;
  onRetryEvents?: () => void;
  onAddNote: (body: string) => Promise<void>;
  addingNote?: boolean;
  onEdit: () => void;
  onArchive: () => Promise<void>;
  archiving?: boolean;
  onRestore: (status: "active" | "inactive") => Promise<void>;
  restoring?: boolean;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
  deleting?: boolean;
  renderBackLink: (props: { className: string; children: React.ReactNode }) => React.ReactElement;
};

function CustomerDetailSkeleton() {
  return (
    <div data-slot="customer-detail-skeleton" className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex min-w-0 items-center gap-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-56" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="size-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-6 md:col-span-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-20" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <ActivityTimeline items={[]} isLoading />
            </CardContent>
          </Card>
        </div>

        <Card className="md:col-span-1">
          <CardHeader>
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Customer detail Screen presentation: Identity Header (48px Avatar with
 * initials fallback, StatusBadge, copyable email, tag pills, Edit + lifecycle
 * overflow actions) over a 2:1 `md:grid-cols-3` layout.
 */
export function CustomerDetailView({
  customer,
  isLoading,
  error,
  onRetryCustomer,
  events,
  eventsLoading = false,
  eventsError = null,
  onRetryEvents,
  onAddNote,
  addingNote = false,
  onEdit,
  onArchive,
  archiving = false,
  onRestore,
  restoring = false,
  canDelete = false,
  onDelete,
  deleting = false,
  renderBackLink,
}: CustomerDetailViewProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string>();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreChoice, setRestoreChoice] = useState<"active" | "inactive" | null>(null);
  const [restoreError, setRestoreError] = useState<string>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  if (isLoading) {
    return <CustomerDetailSkeleton />;
  }

  const backLinkClassName = buttonVariants({ variant: "outline" });
  const backLinkContent = (
    <>
      <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
      Back to customers
    </>
  );

  if (error) {
    return (
      <StatusScreen
        status="error"
        title="Could not load customer"
        description={error}
        primaryAction={
          onRetryCustomer ? (
            <Button type="button" onClick={onRetryCustomer}>
              Try again
            </Button>
          ) : undefined
        }
        secondaryAction={renderBackLink({
          className: backLinkClassName,
          children: backLinkContent,
        })}
      />
    );
  }

  if (!customer) {
    return (
      <StatusScreen
        status="404"
        code="404"
        title="Customer not found"
        description="This customer does not exist or may have been deleted."
        primaryAction={renderBackLink({
          className: backLinkClassName,
          children: backLinkContent,
        })}
      />
    );
  }

  const statusMeta = CUSTOMER_STATUS_META[customer.status];
  const resolvedAvatar = assetUrl(customer.avatarUrl);
  const isArchived = customer.status === "archived";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header
        data-slot="customer-identity-header"
        className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6"
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Avatar size="xl">
            {resolvedAvatar ? <AvatarImage src={resolvedAvatar} alt={customer.name} /> : null}
            <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-heading text-2xl font-semibold tracking-tight wrap-break-word text-foreground">
                {customer.name}
              </h1>
              <StatusBadge tone={statusMeta.tone} dot>
                {statusMeta.label}
              </StatusBadge>
            </div>

            <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <span className="min-w-0 break-all">{customer.email}</span>
              <CopyButton value={customer.email} label="Copy email" className="shrink-0" />
            </div>

            {customer.tags.length > 0 ? (
              <div data-slot="customer-tags" className="flex flex-wrap items-center gap-1.5 pt-1">
                {customer.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="border border-border bg-muted px-2 py-0.5 text-xs font-medium tracking-normal text-foreground normal-case"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isArchived ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setRestoreChoice(null);
                setRestoreError(undefined);
                setRestoreOpen(true);
              }}
            >
              <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              Restore
            </Button>
          ) : null}

          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon aria-hidden="true" data-icon="inline-start" />
            Edit
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="More customer actions"
                />
              }
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                {isArchived ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setRestoreChoice(null);
                      setRestoreError(undefined);
                      setRestoreOpen(true);
                    }}
                  >
                    <RotateCcwIcon aria-hidden="true" />
                    Restore customer
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      setArchiveError(undefined);
                      setArchiveOpen(true);
                    }}
                  >
                    <ArchiveIcon aria-hidden="true" />
                    Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>

              {canDelete && onDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setDeleteError(undefined);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={2}
                items={[
                  {
                    id: "id",
                    label: "Customer ID",
                    value: customer.id,
                    copyValue: customer.id,
                    copyLabel: "Copy customer ID",
                    numeric: true,
                  },
                  {
                    id: "email",
                    label: "Email",
                    value: customer.email,
                    copyValue: customer.email,
                    copyLabel: "Copy email",
                  },
                  {
                    id: "company",
                    label: "Company",
                    value: customer.company,
                  },
                  {
                    id: "phone",
                    label: "Phone",
                    value: customer.phone,
                    copyValue: customer.phone ?? undefined,
                    copyLabel: "Copy phone",
                  },
                  {
                    id: "status",
                    label: "Status",
                    value: (
                      <StatusBadge tone={statusMeta.tone} dot>
                        {statusMeta.label}
                      </StatusBadge>
                    ),
                  },
                  {
                    id: "balance",
                    label: "Balance",
                    value: formatMoney({
                      minor: customer.balanceMinor,
                      currency: customer.currency,
                    }),
                    numeric: true,
                  },
                  {
                    id: "created",
                    label: "Created",
                    value: formatDate(customer.createdAt),
                  },
                  {
                    id: "updated",
                    label: "Updated",
                    value: formatDateTime(customer.updatedAt),
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                items={toTimelineItems(events)}
                isLoading={eventsLoading}
                error={eventsError}
                onRetry={onRetryEvents}
                emptyTitle="No activity yet."
                composer={<ActivityTimelineComposer onSubmit={onAddNote} pending={addingNote} />}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
              {customer.notes?.trim() ? customer.notes : "No notes."}
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmationDialog
        open={archiveOpen}
        onOpenChange={(next) => {
          if (!archiving) setArchiveOpen(next);
        }}
        title="Archive customer?"
        description="Archived customers are hidden from the default list. Their record, notes, and avatar are preserved, and you can restore them anytime."
        confirmLabel="Archive customer"
        pendingLabel="Archiving…"
        pending={archiving}
        error={archiveError}
        onConfirm={() => {
          setArchiveError(undefined);
          void onArchive()
            .then(() => setArchiveOpen(false))
            .catch((err) => {
              setArchiveError(err instanceof Error ? err.message : "Could not archive customer.");
            });
        }}
      />

      <Dialog
        open={restoreOpen}
        onOpenChange={(next) => {
          if (!restoring) setRestoreOpen(next);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Restore customer</DialogTitle>
            <DialogDescription>
              Choose the status this customer should have when restored to the active list.
            </DialogDescription>
          </DialogHeader>

          <FieldSet>
            <FieldLegend variant="label">Restored status</FieldLegend>
            <RadioGroup
              value={restoreChoice ?? ""}
              onValueChange={(value) => {
                if (value === "active" || value === "inactive") {
                  setRestoreChoice(value);
                  setRestoreError(undefined);
                }
              }}
              className="grid gap-2"
            >
              <FieldLabel htmlFor="restore-status-active" className="cursor-pointer">
                <Field orientation="horizontal">
                  <RadioGroupItem id="restore-status-active" value="active" />
                  <FieldContent>
                    <FieldTitle>Active</FieldTitle>
                    <FieldDescription>
                      Customer returns as an active account in the default list.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>

              <FieldLabel htmlFor="restore-status-inactive" className="cursor-pointer">
                <Field orientation="horizontal">
                  <RadioGroupItem id="restore-status-inactive" value="inactive" />
                  <FieldContent>
                    <FieldTitle>Inactive</FieldTitle>
                    <FieldDescription>
                      Customer returns to the default list marked as inactive.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            </RadioGroup>
          </FieldSet>

          {restoreError ? (
            <p role="alert" className="text-sm text-destructive">
              {restoreError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={restoring}
              onClick={() => setRestoreOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!restoreChoice || restoring}
              onClick={() => {
                if (!restoreChoice) return;
                setRestoreError(undefined);
                void onRestore(restoreChoice)
                  .then(() => setRestoreOpen(false))
                  .catch((err) => {
                    setRestoreError(
                      err instanceof Error ? err.message : "Could not restore customer.",
                    );
                  });
              }}
            >
              {restoring ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {restoring ? "Restoring…" : "Restore customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canDelete && onDelete ? (
        <ConfirmationDialog
          open={deleteOpen}
          onOpenChange={(next) => {
            if (!deleting) setDeleteOpen(next);
          }}
          title="Delete customer permanently?"
          description="This permanently deletes the customer record and all associated activity history. This action cannot be undone."
          confirmLabel="Delete customer"
          confirmVariant="destructive"
          pendingLabel="Deleting…"
          pending={deleting}
          error={deleteError}
          onConfirm={() => {
            setDeleteError(undefined);
            void onDelete()
              .then(() => setDeleteOpen(false))
              .catch((err) => {
                setDeleteError(err instanceof Error ? err.message : "Could not delete customer.");
              });
          }}
        />
      ) : null}
    </div>
  );
}
