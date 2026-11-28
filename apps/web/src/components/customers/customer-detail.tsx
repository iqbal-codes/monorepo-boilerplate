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
  DetailAside,
  DetailGrid,
  DetailHeader,
  DetailMain,
  DetailScreen,
} from "@monorepo-boilerplate/ui/components/detail-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import { KpiCard, KpiGrid } from "@monorepo-boilerplate/ui/components/kpi-card";
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
 * Customer detail Screen presentation built on the shared `DetailScreen` /
 * `DetailHeader` / `DetailGrid` layout: 2-tier mobile header, properties rail
 * (`Details` + `Notes`) leading on narrow screens, and KPI strip +
 * `ActivityTimeline` in the `2:1` primary column on desktop.
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
  const formattedBalance = formatMoney({
    minor: customer.balanceMinor,
    currency: customer.currency,
  });

  function openRestoreDialog() {
    setRestoreChoice(null);
    setRestoreError(undefined);
    setRestoreOpen(true);
  }

  return (
    <DetailScreen>
      <DetailHeader
        media={
          <Avatar size="xl">
            {resolvedAvatar ? <AvatarImage src={resolvedAvatar} alt={customer.name} /> : null}
            <AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
          </Avatar>
        }
        title={customer.name}
        badge={
          <StatusBadge tone={statusMeta.tone} dot>
            {statusMeta.label}
          </StatusBadge>
        }
        subtitle={
          <>
            <span className="min-w-0 truncate" title={customer.email}>
              {customer.email}
            </span>
            <CopyButton value={customer.email} label="Copy email" className="shrink-0" />
          </>
        }
        meta={
          customer.tags.length > 0 ? (
            <div data-slot="customer-tags" className="flex flex-wrap items-center gap-1.5">
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
          ) : undefined
        }
        actions={
          <>
            {isArchived ? (
              <Button
                type="button"
                size="sm"
                className="flex-1 sm:flex-initial"
                onClick={openRestoreDialog}
              >
                <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
                Restore
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-initial"
              onClick={onEdit}
            >
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
                    className="shrink-0"
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
          </>
        }
      />

      <DetailGrid>
        <DetailAside>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                columns={1}
                className="sm:grid-cols-2 lg:grid-cols-1"
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
                    value: formattedBalance,
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

          <Card size="sm">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
                {customer.notes?.trim() ? customer.notes : "No notes."}
              </p>
            </CardContent>
          </Card>
        </DetailAside>

        <DetailMain>
          <KpiGrid variant="strip" columns={3}>
            <KpiCard
              label="Balance"
              value={formattedBalance}
              tone={customer.balanceMinor < 0 ? "danger" : "default"}
              hint={customer.currency}
            />
            <KpiCard
              label="Customer since"
              value={formatDate(customer.createdAt)}
              hint={`Updated ${formatDate(customer.updatedAt)}`}
            />
            <KpiCard
              label="Activity"
              value={eventsLoading ? "—" : events.length}
              hint={
                eventsLoading
                  ? "Loading events"
                  : events.length === 1
                    ? "Recorded event"
                    : "Recorded events"
              }
            />
          </KpiGrid>

          <Card size="sm">
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
        </DetailMain>
      </DetailGrid>

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
    </DetailScreen>
  );
}
