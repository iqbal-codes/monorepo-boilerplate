import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CustomerFormDrawer } from "@/components/customers/customer-form-drawer";
import { CustomerPageActions } from "@/components/customers/customer-page-actions";
import {
  CustomersTableView,
  type CustomersTableViewProps,
} from "@/components/customers/customers-table-view";
import { authClient } from "@/lib/auth-client";
import { useUiPrefs } from "@/lib/ui-prefs-store";
import { useListSearchParams } from "@/lib/use-data-table-search-params";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/customers/")({
  component: CustomersScreen,
  staticData: { pageTitle: "Customers" },
});

const SORT_KEYS = ["name", "company", "status", "balanceMinor", "createdAt"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function CustomersScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const canDelete = session?.user?.role === "admin";

  const tableDensity = useUiPrefs((state) => state.tableDensity);
  const setTableDensity = useUiPrefs((state) => state.setTableDensity);
  const defaultPageSize = useUiPrefs((state) => state.defaultPageSize);

  const list = useListSearchParams<SortKey>({
    sortKeys: SORT_KEYS,
    defaultSortKey: "createdAt",
    defaultSortDir: "desc",
    defaultPageSize,
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

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

  const handleViewCustomer = useCallback(
    (customerId: string) => {
      void navigate({ to: "/customers/$customerId", params: { customerId } });
    },
    [navigate],
  );

  const handleEditCustomer = useCallback((customerId: string) => {
    setEditingId(customerId);
    setDrawerOpen(true);
  }, []);

  const input = {
    pageIndex: list.pagination.pageIndex,
    pageSize: list.pagination.pageSize,
    search: list.search || undefined,
    status: list.status,
    statuses: list.statuses.length > 0 ? list.statuses : undefined,
    tags: list.tags.length > 0 ? list.tags : undefined,
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

  const changingResults = query.isPlaceholderData || list.searchInput !== list.search;
  const hasCurrentResults = !changingResults && query.isSuccess && pageIndex <= lastPage;

  const invalidateCustomers = useCallback(async () => {
    await queryClient.invalidateQueries(trpc.customers.pathFilter());
  }, [queryClient]);

  const archive = useMutation(
    trpc.customers.archiveMany.mutationOptions({
      onSuccess: async ({ count }) => {
        await invalidateCustomers();
        const message = count === 1 ? "1 customer archived." : `${count} customers archived.`;
        setNotice({ text: message });
        toast.success(message);
      },
      onError: async (error) => {
        if (error.data?.code === "NOT_FOUND") {
          await invalidateCustomers();
          setNotice({
            error: true,
            text: "Some selected customers no longer exist. No customers were archived. Review the refreshed list and select again.",
          });
        }
      },
    }),
  );

  const restore = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: async (updated) => {
        await invalidateCustomers();
        const message = `Customer restored as ${updated.status}.`;
        setNotice({ text: message });
        toast.success(message);
      },
    }),
  );

  const remove = useMutation(
    trpc.customers.remove.mutationOptions({
      onSuccess: async () => {
        await invalidateCustomers();
        const message = "Customer deleted.";
        setNotice({ text: message });
        toast.success(message);
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <PageHeader
        title="Customers"
        description="Server-driven table: sorting, filtering, and paging all run in the API."
        actions={
          <CustomerPageActions
            search={list.search}
            status={list.status}
            statuses={list.statuses.length > 0 ? list.statuses : undefined}
            tags={list.tags.length > 0 ? list.tags : undefined}
            sortBy={list.sortBy}
            sortDir={list.sortDir}
            onImported={handleImported}
            onNewCustomer={handleNewCustomer}
          />
        }
      />

      <CustomersTableView
        rows={rows}
        rowCount={rowCount}
        facets={query.data?.facets}
        search={list.search}
        searchInput={list.searchInput}
        onSearchInputChange={list.onSearchInputChange}
        onClearSearch={list.clearSearch}
        statuses={list.statuses}
        onStatusesChange={list.setStatuses}
        tags={list.tags}
        onTagsChange={list.setTags}
        onClearFilters={list.clearFilters}
        onResetFilters={list.reset}
        pagination={list.pagination}
        onPaginationChange={list.setPagination}
        sorting={list.sorting}
        onSortingChange={list.setSorting}
        density={tableDensity}
        onDensityChange={setTableDensity}
        isLoading={query.isPending}
        isFetching={query.isFetching && !query.isPending}
        isError={query.isError}
        errorMessage={query.error?.message}
        onRetry={() => void query.refetch()}
        hasCurrentResults={hasCurrentResults}
        canDelete={canDelete}
        notice={notice}
        onClearNotice={() => setNotice(null)}
        onNewCustomer={handleNewCustomer}
        onViewCustomer={handleViewCustomer}
        onEditCustomer={handleEditCustomer}
        onArchiveCustomers={async (ids) => {
          await archive.mutateAsync({ ids });
        }}
        archiving={archive.isPending}
        onRestoreCustomer={async (id, status) => {
          await restore.mutateAsync({ id, status });
        }}
        restoring={restore.isPending}
        onDeleteCustomer={async (id) => {
          await remove.mutateAsync({ id });
        }}
        deleting={remove.isPending}
        renderCustomerLink={renderCustomerLink}
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

const renderCustomerLink: CustomersTableViewProps["renderCustomerLink"] = ({
  customerId,
  className,
  children,
}) => (
  <Link
    to="/customers/$customerId"
    params={{ customerId }}
    onClick={(event) => event.stopPropagation()}
    className={className}
  >
    {children}
  </Link>
);
