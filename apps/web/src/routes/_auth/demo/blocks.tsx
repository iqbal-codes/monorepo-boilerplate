import {
  ActivityTimeline,
  ActivityTimelineComposer,
  type ActivityTimelineItem,
} from "@monorepo-boilerplate/ui/components/activity-timeline";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";
import {
  columnsFor,
  DataTable,
  type ExpandedState,
  type SortingState,
} from "@monorepo-boilerplate/ui/components/data-table";
import { DescriptionList } from "@monorepo-boilerplate/ui/components/description-list";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { KpiCard, KpiGrid } from "@monorepo-boilerplate/ui/components/kpi-card";
import {
  NotificationCenter,
  type NotificationItem,
} from "@monorepo-boilerplate/ui/components/notification-center";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import {
  SavedViewBar,
  type SavedViewItem,
} from "@monorepo-boilerplate/ui/components/saved-view-bar";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { SplitView } from "@monorepo-boilerplate/ui/components/split-view";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import {
  StatusScreen,
  type StatusScreenStatus,
} from "@monorepo-boilerplate/ui/components/status-screen";
import { VirtualList } from "@monorepo-boilerplate/ui/components/virtual-list";
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
  EyeIcon,
  FileTextIcon,
  InboxIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_auth/demo/blocks")({
  component: BlocksDemo,
  staticData: { pageTitle: "Blocks" },
});

/**
 * DELETABLE DEMO. Exhibits Phase 1 & Phase 2 DataTable, inspection, virtualized,
 * and saved-view blocks with local in-memory fixtures.
 */
type InvoiceStatus = "paid" | "open";

type InvoiceLineItem = {
  id: string;
  description: string;
  qty: number;
  amountMinor: number;
};

type Invoice = {
  id: string;
  number: string;
  customer: string;
  reference: string;
  amountMinor: number;
  issuedAt: string;
  status: InvoiceStatus;
  lineItems: readonly InvoiceLineItem[];
};

type SavedViewPreset = SavedViewItem & {
  statusFilter: "all" | InvoiceStatus;
  minAmountMinor: number;
  sorting: SortingState;
};

type LedgerRow = {
  id: string;
  entryCode: string;
  account: string;
  amountMinor: number;
  status: "settled" | "pending" | "flagged";
};

const INVOICES: Invoice[] = Array.from({ length: 23 }, (_, index) => {
  const baseMinor = 12_500 + index * 4_300;
  return {
    id: `inv-${index + 1}`,
    number: `INV-${String(1000 + index)}`,
    customer: ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson"][index % 4]!,
    reference: index % 4 === 0 ? "" : `PO-2026-${String(410 + index)}`,
    amountMinor: baseMinor,
    issuedAt: new Date(Date.UTC(2026, 0, 3 + index)).toISOString(),
    status: index % 3 === 0 ? "open" : "paid",
    lineItems: [
      {
        id: `li-${index}-1`,
        description: "Workspace platform license",
        qty: 1,
        amountMinor: Math.round(baseMinor * 0.7),
      },
      {
        id: `li-${index}-2`,
        description: "Priority audit retention",
        qty: 1,
        amountMinor: baseMinor - Math.round(baseMinor * 0.7),
      },
    ],
  };
});

const INITIAL_SAVED_VIEWS: SavedViewPreset[] = [
  {
    id: "all",
    name: "All invoices",
    statusFilter: "all",
    minAmountMinor: 0,
    sorting: [{ id: "number", desc: true }],
    isDefault: true,
    canRename: false,
    canDelete: false,
  },
  {
    id: "open",
    name: "Open balance",
    statusFilter: "open",
    minAmountMinor: 0,
    sorting: [{ id: "amountMinor", desc: true }],
  },
  {
    id: "high-value",
    name: "High value ($500+)",
    statusFilter: "all",
    minAmountMinor: 50_000,
    sorting: [{ id: "amountMinor", desc: true }],
  },
];

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "INV-1021 payment settled",
    description: "ACH transfer cleared for $102.80.",
    timestamp: "4m ago",
    read: false,
    category: "Billing",
  },
  {
    id: "notif-2",
    title: "Saved view updated",
    description: "High value ($500+) threshold adjusted.",
    timestamp: "1h ago",
    read: false,
    category: "Workspace",
  },
  {
    id: "notif-3",
    title: "Weekly export completed",
    description: "23 invoice records archived cleanly.",
    timestamp: "Yesterday",
    read: true,
    category: "Exports",
  },
];

