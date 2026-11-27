import { BulkActionBar } from "@monorepo-boilerplate/ui/components/bulk-action-bar";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import { columnsFor, DataTable } from "@monorepo-boilerplate/ui/components/data-table";
import {
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  Empty,
  EmptyContent,
} from "@monorepo-boilerplate/ui/components/empty";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { ListToolbar } from "@monorepo-boilerplate/ui/components/list-toolbar";
import { RadioGroup, RadioGroupItem } from "@monorepo-boilerplate/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { formatDate, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CustomerFormDrawer } from "@/components/customers/customer-form-drawer";
import { CustomerPageActions } from "@/components/customers/customer-page-actions";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { useUiPrefs } from "@/lib/ui-prefs-store";
import { useListSearchParams, type CustomerStatusFilter } from "@/lib/use-data-table-search-params";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/customers/")({
  component: CustomersScreen,
  staticData: { pageTitle: "Customers" },
});

const STATUS_LABELS: Record<CustomerStatusFilter, string> = {
  all: "All Status",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

const STATUS_FILTER_ITEMS: ReadonlyArray<{
  value: Exclude<CustomerStatusFilter, "all">;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const SORT_KEYS = ["name", "company", "status", "balanceMinor", "createdAt"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const helper = columnsFor<CustomerRow>();

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: "active" | "inactive" | "archived";
  balanceMinor: number;
  currency: string;
  createdAt: Date | string;
};

const columns = helper.columns([
  helper.accessor("name", {
    header: "Customer",
    cell: (info) => {
      const row = info.row.original;
      return (
        <div className="flex flex-col">
          <Link
            to="/customers/$customerId"
            params={{ customerId: row.id }}
            onClick={(event) => event.stopPropagation()}
            className="w-fit font-medium hover:underline"
          >
            {row.name}
          </Link>
          <span className="text-xs text-muted-foreground">{row.email}</span>
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
      return (
        <Badge
          variant={
            status === "active" ? "default" : status === "inactive" ? "secondary" : "outline"
          }
        >
          {status}
        </Badge>
      );
    },
  }),
  helper.accessor("balanceMinor", {
    header: "Balance",
    cell: (info) => (
      <span className={info.getValue() < 0 ? "tabular-nums text-destructive" : "tabular-nums"}>
        {formatMoney({ minor: info.getValue(), currency: info.row.original.currency })}
      </span>
    ),
  }),
  helper.accessor("createdAt", {
    header: "Created",
    cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
  }),
]);

const NO_SELECTION: ReadonlySet<string> = new Set();

function CustomersScreen() {
  const tableDensity = useUiPrefs((state) => state.tableDensity);
  const defaultPageSize = useUiPrefs((state) => state.defaultPageSize);
  const list = useListSearchParams<SortKey>({
    sortKeys: SORT_KEYS,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    defaultPageSize,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const archiveRef = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [dialogError, setDialogError] = useState<string>();

  const handleImported = useCallback(
    (created: number) => {
      setNotice({
        text: created === 1 ? "1 customer imported." : `${created} customers imported.`,
      });
      void queryClient.invalidateQueries(trpc.customers.pathFilter());
    },
    [queryClient],
  );

  const handleNewCustomer = useCallback(() => {
    setEditingId(null);
    setDrawerOpen(true);
  }, []);

  const input = {
    pageIndex: list.pagination.pageIndex,
    pageSize: list.pagination.pageSize,
    search: list.search || undefined,
    status: list.status,
    sortBy: list.sortBy,
    sortDir: list.sortDir,
  };

  const query = useQuery({
    ...trpc.customers.list.queryOptions(input),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.rows ?? [];
  const rowCount = query.data?.rowCount ?? 0;
  const pageIndex = list.pagination.pageIndex;
  const pageSize = list.pagination.pageSize;
  const lastPage = Math.max(0, Math.ceil(rowCount / pageSize) - 1);
  const { setPagination } = list;
  useEffect(() => {
    if (query.isSuccess && !query.isPlaceholderData && pageIndex > lastPage) {
      setPagination({ pageIndex: lastPage, pageSize });
    }
  }, [query.isSuccess, query.isPlaceholderData, pageIndex, lastPage, pageSize, setPagination]);

  const scope = JSON.stringify([input, list.searchInput]);
  const [selection, setSelection] = useState({ scope, ids: NO_SELECTION });
  const [confirmation, setConfirmation] = useState<{ scope: string; ids: string[] } | null>(null);
  if (selection.scope !== scope) setSelection({ scope, ids: NO_SELECTION });
  if (confirmation && confirmation.scope !== scope) setConfirmation(null);
  const changingResults = query.isPlaceholderData || list.searchInput !== list.search;
  const canSelect = !changingResults && query.isSuccess && pageIndex <= lastPage;
  const selected =
    canSelect && selection.scope === scope
      ? new Set(
          rows
            .filter((row) => row.status !== "archived" && selection.ids.has(row.id))
            .map((row) => row.id),
        )
      : NO_SELECTION;
  const open = confirmation !== null && confirmation.scope === scope;

  const archive = useMutation(
    trpc.customers.archiveMany.mutationOptions({
      onSuccess: async ({ count }) => {
        setSelection((previous) => ({ ...previous, ids: NO_SELECTION }));
        await queryClient.invalidateQueries(trpc.customers.pathFilter());
        setConfirmation(null);
        setNotice({ text: count === 1 ? "1 customer archived." : `${count} customers archived.` });
      },
      onError: async (error) => {
        if (error.data?.code === "NOT_FOUND") {
          setSelection((previous) => ({ ...previous, ids: NO_SELECTION }));
          await queryClient.invalidateQueries(trpc.customers.pathFilter());
          setConfirmation(null);
          setNotice({
            error: true,
            text: "Some selected customers no longer exist. No customers were archived. Review the refreshed list and select again.",
          });
        } else {
          setDialogError(
            "Could not confirm the archive. Check your connection and try again, or cancel and refresh the list.",
          );
        }
      },
    }),
  );

  function clearSelection() {
    setSelection({ scope, ids: NO_SELECTION });
  }

  const confirmCount = confirmation?.ids.length ?? 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <PageHeader
        title="Customers"
        description="Server-driven table: sorting, filtering, and paging all run in the API."
        actions={
          <CustomerPageActions
            search={list.search}
            status={list.status}
            sortBy={list.sortBy}
            sortDir={list.sortDir}
            onImported={handleImported}
            onNewCustomer={handleNewCustomer}
          />
        }
      />

      <div className="flex min-w-0 flex-col gap-2">
        <ListToolbar
          search={{
            inputRef: searchRef,
            label: "Search customers",
            placeholder: "Search name, email, or company",
            value: list.searchInput,
            onChange: list.onSearchInputChange,
          }}
          isFetching={query.isFetching}
          hasActiveFilters={Boolean(list.searchInput) || list.status !== "all"}
          onClearFilters={list.clearFilters}
          filters={
            <Select
              items={STATUS_FILTER_ITEMS}
              value={list.status === "all" ? null : list.status}
              onValueChange={(value) => {
                list.setStatus((value ?? "all") as CustomerStatusFilter);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-40 border border-input px-3"
                aria-label="Filter by status"
                showClear={list.status !== "all"}
                onClear={() => list.setStatus("all")}
                clearLabel="Clear status filter"
              >
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STATUS_FILTER_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
          filterSheet={{
            activeCount: list.status === "all" ? 0 : 1,
            title: "Filter customers",
            description: "Choose which customer records to show.",
            onReset: () => list.setStatus("all"),
            resetDisabled: list.status === "all",
            content: (
              <FieldSet>
                <FieldLegend variant="label">Status</FieldLegend>
                <RadioGroup
                  value={list.status}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      list.setStatus(value as CustomerStatusFilter);
                    }
                  }}
                  className="grid gap-2"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => {
                    const optionId = `customer-status-filter-${value}`;
                    return (
                      <FieldLabel key={value} htmlFor={optionId}>
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>{label}</FieldTitle>
                          </FieldContent>
                          <RadioGroupItem id={optionId} value={value} />
                        </Field>
                      </FieldLabel>
                    );
                  })}
                </RadioGroup>
              </FieldSet>
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
            clearSelection();
            searchRef.current?.focus();
          }}
        >
          <Button
            type="button"
            size="sm"
            ref={archiveRef}
            disabled={archive.isPending}
            onClick={() => {
              setNotice(null);
              setDialogError(undefined);
              setConfirmation({ scope, ids: [...selected] });
            }}
          >
            Archive
          </Button>
        </BulkActionBar>
      </div>

      {query.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load customers</p>
          <p className="text-muted-foreground">{query.error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          rowCount={query.data?.rowCount ?? 0}
          pagination={list.pagination}
          onPaginationChange={list.setPagination}
          sorting={list.sorting}
          onSortingChange={list.setSorting}
          selection={
            list.status === "archived"
              ? undefined
              : {
                  ids: selected,
                  getId: (row) => row.id,
                  getLabel: (row) => `Select ${row.name} (${row.email})`,
                  pageLabel: "Select all customers on this page",
                  canSelect: (row) => row.status !== "archived",
                  disabled: !canSelect || archive.isPending,
                  onChange: (ids) => setSelection({ scope, ids }),
                }
          }
          manualPagination
          manualSorting
          density={tableDensity}
          isLoading={query.isPending || query.isPlaceholderData}
          onRowClick={(row) => {
            setEditingId(row.id);
            setDrawerOpen(true);
          }}
          emptyState={
            // `DataTable` renders this inside its non-scrolling table box, so the
            // table's min-content width would push the copy out of view on narrow
            // screens. The sticky wrapper pins it to the visible leading edge and
            // the viewport-bound inner width stops the oversized cell from
            // stretching it, without widening the page.
            <div className="sticky start-0 w-full min-w-0">
              <Empty className="w-[min(100%,100vw-2rem)] max-w-full border-0 py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon />
                  </EmptyMedia>
                  <EmptyTitle>No customers found</EmptyTitle>
                  <EmptyDescription>
                    {list.search || list.status !== "all"
                      ? "Nothing matches these filters. Clear them to see everything."
                      : "Create the first customer to populate the reference flow."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {list.search || list.status !== "all" ? (
                    <Button variant="outline" size="sm" onClick={list.reset}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingId(null);
                        setDrawerOpen(true);
                      }}
                    >
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
        open={open}
        onOpenChange={(next) => {
          if (!next) setConfirmation(null);
        }}
        title={confirmCount === 1 ? "Archive 1 customer?" : `Archive ${confirmCount} customers?`}
        description="Archived customers are hidden from the default list. Their records and attachments are kept, and you can restore them from the Archived filter."
        confirmLabel={confirmCount === 1 ? "Archive customer" : "Archive customers"}
        pendingLabel="Archiving…"
        pending={archive.isPending}
        error={dialogError}
        finalFocus={() => archiveRef.current ?? searchRef.current}
        onConfirm={() => {
          if (!open || archive.isPending) return;
          if (confirmation.ids.some((id) => !selected.has(id))) {
            setDialogError("The list changed. Cancel and select customers from the current list.");
            return;
          }
          setDialogError(undefined);
          archive.mutate({ ids: confirmation.ids });
        }}
      />

      <CustomerFormDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setEditingId(null);
        }}
        customerId={editingId}
      />
    </div>
  );
}
