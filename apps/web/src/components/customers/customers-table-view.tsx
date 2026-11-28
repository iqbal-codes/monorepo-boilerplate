import type { ActiveFilterChip } from "@monorepo-boilerplate/ui/components/active-filter-chips";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@monorepo-boilerplate/ui/components/avatar";
import { BulkActionBar } from "@monorepo-boilerplate/ui/components/bulk-action-bar";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import {
  columnsFor,
  DataTable,
  type ColumnPinningState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@monorepo-boilerplate/ui/components/data-table";
import {
  DataTableViewOptions,
  type DataTableDensity,
  type DataTableViewColumn,
} from "@monorepo-boilerplate/ui/components/data-table-view-options";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { FacetedFilter } from "@monorepo-boilerplate/ui/components/faceted-filter";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { ListToolbar } from "@monorepo-boilerplate/ui/components/list-toolbar";
import { RowActions, type RowActionItem } from "@monorepo-boilerplate/ui/components/row-actions";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import { formatDate, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import {
  ArchiveIcon,
  EyeIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

import {
  CustomerArchiveDialog,
  CustomerDeleteDialog,
  CustomerRestoreDialog,
} from "@/components/customers/customer-detail-dialogs";
import { CUSTOMER_STATUS_META } from "@/components/customers/customer-detail-timeline";
import { assetUrl } from "@/lib/asset-url";
import type { CustomerStatusValue } from "@/lib/use-data-table-search-params";

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: CustomerStatusValue;
  balanceMinor: number;
  currency: string;
  avatarUrl: string | null;
  tags: string[];
  createdAt: Date | string;
};

export type CustomerFacets = {
  status: Record<CustomerStatusValue, number>;
  tags: ReadonlyArray<{ value: string; count: number }>;
};

const STATUS_ORDER: readonly CustomerStatusValue[] = ["active", "inactive", "archived"];

const VIEW_COLUMNS: readonly DataTableViewColumn[] = [
  { id: "name", label: "Customer" },
  { id: "company", label: "Company" },
  { id: "status", label: "Status" },
  { id: "balanceMinor", label: "Balance" },
  { id: "createdAt", label: "Created" },
];

const DEFAULT_VISIBILITY: VisibilityState = {};
const DEFAULT_PINNING: ColumnPinningState = { start: [], end: [] };
const NO_SELECTION: ReadonlySet<string> = new Set();

const helper = columnsFor<CustomerRow>();

export type CustomersTableViewProps = {
  rows: readonly CustomerRow[];
  rowCount: number;
  facets?: CustomerFacets;
  search: string;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onClearSearch?: () => void;
  statuses: readonly CustomerStatusValue[];
  onStatusesChange: (next: readonly CustomerStatusValue[]) => void;
  tags: readonly string[];
  onTagsChange: (next: readonly string[]) => void;
  onClearFilters: () => void;
  onResetFilters: () => void;
  pagination: PaginationState;
  onPaginationChange: (next: PaginationState) => void;
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  density: DataTableDensity;
  onDensityChange: (density: DataTableDensity) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  canSelect: boolean;
  canDelete: boolean;
  notice?: { text: string; error?: boolean } | null;
  onClearNotice?: () => void;
  onNewCustomer: () => void;
  onViewCustomer: (id: string) => void;
  onEditCustomer: (id: string) => void;
  onArchiveCustomers: (ids: string[]) => Promise<void>;
  archiving: boolean;
  onRestoreCustomer: (id: string, status: "active" | "inactive") => Promise<void>;
  restoring: boolean;
  onDeleteCustomer: (id: string) => Promise<void>;
  deleting: boolean;
  renderCustomerLink: (props: {
    customerId: string;
    className: string;
    children: ReactNode;
  }) => ReactNode;
};

/**
 * Presentation and interaction layer for `/customers`: two-tier `ListToolbar`,
 * `FacetedFilter`s, `ActiveFilterChips`, `DataTableViewOptions`, conditional
 * `BulkActionBar`, `DataTable` with `Avatar`/`StatusBadge`/`RowActions`, and
 * lifecycle confirmation dialogs.
 */
export function CustomersTableView({
  rows,
  rowCount,
  facets,
  search,
  searchInput,
  onSearchInputChange,
  onClearSearch,
  statuses,
  onStatusesChange,
  tags,
  onTagsChange,
  onClearFilters,
  onResetFilters,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  density,
  onDensityChange,
  isLoading,
  isFetching,
  isError,
  errorMessage,
  onRetry,
  canSelect,
  canDelete,
  notice,
  onClearNotice,
  onNewCustomer,
  onViewCustomer,
  onEditCustomer,
  onArchiveCustomers,
  archiving,
  onRestoreCustomer,
  restoring,
  onDeleteCustomer,
  deleting,
  renderCustomerLink,
}: CustomersTableViewProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const archiveRef = useRef<HTMLButtonElement>(null);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_VISIBILITY);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(DEFAULT_PINNING);

  const scope = JSON.stringify({
    search,
    searchInput,
    statuses,
    tags,
    pagination,
    sorting,
  });

  const [selection, setSelection] = useState({ scope, ids: NO_SELECTION });
  const [bulkConfirm, setBulkConfirm] = useState<{ scope: string; ids: string[] } | null>(null);
  const [bulkError, setBulkError] = useState<string>();

  if (selection.scope !== scope) setSelection({ scope, ids: NO_SELECTION });
  if (bulkConfirm && bulkConfirm.scope !== scope) setBulkConfirm(null);

  const [rowArchiveId, setRowArchiveId] = useState<string | null>(null);
  const [rowArchiveError, setRowArchiveError] = useState<string>();
  const [rowRestoreId, setRowRestoreId] = useState<string | null>(null);
  const [restoreChoice, setRestoreChoice] = useState<"active" | "inactive" | null>(null);
  const [rowRestoreError, setRowRestoreError] = useState<string>();
  const [rowDeleteId, setRowDeleteId] = useState<string | null>(null);
  const [rowDeleteError, setRowDeleteError] = useState<string>();

  const selected = useMemo(
    () =>
      canSelect && selection.scope === scope
        ? new Set(
            rows
              .filter((row) => row.status !== "archived" && selection.ids.has(row.id))
              .map((row) => row.id),
          )
        : NO_SELECTION,
    [canSelect, rows, scope, selection.ids, selection.scope],
  );

  const isArchivedOnlyView = statuses.length === 1 && statuses[0] === "archived";

  const statusOptions = useMemo(
    () =>
      STATUS_ORDER.map((value) => ({
        value,
        label: CUSTOMER_STATUS_META[value].label,
        count: facets?.status[value],
      })),
    [facets],
  );

  const tagOptions = useMemo(() => {
    const byValue = new Map<string, number>();
    for (const item of facets?.tags ?? []) {
      byValue.set(item.value, item.count);
    }
    for (const selectedTag of tags) {
      if (!byValue.has(selectedTag)) {
        byValue.set(selectedTag, 0);
      }
    }
    return [...byValue.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({
        value,
        label: value,
        count,
      }));
  }, [facets, tags]);

  const activeFilters = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (search) {
      chips.push({
        id: "search",
        label: "Search",
        value: search,
        onRemove: () => {
          if (onClearSearch) onClearSearch();
          else onSearchInputChange("");
        },
      });
    }
    for (const statusValue of statuses) {
      chips.push({
        id: `status:${statusValue}`,
        label: "Status",
        value: CUSTOMER_STATUS_META[statusValue].label,
        onRemove: () => onStatusesChange(statuses.filter((item) => item !== statusValue)),
      });
    }
    for (const tag of tags) {
      chips.push({
        id: `tag:${tag}`,
        label: "Tag",
        value: tag,
        onRemove: () => onTagsChange(tags.filter((item) => item !== tag)),
      });
    }
    return chips;
  }, [onClearSearch, onSearchInputChange, onStatusesChange, onTagsChange, search, statuses, tags]);

  const hasAnyFilter = Boolean(search) || statuses.length > 0 || tags.length > 0;
  const mobileActiveCount = statuses.length + tags.length;

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: "Customer",
          cell: (info) => {
            const row = info.row.original;
            const resolvedAvatar = assetUrl(row.avatarUrl);
            return (
              <div className="flex min-w-0 items-center gap-3">
                <Avatar>
                  {resolvedAvatar ? <AvatarImage src={resolvedAvatar} alt={row.name} /> : null}
                  <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-col">
                  {renderCustomerLink({
                    customerId: row.id,
                    className: "w-fit font-medium hover:underline",
                    children: row.name,
                  })}
                  <span className="truncate text-xs text-muted-foreground">{row.email}</span>
                </div>
              </div>
            );
          },
        }),
        helper.accessor("company", {
          header: "Company",
          cell: (info) => info.getValue() ?? "—",
        }),
        helper.accessor("status", {
          header: "Status",
          cell: (info) => {
            const status = info.getValue();
            const meta = CUSTOMER_STATUS_META[status];
            return (
              <StatusBadge tone={meta.tone} dot>
                {meta.label}
              </StatusBadge>
            );
          },
        }),
        helper.accessor("balanceMinor", {
          header: "Balance",
          cell: (info) => (
            <span
              className={info.getValue() < 0 ? "tabular-nums text-destructive" : "tabular-nums"}
            >
              {formatMoney({ minor: info.getValue(), currency: info.row.original.currency })}
            </span>
          ),
        }),
        helper.accessor("createdAt", {
          header: "Created",
          cell: (info) => (
            <span className="text-muted-foreground">{formatDate(info.getValue())}</span>
          ),
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          enableHiding: false,
          enablePinning: false,
          cell: (info) => {
            const row = info.row.original;
            const items: RowActionItem[] = [
              {
                id: "view",
                label: "View",
                icon: <EyeIcon />,
                onSelect: () => onViewCustomer(row.id),
              },
              {
                id: "edit",
                label: "Edit",
                icon: <PencilIcon />,
                onSelect: () => onEditCustomer(row.id),
              },
              ...(row.status === "archived"
                ? [
                    {
                      id: "restore",
                      label: "Restore",
                      icon: <RotateCcwIcon />,
                      separatorBefore: true,
                      onSelect: () => {
                        setRestoreChoice(null);
                        setRowRestoreError(undefined);
                        setRowRestoreId(row.id);
                      },
                    } satisfies RowActionItem,
                  ]
                : [
                    {
                      id: "archive",
                      label: "Archive",
                      icon: <ArchiveIcon />,
                      separatorBefore: true,
                      onSelect: () => {
                        setRowArchiveError(undefined);
                        setRowArchiveId(row.id);
                      },
                    } satisfies RowActionItem,
                  ]),
              ...(canDelete
                ? [
                    {
                      id: "delete",
                      label: "Delete",
                      icon: <Trash2Icon />,
                      variant: "destructive",
                      separatorBefore: true,
                      onSelect: () => {
                        setRowDeleteError(undefined);
                        setRowDeleteId(row.id);
                      },
                    } satisfies RowActionItem,
                  ]
                : []),
            ];

            return <RowActions label={`Actions for ${row.name}`} items={items} />;
          },
        }),
      ]),
    [canDelete, onEditCustomer, onViewCustomer, renderCustomerLink],
  );

  function toggleMobileStatus(value: CustomerStatusValue) {
    const next = statuses.includes(value)
      ? statuses.filter((item) => item !== value)
      : [...statuses, value];
    onStatusesChange(next);
  }

  function toggleMobileTag(value: string) {
    const next = tags.includes(value) ? tags.filter((item) => item !== value) : [...tags, value];
    onTagsChange(next);
  }

  const bulkOpen = bulkConfirm !== null && bulkConfirm.scope === scope;
  const confirmCount = bulkConfirm?.ids.length ?? 0;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <ListToolbar
          search={{
            inputRef: searchRef,
            label: "Search customers",
            placeholder: "Search name, email, or company",
            value: searchInput,
            onChange: onSearchInputChange,
          }}
          activeFilters={activeFilters}
          hasActiveFilters={hasAnyFilter || Boolean(searchInput)}
          onClearFilters={onClearFilters}
          resultLabel={rowCount === 1 ? "1 customer" : `${rowCount} customers`}
          isFetching={isFetching}
          filters={
            <>
              <FacetedFilter
                title="Status"
                options={statusOptions}
                value={statuses}
                onValueChange={(next) => onStatusesChange(next as CustomerStatusValue[])}
                searchPlaceholder="Filter status…"
              />
              <FacetedFilter
                title="Tags"
                options={tagOptions}
                value={tags}
                onValueChange={onTagsChange}
                searchPlaceholder="Filter tags…"
                emptyText="No tags found."
              />
            </>
          }
          actions={
            <DataTableViewOptions
              columns={VIEW_COLUMNS}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnPinning={columnPinning}
              onColumnPinningChange={setColumnPinning}
              density={density}
              onDensityChange={onDensityChange}
              onReset={() => {
                setColumnVisibility(DEFAULT_VISIBILITY);
                setColumnPinning(DEFAULT_PINNING);
              }}
            />
          }
          filterSheet={{
            activeCount: mobileActiveCount,
            title: "Filter customers",
            description: "Choose which customer records to show.",
            onReset: () => {
              onStatusesChange([]);
              onTagsChange([]);
            },
            resetDisabled: mobileActiveCount === 0,
            content: (
              <div className="flex flex-col gap-5">
                <FieldSet>
                  <FieldLegend variant="label">Status</FieldLegend>
                  <div className="grid gap-2">
                    {statusOptions.map((option) => {
                      const optionId = `customer-mobile-status-${option.value}`;
                      return (
                        <FieldLabel key={option.value} htmlFor={optionId}>
                          <Field orientation="horizontal">
                            <Checkbox
                              id={optionId}
                              checked={statuses.includes(option.value)}
                              onCheckedChange={() => toggleMobileStatus(option.value)}
                            />
                            <FieldContent>
                              <FieldTitle className="flex items-center justify-between gap-2">
                                <span>{option.label}</span>
                                {option.count !== undefined ? (
                                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                    {option.count}
                                  </span>
                                ) : null}
                              </FieldTitle>
                            </FieldContent>
                          </Field>
                        </FieldLabel>
                      );
                    })}
                  </div>
                </FieldSet>

                {tagOptions.length > 0 ? (
                  <FieldSet>
                    <FieldLegend variant="label">Tags</FieldLegend>
                    <div className="grid gap-2">
                      {tagOptions.map((option) => {
                        const optionId = `customer-mobile-tag-${option.value}`;
                        return (
                          <FieldLabel key={option.value} htmlFor={optionId}>
                            <Field orientation="horizontal">
                              <Checkbox
                                id={optionId}
                                checked={tags.includes(option.value)}
                                onCheckedChange={() => toggleMobileTag(option.value)}
                              />
                              <FieldContent>
                                <FieldTitle className="flex items-center justify-between gap-2">
                                  <span>{option.label}</span>
                                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                    {option.count}
                                  </span>
                                </FieldTitle>
                              </FieldContent>
                            </Field>
                          </FieldLabel>
                        );
                      })}
                    </div>
                  </FieldSet>
                ) : null}
              </div>
            ),
          }}
        />

        <p role="status" className={notice && !notice.error ? "text-sm" : "sr-only"}>
          {notice && !notice.error ? notice.text : ""}
        </p>
        <p role="alert" className={notice?.error ? "text-sm text-destructive" : "sr-only"}>
          {notice?.error ? notice.text : ""}
        </p>

        <BulkActionBar
          count={selected.size}
          onClear={() => {
            setSelection({ scope, ids: NO_SELECTION });
            searchRef.current?.focus();
          }}
        >
          <Button
            type="button"
            size="sm"
            ref={archiveRef}
            disabled={archiving}
            onClick={() => {
              onClearNotice?.();
              setBulkError(undefined);
              setBulkConfirm({ scope, ids: [...selected] });
            }}
          >
            Archive
          </Button>
        </BulkActionBar>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load customers</p>
          <p className="text-muted-foreground">{errorMessage}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          rowCount={rowCount}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
          sorting={sorting}
          onSortingChange={onSortingChange}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          columnPinning={columnPinning}
          onColumnPinningChange={setColumnPinning}
          selection={
            isArchivedOnlyView
              ? undefined
              : {
                  ids: selected,
                  getId: (row) => row.id,
                  getLabel: (row) => `Select ${row.name} (${row.email})`,
                  pageLabel: "Select all customers on this page",
                  canSelect: (row) => row.status !== "archived",
                  disabled: !canSelect || archiving,
                  onChange: (ids) => setSelection({ scope, ids }),
                }
          }
          manualPagination
          manualSorting
          density={density}
          isLoading={isLoading}
          isFetching={isFetching}
          onRowClick={(row) => onEditCustomer(row.id)}
          emptyState={
            <div className="sticky start-0 w-full min-w-0">
              <Empty className="w-[min(100%,100vw-2rem)] max-w-full border-0 py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon />
                  </EmptyMedia>
                  <EmptyTitle>No customers found</EmptyTitle>
                  <EmptyDescription>
                    {hasAnyFilter
                      ? "Nothing matches these filters. Clear them to see everything."
                      : "Create the first customer to populate the reference flow."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {hasAnyFilter ? (
                    <Button variant="outline" size="sm" onClick={onResetFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button size="sm" onClick={onNewCustomer}>
                      New customer
                    </Button>
                  )}
                </EmptyContent>
              </Empty>
            </div>
          }
        />
      )}

      <ConfirmationDialog
        open={bulkOpen}
        onOpenChange={(next) => {
          if (!next && !archiving) setBulkConfirm(null);
        }}
        title={confirmCount === 1 ? "Archive 1 customer?" : `Archive ${confirmCount} customers?`}
        description="Archived customers are hidden from the default list. Their records and attachments are kept, and you can restore them from the Archived filter."
        confirmLabel={confirmCount === 1 ? "Archive customer" : "Archive customers"}
        pendingLabel="Archiving…"
        pending={archiving}
        error={bulkError}
        finalFocus={() => archiveRef.current ?? searchRef.current}
        onConfirm={() => {
          if (!bulkOpen || archiving) return;
          if (bulkConfirm.ids.some((id) => !selected.has(id))) {
            setBulkError("The list changed. Cancel and select customers from the current list.");
            return;
          }
          setBulkError(undefined);
          void onArchiveCustomers(bulkConfirm.ids)
            .then(() => {
              setSelection({ scope, ids: NO_SELECTION });
              setBulkConfirm(null);
            })
            .catch((error: unknown) => {
              setBulkError(
                error instanceof Error
                  ? error.message
                  : "Could not confirm the archive. Check your connection and try again.",
              );
            });
        }}
      />

      <CustomerArchiveDialog
        open={rowArchiveId !== null}
        onOpenChange={(next) => {
          if (!next && !archiving) setRowArchiveId(null);
        }}
        pending={archiving}
        error={rowArchiveError}
        onConfirm={() => {
          if (!rowArchiveId || archiving) return;
          setRowArchiveError(undefined);
          void onArchiveCustomers([rowArchiveId])
            .then(() => setRowArchiveId(null))
            .catch((error: unknown) => {
              setRowArchiveError(
                error instanceof Error ? error.message : "Could not archive customer.",
              );
            });
        }}
      />

      <CustomerRestoreDialog
        open={rowRestoreId !== null}
        onOpenChange={(next) => {
          if (!next && !restoring) setRowRestoreId(null);
        }}
        choice={restoreChoice}
        onChoiceChange={(value) => {
          setRestoreChoice(value);
          setRowRestoreError(undefined);
        }}
        pending={restoring}
        error={rowRestoreError}
        onConfirm={() => {
          if (!rowRestoreId || !restoreChoice || restoring) return;
          setRowRestoreError(undefined);
          void onRestoreCustomer(rowRestoreId, restoreChoice)
            .then(() => setRowRestoreId(null))
            .catch((error: unknown) => {
              setRowRestoreError(
                error instanceof Error ? error.message : "Could not restore customer.",
              );
            });
        }}
      />

      {canDelete ? (
        <CustomerDeleteDialog
          open={rowDeleteId !== null}
          onOpenChange={(next) => {
            if (!next && !deleting) setRowDeleteId(null);
          }}
          pending={deleting}
          error={rowDeleteError}
          onConfirm={() => {
            if (!rowDeleteId || deleting) return;
            setRowDeleteError(undefined);
            void onDeleteCustomer(rowDeleteId)
              .then(() => setRowDeleteId(null))
              .catch((error: unknown) => {
                setRowDeleteError(
                  error instanceof Error ? error.message : "Could not delete customer.",
                );
              });
          }}
        />
      ) : null}
    </>
  );
}