const INITIAL_TIMELINE: ActivityTimelineItem[] = [
  {
    id: "evt-1",
    type: "status",
    title: "Invoice issued to billing contact",
    actor: { name: "Ada Lovelace", initials: "AL" },
    timestamp: new Date(Date.UTC(2026, 10, 27, 14, 20)),
    metadata: { channel: "email", template: "invoice-v2" },
  },
  {
    id: "evt-2",
    type: "note",
    title: "Verified PO metadata",
    description: "Confirmed net-30 terms with finance operations.",
    actor: { name: "Grace Hopper", initials: "GH" },
    timestamp: new Date(Date.UTC(2026, 10, 28, 9, 15)),
  },
];

const LEDGER_10K: LedgerRow[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: `led-${index + 1}`,
  entryCode: `LED-${String(index + 1).padStart(5, "0")}`,
  account: ["Operating Reserve", "Enterprise AR", "Clearing Pool", "Escrow Vault"][index % 4]!,
  amountMinor: 2_500 + ((index * 137) % 95_000),
  status: index % 17 === 0 ? "flagged" : index % 5 === 0 ? "pending" : "settled",
}));

const ledgerHelper = columnsFor<LedgerRow>();
const ledgerColumns = ledgerHelper.columns([
  ledgerHelper.accessor("entryCode", {
    header: "Entry",
    cell: (info) => <span className="font-mono text-xs font-medium">{info.getValue()}</span>,
  }),
  ledgerHelper.accessor("account", {
    header: "Account",
  }),
  ledgerHelper.accessor("amountMinor", {
    header: "Amount",
    cell: (info) => (
      <span className="tabular-nums">
        {formatMoney({ minor: info.getValue(), currency: "USD" })}
      </span>
    ),
  }),
  ledgerHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const value = info.getValue();
      const tone = value === "settled" ? "success" : value === "flagged" ? "danger" : "warning";
      return (
        <StatusBadge tone={tone} dot>
          {value}
        </StatusBadge>
      );
    },
  }),
]);

const INVOICE_SPARKLINE = INVOICES.slice(-8).map((invoice) => invoice.amountMinor);

const staticHelper = columnsFor<Invoice>();
const staticPreviewColumns = staticHelper.columns([
  staticHelper.accessor("number", { header: "Invoice" }),
  staticHelper.accessor("amountMinor", {
    header: "Amount",
    cell: (info) => formatMoney({ minor: info.getValue(), currency: "USD" }),
  }),
  staticHelper.accessor("status", { header: "Status" }),
]);

function sameSorting(a: SortingState, b: SortingState): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => item.id === b[index]?.id && item.desc === b[index]?.desc)
  );
}

