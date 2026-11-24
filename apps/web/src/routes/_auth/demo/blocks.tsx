import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import { columnsFor, DataTable } from "@monorepo-boilerplate/ui/components/data-table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { KpiCard, KpiGrid } from "@monorepo-boilerplate/ui/components/kpi-card";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { formatDate, formatMoney, formatNumber } from "@monorepo-boilerplate/ui/lib/format";
import { createFileRoute } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_auth/demo/blocks")({
  component: BlocksDemo,
  staticData: { pageTitle: "Blocks" },
});

/**
 * DELETABLE DEMO. Exhibits DataTable modes and block states with local data.
 */
type Invoice = {
  id: string;
  number: string;
  amountMinor: number;
  issuedAt: string;
  status: "paid" | "open";
};

const INVOICES: Invoice[] = Array.from({ length: 23 }, (_, index) => ({
  id: `inv-${index + 1}`,
  number: `INV-${String(1000 + index)}`,
  amountMinor: 12_500 + index * 4_300,
  issuedAt: new Date(Date.UTC(2026, 0, 3 + index)).toISOString(),
  status: index % 3 === 0 ? "open" : "paid",
}));

const helper = columnsFor<Invoice>();
const columns = helper.columns([
  helper.accessor("number", {
    header: "Invoice",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  helper.accessor("amountMinor", {
    header: "Amount",
    cell: (info) => (
      <span className="tabular-nums">
        {formatMoney({ minor: info.getValue(), currency: "USD" })}
      </span>
    ),
  }),
  helper.accessor("issuedAt", {
    header: "Issued",
    cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <Badge variant={info.getValue() === "paid" ? "default" : "outline"}>{info.getValue()}</Badge>
    ),
  }),
]);

function BlocksDemo() {
  // Client-driven mode: the block sorts and pages this array itself.
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>([
    { id: "issuedAt", desc: true },
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Blocks"
        description="Client-driven DataTable, KPI cards, and empty/loading states. Deletable demo."
      />

      <KpiGrid>
        <KpiCard label="Rows" value={formatNumber(INVOICES.length)} hint="Local array, no fetch" />
        <KpiCard
          label="Open"
          value={formatNumber(INVOICES.filter((invoice) => invoice.status === "open").length)}
        />
        <KpiCard
          label="Outstanding"
          value={formatMoney({
            minor: INVOICES.filter((invoice) => invoice.status === "open").reduce(
              (sum, invoice) => sum + invoice.amountMinor,
              0,
            ),
            currency: "USD",
          })}
        />
        <KpiCard label="Currency" value="USD" hint="Minor units everywhere" />
      </KpiGrid>

      <Card>
        <CardHeader>
          <CardTitle>Client-driven table</CardTitle>
          <CardDescription>
            No <code>manualPagination</code>: the block sorts in memory and pages the array.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={INVOICES}
            columns={columns}
            pagination={{ pageIndex, pageSize }}
            onPaginationChange={(next) => {
              setPageIndex(next.pageIndex);
              setPageSize(next.pageSize);
            }}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Loading state</CardTitle>
            <CardDescription>Skeleton rows, same column count.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={[]}
              columns={columns}
              isLoading
              pagination={{ pageIndex: 0, pageSize: 4 }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Empty state</CardTitle>
            <CardDescription>Custom empty slot replacing the default.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={[]}
              columns={columns}
              pagination={{ pageIndex: 0, pageSize: 4 }}
              emptyState={
                <Empty className="border-0 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <InboxIcon />
                    </EmptyMedia>
                    <EmptyTitle>Nothing here yet</EmptyTitle>
                    <EmptyDescription>
                      Pass an <code>emptyState</code> to replace this slot.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skeleton primitive</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
          <Button variant="outline" size="sm" className="self-start" onClick={() => setSorting([])}>
            Clear sorting
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
