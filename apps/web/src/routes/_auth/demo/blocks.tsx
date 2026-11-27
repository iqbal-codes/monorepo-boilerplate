import { Badge } from "@monorepo-boilerplate/ui/components/badge";
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
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@monorepo-boilerplate/ui/lib/format";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  CircleDollarSignIcon,
  ClockIcon,
  FileTextIcon,
  InboxIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

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

const INVOICE_SPARKLINE = INVOICES.slice(-8).map((invoice) => invoice.amountMinor);

function BlocksDemo() {
  // Client-driven mode: the block sorts and pages this array itself.
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<Array<{ id: string; desc: boolean }>>([
    { id: "issuedAt", desc: true },
  ]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("all");
  const [kpiVariant, setKpiVariant] = useState<"cards" | "strip">("cards");

  const openInvoices = useMemo(() => INVOICES.filter((invoice) => invoice.status === "open"), []);
  const paidInvoices = useMemo(() => INVOICES.filter((invoice) => invoice.status === "paid"), []);
  const openMinor = useMemo(
    () => openInvoices.reduce((sum, invoice) => sum + invoice.amountMinor, 0),
    [openInvoices],
  );
  const paidMinor = useMemo(
    () => paidInvoices.reduce((sum, invoice) => sum + invoice.amountMinor, 0),
    [paidInvoices],
  );
  const filteredInvoices = useMemo(() => {
    if (statusFilter === "open") return openInvoices;
    if (statusFilter === "paid") return paidInvoices;
    return INVOICES;
  }, [openInvoices, paidInvoices, statusFilter]);

  function toggleStatusFilter(next: "open" | "paid") {
    setStatusFilter((current) => (current === next ? "all" : next));
    setPageIndex(0);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Blocks"
        description="Client-driven DataTable, KPI cards, and empty/loading states. Deletable demo."
        actions={
          <div
            className="inline-flex border border-border bg-card p-0.5"
            role="group"
            aria-label="KPI layout"
          >
            <Button
              type="button"
              size="xs"
              variant={kpiVariant === "cards" ? "secondary" : "ghost"}
              aria-pressed={kpiVariant === "cards"}
              onClick={() => setKpiVariant("cards")}
            >
              Cards
            </Button>
            <Button
              type="button"
              size="xs"
              variant={kpiVariant === "strip" ? "secondary" : "ghost"}
              aria-pressed={kpiVariant === "strip"}
              onClick={() => setKpiVariant("strip")}
            >
              Strip
            </Button>
          </div>
        }
      />

      <KpiGrid variant={kpiVariant}>
        <KpiCard
          label="Invoices"
          icon={<FileTextIcon />}
          value={formatNumber(INVOICES.length)}
          sparkline={INVOICE_SPARKLINE}
          hint={statusFilter === "all" ? "Showing all rows" : "Click to clear filter"}
          active={statusFilter === "all"}
          onClick={() => {
            setStatusFilter("all");
            setPageIndex(0);
          }}
        />
        <KpiCard
          label="Open"
          icon={<ClockIcon />}
          tone="warning"
          value={formatNumber(openInvoices.length)}
          progress={{
            value: openInvoices.length,
            max: INVOICES.length,
            label: "Open invoice share",
          }}
          hint={`${formatPercent(openInvoices.length / INVOICES.length)} of invoices`}
          active={statusFilter === "open"}
          onClick={() => toggleStatusFilter("open")}
        />
        <KpiCard
          label="Outstanding"
          icon={<CircleDollarSignIcon />}
          tone="warning"
          value={formatMoney({ minor: openMinor, currency: "USD" })}
          trend={{ value: -0.08, label: "vs prior cycle" }}
          hint={`Across ${formatNumber(openInvoices.length)} open`}
          active={statusFilter === "open"}
          onClick={() => toggleStatusFilter("open")}
        />
        <KpiCard
          label="Collected"
          icon={<CheckCircle2Icon />}
          tone="success"
          value={formatMoney({ minor: paidMinor, currency: "USD" })}
          progress={{
            value: paidInvoices.length,
            max: INVOICES.length,
            label: "Paid invoice share",
          }}
          hint={`${formatNumber(paidInvoices.length)} paid (${formatPercent(paidInvoices.length / INVOICES.length)})`}
          active={statusFilter === "paid"}
          onClick={() => toggleStatusFilter("paid")}
        />
      </KpiGrid>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Client-driven table</CardTitle>
            <CardDescription>
              No <code>manualPagination</code>: the block sorts in memory and pages the array.
            </CardDescription>
          </div>
          {statusFilter !== "all" ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                setStatusFilter("all");
                setPageIndex(0);
              }}
            >
              Filter: {statusFilter} · Clear
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredInvoices}
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