function BlocksDemo() {
  const [kpiVariant, setKpiVariant] = useState<"cards" | "strip">("cards");
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // SavedViewBar + DataTable + SplitView interactive state
  const [savedViews, setSavedViews] = useState<SavedViewPreset[]>(INITIAL_SAVED_VIEWS);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [minAmountMinor, setMinAmountMinor] = useState<number>(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sorting, setSorting] = useState<SortingState>([{ id: "number", desc: true }]);
  const [expanded, setExpanded] = useState<ExpandedState>({ "inv-1": true });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [timelineByInvoice, setTimelineByInvoice] = useState<
    Record<string, ActivityTimelineItem[]>
  >({
    "inv-1": INITIAL_TIMELINE,
  });

  // VirtualList & StatusScreen preview state
  const [activeStreamIndex, setActiveStreamIndex] = useState<number>(0);
  const [statusPreview, setStatusPreview] = useState<StatusScreenStatus>("404");

  const activeView = useMemo(
    () => savedViews.find((view) => view.id === activeViewId) ?? savedViews[0]!,
    [activeViewId, savedViews],
  );

  const isViewDirty = useMemo(
    () =>
      statusFilter !== activeView.statusFilter ||
      minAmountMinor !== activeView.minAmountMinor ||
      !sameSorting(sorting, activeView.sorting),
    [activeView, minAmountMinor, sorting, statusFilter],
  );

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

  const filteredInvoices = useMemo(
    () =>
      INVOICES.filter((invoice) => {
        if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
        if (invoice.amountMinor < minAmountMinor) return false;
        return true;
      }),
    [minAmountMinor, statusFilter],
  );

  const viewItemsWithCounts = useMemo<SavedViewItem[]>(
    () =>
      savedViews.map((view) => ({
        ...view,
        count: INVOICES.filter(
          (inv) =>
            (view.statusFilter === "all" || inv.status === view.statusFilter) &&
            inv.amountMinor >= view.minAmountMinor,
        ).length,
      })),
    [savedViews],
  );

  const selectedInvoice = useMemo(
    () => INVOICES.find((inv) => inv.id === selectedInvoiceId) ?? null,
    [selectedInvoiceId],
  );

  const invoiceColumns = useMemo(() => {
    const helper = columnsFor<Invoice>();
    return helper.columns([
      helper.accessor("number", {
        header: "Invoice",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      helper.accessor("customer", {
        header: "Customer",
      }),
      helper.accessor("amountMinor", {
        header: "Amount",
        cell: (info) => (
          <span className="tabular-nums">
            {formatMoney({ minor: info.getValue(), currency: "USD" })}
          </span>
        ),
      }),
      helper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <StatusBadge tone={info.getValue() === "paid" ? "success" : "warning"} dot>
            {info.getValue()}
          </StatusBadge>
        ),
      }),
      helper.display({
        id: "actions",
        header: "Inspect",
        cell: (info) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Inspect ${info.row.original.number}`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedInvoiceId(info.row.original.id);
            }}
          >
            <EyeIcon aria-hidden="true" />
          </Button>
        ),
      }),
    ]);
  }, []);

  function applySavedView(view: SavedViewPreset) {
    setActiveViewId(view.id);
    setStatusFilter(view.statusFilter);
    setMinAmountMinor(view.minAmountMinor);
    setSorting(view.sorting);
    setPageIndex(0);
  }

  function toggleStatusFilter(next: InvoiceStatus) {
    setStatusFilter((current) => (current === next ? "all" : next));
    setPageIndex(0);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Blocks"
        description="Controlled DataTable, SavedViewBar, SplitView/DetailSheet, VirtualList, and Phase 1 inspection blocks. Deletable demo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <NotificationCenter
              items={notifications}
              onMarkRead={(id) =>
                setNotifications((prev) =>
                  prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
                )
              }
              onMarkAllRead={() =>
                setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
              }
            />
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
            setMinAmountMinor(0);
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
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>SavedViewBar, Expandable Rows &amp; SplitView / DetailSheet</CardTitle>
              <CardDescription>
                Change filters or sorting to trigger the unsaved-changes dot, expand any row for
                inline sub-rows, or click a row to inspect in a resizable side pane (
                <code>md+</code>) or slide-over <code>DetailSheet</code> (<code>&lt;md</code>).
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {statusFilter !== "all" || minAmountMinor > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setStatusFilter("all");
                    setMinAmountMinor(0);
                    setPageIndex(0);
                  }}
                >
                  Reset filters
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setSelectedInvoiceId(INVOICES[0]!.id)}
              >
                <PanelRightOpenIcon data-icon="inline-start" aria-hidden="true" />
                Inspect {INVOICES[0]!.number}
              </Button>
            </div>
          </div>

          <SavedViewBar
            views={viewItemsWithCounts}
            activeViewId={activeViewId}
            isDirty={isViewDirty}
            onSelectView={(viewId) => {
              const found = savedViews.find((view) => view.id === viewId);
              if (found) applySavedView(found);
            }}
            onSaveChanges={(viewId) => {
              setSavedViews((prev) =>
                prev.map((view) =>
                  view.id === viewId ? { ...view, statusFilter, minAmountMinor, sorting } : view,
                ),
              );
              toast.success("Saved view updated");
            }}
            onDiscardChanges={() => applySavedView(activeView)}
            onCreateView={(name) => {
              const id = `view-${Date.now()}`;
              const next: SavedViewPreset = {
                id,
                name,
                statusFilter,
                minAmountMinor,
                sorting,
              };
              setSavedViews((prev) => [...prev, next]);
              setActiveViewId(id);
              toast.success(`Created view "${name}"`);
            }}
            onRenameView={(viewId, nextName) => {
              setSavedViews((prev) =>
                prev.map((view) => (view.id === viewId ? { ...view, name: nextName } : view)),
              );
            }}
            onDeleteView={(viewId) => {
              setSavedViews((prev) => prev.filter((view) => view.id !== viewId));
              if (activeViewId === viewId) {
                applySavedView(INITIAL_SAVED_VIEWS[0]!);
              }
            }}
          />
        </CardHeader>
        <CardContent>
          <SplitView
            ariaLabel="Invoices workspace"
            masterDefaultSize="65%"
            masterMinSize="45%"
            detailDefaultSize="35%"
            detailMinSize="28%"
            detailOpen={Boolean(selectedInvoice)}
            onDetailOpenChange={(open) => {
              if (!open) setSelectedInvoiceId(null);
            }}
            detailTitle={selectedInvoice ? selectedInvoice.number : "Invoice inspector"}
            detailDescription={selectedInvoice ? selectedInvoice.customer : undefined}
            emptyDetail={
              <Empty className="border-0 py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PanelRightOpenIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Select an invoice</EmptyTitle>
                  <EmptyDescription>
                    Click any row or its inspect action to preview <code>DescriptionList</code> and{" "}
                    <code>ActivityTimeline</code>.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedInvoiceId(INVOICES[0]!.id)}
                  >
                    Inspect {INVOICES[0]!.number}
                  </Button>
                </EmptyContent>
              </Empty>
            }
            master={
              <DataTable
                data={filteredInvoices}
                columns={invoiceColumns}
                getRowId={(row) => row.id}
                regionLabel="Invoices table"
                pagination={{ pageIndex, pageSize }}
                pageSizeOptions={[5, 10, 20]}
                onPaginationChange={(next) => {
                  setPageIndex(next.pageIndex);
                  setPageSize(next.pageSize);
                }}
                sorting={sorting}
                onSortingChange={setSorting}
                expanded={expanded}
                onExpandedChange={setExpanded}
                onRowClick={(row) => setSelectedInvoiceId(row.id)}
                getExpandLabel={(row, isExpanded) =>
                  `${isExpanded ? "Collapse" : "Expand"} ${row.number}`
                }
                renderSubRow={(row) => (
                  <div className="flex flex-col gap-3">
                    <DescriptionList
                      columns={2}
                      items={[
                        { label: "Customer", value: row.customer },
                        {
                          label: "PO Reference",
                          value: row.reference,
                          copyValue: row.reference || undefined,
                        },
                        { label: "Issued", value: formatDate(row.issuedAt) },
                        {
                          label: "Line items",
                          value: `${row.lineItems.length} items`,
                          numeric: true,
                        },
                      ]}
                    />
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {row.lineItems.map((item) => (
                        <span key={item.id} className="border border-border bg-card px-2 py-1">
                          {item.description} ·{" "}
                          <span className="font-medium text-foreground tabular-nums">
                            {formatMoney({ minor: item.amountMinor, currency: "USD" })}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              />
            }
            detail={
              selectedInvoice ? (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      tone={selectedInvoice.status === "paid" ? "success" : "warning"}
                      dot
                    >
                      {selectedInvoice.status}
                    </StatusBadge>
                    <CopyButton
                      value={selectedInvoice.number}
                      label="Copy invoice ID"
                      copiedLabel="Copied invoice ID"
                      variant="outline"
                    >
                      Copy ID
                    </CopyButton>
                  </div>

                  <DescriptionList
                    columns={2}
                    items={[
                      {
                        label: "Invoice",
                        value: selectedInvoice.number,
                        copyValue: selectedInvoice.number,
                        numeric: true,
                      },
                      {
                        label: "Amount",
                        value: formatMoney({
                          minor: selectedInvoice.amountMinor,
                          currency: "USD",
                        }),
                        numeric: true,
                      },
                      { label: "Customer", value: selectedInvoice.customer },
                      { label: "PO Reference", value: selectedInvoice.reference },
                    ]}
                  />

                  <ActivityTimeline
                    items={timelineByInvoice[selectedInvoice.id] ?? INITIAL_TIMELINE}
                    composer={
                      <ActivityTimelineComposer
                        onSubmit={(body) => {
                          const entry: ActivityTimelineItem = {
                            id: `note-${Date.now()}`,
                            type: "note",
                            title: "Added note",
                            description: body,
                            actor: { name: "Demo Operator", initials: "DO" },
                            timestamp: new Date(),
                          };
                          setTimelineByInvoice((prev) => ({
                            ...prev,
                            [selectedInvoice.id]: [
                              ...(prev[selectedInvoice.id] ?? INITIAL_TIMELINE),
                              entry,
                            ],
                          }));
                        }}
                      />
                    }
                  />
                </div>
              ) : null
            }
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Virtualized DataTable (10,000 rows)</CardTitle>
            <CardDescription>
              Opt-in <code>@tanstack/react-virtual</code> row windowing with sticky header.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={LEDGER_10K}
              columns={ledgerColumns}
              getRowId={(row) => row.id}
              density="compact"
              regionLabel="Virtualized ledger table"
              virtualized={{ estimateRowHeight: 36, height: 320, overscan: 6 }}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Subpath-Isolated VirtualList (10,000 items)</CardTitle>
              <CardDescription>
                Imported from <code>@monorepo-boilerplate/ui/components/virtual-list</code> with
                keyboard navigation.
              </CardDescription>
            </div>
            <Badge variant="outline" className="tabular-nums">
              Active #{activeStreamIndex + 1}
            </Badge>
          </CardHeader>
          <CardContent>
            <VirtualList
              items={LEDGER_10K}
              estimateSize={52}
              height={320}
              overscan={6}
              ariaLabel="10,000-row virtual ledger stream"
              getItemKey={(item) => item.id}
              activeIndex={activeStreamIndex}
              onActiveIndexChange={setActiveStreamIndex}
              onItemActivate={(item) =>
                toast.info(`${item.entryCode} · ${item.account}`, {
                  description: formatMoney({ minor: item.amountMinor, currency: "USD" }),
                })
              }
              renderItem={({ item }) => (
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.entryCode}
                    </span>
                    <span className="truncate font-medium">{item.account}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      tone={
                        item.status === "settled"
                          ? "success"
                          : item.status === "flagged"
                            ? "danger"
                            : "warning"
                      }
                      dot
                    >
                      {item.status}
                    </StatusBadge>
                    <span className="text-xs tabular-nums">
                      {formatMoney({ minor: item.amountMinor, currency: "USD" })}
                    </span>
                  </div>
                </div>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>StatusBadge, CopyButton &amp; DescriptionList</CardTitle>
            <CardDescription>
              Semantic OKLCH status pills, clipboard copy feedback, and structured metadata grid.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="neutral" dot>
                Neutral
              </StatusBadge>
              <StatusBadge tone="info" dot>
                Info
              </StatusBadge>
              <StatusBadge tone="success" dot>
                Success
              </StatusBadge>
              <StatusBadge tone="warning" dot>
                Warning
              </StatusBadge>
              <StatusBadge tone="danger" dot>
                Danger
              </StatusBadge>
              <CopyButton value="cus_01JDEMO9X2" label="Copy customer token" variant="outline">
                cus_01JDEMO9X2
              </CopyButton>
            </div>

            <DescriptionList
              columns={2}
              items={[
                { label: "Organization", value: "Analytical Engines Ltd." },
                { label: "Environment ID", value: "env_prod_04", copyValue: "env_prod_04" },
                {
                  label: "Monthly volume",
                  value: formatMoney({ minor: 482_500, currency: "USD" }),
                  numeric: true,
                },
                { label: "Optional external ref", value: "" },
              ]}
            />

            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                ActivityTimeline
              </p>
              <ActivityTimeline items={INITIAL_TIMELINE} />
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>StatusScreen Previews</CardTitle>
              <CardDescription>
                Controlled 403 / 404 / 500 error views with recovery actions and collapsible
                technical details.
              </CardDescription>
            </div>
            <div
              className="inline-flex border border-border bg-card p-0.5"
              role="group"
              aria-label="Status screen code"
            >
              {(["403", "404", "500"] as const).map((code) => (
                <Button
                  key={code}
                  type="button"
                  size="xs"
                  variant={statusPreview === code ? "secondary" : "ghost"}
                  aria-pressed={statusPreview === code}
                  onClick={() => setStatusPreview(code)}
                >
                  {code}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="border border-border bg-muted/15">
              <StatusScreen
                status={statusPreview}
                layout="embedded"
                headingLevel="h2"
                primaryAction={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => toast.info(`Retry triggered for ${statusPreview}`)}
                  >
                    Try again
                  </Button>
                }
                secondaryAction={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setStatusPreview("404")}
                  >
                    Reset preview
                  </Button>
                }
                details={`Status: ${statusPreview}\nRoute: /demo/blocks\nRequestId: req_demo_019`}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Loading state</CardTitle>
            <CardDescription>Skeleton rows, same column count.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={[]}
              columns={staticPreviewColumns}
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
              columns={staticPreviewColumns}
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
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-48 max-w-full" />
          <Button variant="outline" size="sm" className="self-start" onClick={() => setSorting([])}>
            Clear sorting
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
