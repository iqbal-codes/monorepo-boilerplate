import { BulkActionBar } from "@monorepo-boilerplate/ui/components/bulk-action-bar";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  DataTable,
  type ColumnPinningState,
  type DataTableDensity,
  type DataTableMobileInfinite,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@monorepo-boilerplate/ui/components/data-table";
import { DataTableViewOptions } from "@monorepo-boilerplate/ui/components/data-table-view-options";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { ListToolbar } from "@monorepo-boilerplate/ui/components/list-toolbar";
import { UsersIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  CUSTOMER_VIEW_COLUMNS,
  customerListColumns,
  type CustomerColumnActions,
  type CustomerRow,
} from "@/components/customers/customer-list-columns";
import {
  useCustomerListFilters,
  type CustomerFacets,
} from "@/components/customers/customer-list-filters";
import {
  useCustomerListLifecycle,
  type CustomerLifecycleOperations,
} from "@/components/customers/customer-list-lifecycle";
import type { CustomerStatusValue } from "@/lib/use-data-table-search-params";

const DEFAULT_VISIBILITY: VisibilityState = {};
const DEFAULT_PINNING: ColumnPinningState = { start: [], end: [] };
const NO_SELECTION: ReadonlySet<string> = new Set();

export type CustomersTableViewProps = CustomerColumnActions &
  CustomerLifecycleOperations & {
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
    mobileInfinite?: DataTableMobileInfinite;
    isError: boolean;
    errorMessage?: string;
    onRetry: () => void;
    hasCurrentResults: boolean;
    canDelete: boolean;
    notice?: { text: string; error?: boolean } | null;
    onClearNotice?: () => void;
    onNewCustomer: () => void;
  };

/** Composes the Customers list presentation; URL and network state live in the route. */
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
  mobileInfinite,
  isError,
  errorMessage,
  onRetry,
  hasCurrentResults,
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
  if (selection.scope !== scope) setSelection({ scope, ids: NO_SELECTION });

  // A same-scope background refresh temporarily disables actions, while a
  // scope change or placeholder result also discards any staged confirmation.
  const current = hasCurrentResults && !isLoading && !isError;
  const busy = !current || isFetching;
  const selected = useMemo(
    () =>
      current && selection.scope === scope
        ? new Set(
            rows
              .filter((row) => row.status !== "archived" && selection.ids.has(row.id))
              .map((row) => row.id),
          )
        : NO_SELECTION,
    [current, rows, scope, selection.ids, selection.scope],
  );

  const isArchivedOnlyView = statuses.length === 1 && statuses[0] === "archived";

  const hasAnyFilter = Boolean(search) || statuses.length > 0 || tags.length > 0;
  const filterControls = useCustomerListFilters({
    facets,
    statuses,
    tags,
    onStatusesChange,
    onTagsChange,
  });
  const lifecycle = useCustomerListLifecycle({
    scope,
    current,
    busy,
    rows,
    selected,
    canDelete,
    archiveRef,
    searchRef,
    onArchiveCustomers,
    archiving,
    onRestoreCustomer,
    restoring,
    onDeleteCustomer,
    deleting,
    onBulkArchived: () =>
      setSelection((previous) =>
        previous === selection ? { scope, ids: NO_SELECTION } : previous,
      ),
  });
  const openConfirmation = lifecycle.open;
  const columns = useMemo(
    () =>
      customerListColumns({
        scope,
        disabled: busy,
        canDelete,
        onViewCustomer,
        onEditCustomer,
        renderCustomerLink,
        onLifecycle: (kind, id) => openConfirmation({ kind, id }),
      }),
    [scope, busy, canDelete, onViewCustomer, onEditCustomer, renderCustomerLink, openConfirmation],
  );

  return (
    <>
      <div className="sticky -top-3 z-20 -mx-3 flex min-w-0 flex-col gap-2 border-b border-border/60 bg-background px-3 pt-3 pb-2 sm:static sm:mx-0 sm:border-b-0 sm:bg-transparent sm:p-0">
        <ListToolbar
          search={{
            inputRef: searchRef,
            label: "Search customers",
            placeholder: "Search name, email, or company",
            value: searchInput,
            onChange: onSearchInputChange,
            onClear: onClearSearch,
          }}
          {...filterControls}
          sortSheet={{
            options: CUSTOMER_VIEW_COLUMNS.map((col) => ({ id: col.id, label: col.label })),
            value: sorting[0] ?? { id: "createdAt", desc: true },
            defaultValue: { id: "createdAt", desc: true },
            onChange: (next) => onSortingChange([next]),
            title: "Sort customers",
            description: "Choose a field and sort direction.",
          }}
          hasActiveFilters={hasAnyFilter || Boolean(searchInput)}
          onClearFilters={onClearFilters}
          resultLabel={rowCount === 1 ? "1 customer" : `${rowCount} customers`}
          isFetching={isFetching}
          actions={
            <DataTableViewOptions
              className="hidden sm:inline-flex"
              columns={CUSTOMER_VIEW_COLUMNS}
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
            disabled={archiving || busy}
            onClick={() => {
              onClearNotice?.();
              lifecycle.open({ kind: "bulkArchive", ids: [...selected] });
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
                  disabled: busy || archiving,
                  onChange: (ids) => setSelection({ scope, ids }),
                }
          }
          manualPagination
          manualSorting
          density={density}
          isLoading={isLoading}
          isFetching={isFetching}
          mobileInfinite={mobileInfinite}
          hideMobileSort
          disableRows={!current}
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

      {lifecycle.dialog}
    </>
  );
}
