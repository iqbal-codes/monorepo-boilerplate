import {
  ActivityTimeline,
  ActivityTimelineComposer,
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
import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";
import { DescriptionList } from "@monorepo-boilerplate/ui/components/description-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
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
import { useEffect, useState } from "react";

import {
  CustomerArchiveDialog,
  CustomerDeleteDialog,
  CustomerRestoreDialog,
} from "@/components/customers/customer-detail-dialogs";
import { CustomerDetailSkeleton } from "@/components/customers/customer-detail-skeleton";
import {
  CUSTOMER_STATUS_META,
  toTimelineItems,
  type CustomerDetailRecord,
  type CustomerEventRecord,
  type CustomerEventType,
} from "@/components/customers/customer-detail-timeline";
import { assetUrl } from "@/lib/asset-url";

export {
  toTimelineItems,
  type CustomerDetailRecord,
  type CustomerEventRecord,
  type CustomerEventType,
};

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

  const customerId = customer?.id;
  // Reset any open lifecycle confirmation if rendered unkeyed across customer transitions.
  useEffect(() => {
    setArchiveOpen(false);
    setArchiveError(undefined);
    setRestoreOpen(false);
    setRestoreChoice(null);
    setRestoreError(undefined);
    setDeleteOpen(false);
    setDeleteError(undefined);
  }, [customerId]);

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

  function openRestoreDialog() {
    setRestoreChoice(null);
    setRestoreError(undefined);
    setRestoreOpen(true);
  }

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
            <Button type="button" size="sm" onClick={openRestoreDialog}>
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
                  <DropdownMenuItem onClick={openRestoreDialog}>
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

      <CustomerArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
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

      <CustomerRestoreDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        choice={restoreChoice}
        onChoiceChange={(value) => {
          setRestoreChoice(value);
          setRestoreError(undefined);
        }}
        pending={restoring}
        error={restoreError}
        onConfirm={() => {
          if (!restoreChoice) return;
          setRestoreError(undefined);
          void onRestore(restoreChoice)
            .then(() => setRestoreOpen(false))
            .catch((err) => {
              setRestoreError(err instanceof Error ? err.message : "Could not restore customer.");
            });
        }}
      />

      {canDelete && onDelete ? (
        <CustomerDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
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
