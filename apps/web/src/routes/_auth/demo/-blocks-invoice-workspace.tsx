import type { ActivityTimelineItem } from "@monorepo-boilerplate/ui/components/activity-timeline";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import {
  columnsFor,
  DataTable,
  type ExpandedState,
  type SortingState,
} from "@monorepo-boilerplate/ui/components/data-table";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { SavedViewBar } from "@monorepo-boilerplate/ui/components/saved-view-bar";
import { SplitView } from "@monorepo-boilerplate/ui/components/split-view";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import { formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { EyeIcon, PanelRightOpenIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  DEFAULT_VIEW,
  INITIAL_SAVED_VIEWS,
  INITIAL_TIMELINE,
  INVOICES,
  matchesView,
  sameViewSettings,
  type Invoice,
  type InvoiceStatus,
  type InvoiceView,
  type InvoiceViewSettings,
} from "./-blocks-invoice-data";
import { InvoiceInspector, InvoiceSubRow } from "./-blocks-invoice-inspector";
import { InvoiceMetrics } from "./-blocks-invoice-metrics";
import { WorkspaceHeader } from "./-blocks-workspace-header";
import { SkeletonPreview } from "./-blocks-state-previews";

export function InvoiceWorkspace({ children }: { children: React.ReactNode }) {
  const [kpiVariant, setKpiVariant] = useState<"cards" | "strip">("cards");
  const [savedViews, setSavedViews] = useState<InvoiceView[]>(INITIAL_SAVED_VIEWS);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [settings, setSettings] = useState<InvoiceViewSettings>(DEFAULT_VIEW.settings);
  const { minAmountMinor, statusFilter } = settings;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [expanded, setExpanded] = useState<ExpandedState>({ "inv-1": true });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [timelineByInvoice, setTimelineByInvoice] = useState<
    Record<string, ActivityTimelineItem[]>
  >({
    "inv-1": INITIAL_TIMELINE,
  });

  const activeView = savedViews.find((view) => view.id === activeViewId) ?? savedViews[0]!;
  const filteredInvoices = useMemo(
    () => INVOICES.filter((invoice) => matchesView(invoice, settings)),
    [settings],
  );
  const viewItemsWithCounts = useMemo(
    () =>
      savedViews.map((view) => ({
        ...view,
        count: INVOICES.filter((invoice) => matchesView(invoice, view.settings)).length,
      })),
    [savedViews],
  );
  const selectedInvoice = INVOICES.find((invoice) => invoice.id === selectedInvoiceId);

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

  function applySavedView(view: InvoiceView) {
    setActiveViewId(view.id);
    setSettings(view.settings);
    setPageIndex(0);
  }

  function updateSorting(sorting: SortingState) {
    setSettings((current) => ({ ...current, sorting }));
    setPageIndex(0);
  }

  function resetFilters() {
    setSettings((current) => ({ ...current, minAmountMinor: 0, statusFilter: "all" }));
    setPageIndex(0);
  }

  function toggleStatusFilter(next: InvoiceStatus) {
    setSettings((current) => ({
      ...current,
      statusFilter: current.statusFilter === next ? "all" : next,
    }));
    setPageIndex(0);
  }

  function addNote(invoiceId: string, body: string) {
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
      [invoiceId]: [...(prev[invoiceId] ?? INITIAL_TIMELINE), entry],
    }));
  }

  return (
    <>
      <WorkspaceHeader {...{ kpiVariant, setKpiVariant }} />
      <InvoiceMetrics {...{ kpiVariant, statusFilter, resetFilters, toggleStatusFilter }} />
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>SavedViewBar, Expandable Rows &amp; SplitView / DetailSheet</CardTitle>
              <CardDescription>
                Change filters, sorting, or columns to trigger the unsaved-changes dot, expand any
                row for inline sub-rows, or click a row to inspect in a resizable side pane (
                <code>md+</code>) or slide-over <code>DetailSheet</code> (<code>&lt;md</code>).
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {statusFilter !== "all" || minAmountMinor > 0 ? (
                <Button type="button" variant="outline" size="xs" onClick={resetFilters}>
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

          <label className="flex min-h-8 w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={settings.columnVisibility.customer !== false}
              onCheckedChange={(visible) =>
                setSettings((prev) => ({
                  ...prev,
                  columnVisibility: { ...prev.columnVisibility, customer: visible },
                }))
              }
            />
            Show Customer column
          </label>

          <SavedViewBar
            views={viewItemsWithCounts}
            activeViewId={activeView.id}
            isDirty={!sameViewSettings(settings, activeView.settings)}
            onSelectView={(id) => {
              const view = savedViews.find((candidate) => candidate.id === id);
              if (view) applySavedView(view);
            }}
            onSaveChanges={(id) => {
              setSavedViews((prev) =>
                prev.map((view) => (view.id === id ? { ...view, settings } : view)),
              );
              toast.success("Saved view updated");
            }}
            onDiscardChanges={() => applySavedView(activeView)}
            onCreateView={(name) => {
              const id = `view-${Date.now()}`;
              setSavedViews((prev) => [...prev, { id, name, settings }]);
              setActiveViewId(id);
              toast.success(`Created view "${name}"`);
            }}
            onRenameView={(id, name) => {
              setSavedViews((prev) =>
                prev.map((view) => (view.id === id ? { ...view, name } : view)),
              );
            }}
            onDeleteView={(id) => {
              const remaining = savedViews.filter((view) => view.id !== id);
              const defaultView = remaining.find((view) => view.isDefault);
              // The default cannot be deleted, so use its latest saved settings.
              if (!defaultView) return;
              setSavedViews(remaining);
              if (activeView.id === id) applySavedView(defaultView);
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
                sorting={settings.sorting}
                onSortingChange={updateSorting}
                columnVisibility={settings.columnVisibility}
                expanded={expanded}
                onExpandedChange={setExpanded}
                onRowClick={(row) => setSelectedInvoiceId(row.id)}
                getExpandLabel={(row, isExpanded) =>
                  `${isExpanded ? "Collapse" : "Expand"} ${row.number}`
                }
                renderSubRow={(row) => <InvoiceSubRow invoice={row} />}
              />
            }
            detail={
              selectedInvoice ? (
                <InvoiceInspector
                  selectedInvoice={selectedInvoice}
                  timeline={timelineByInvoice[selectedInvoice.id] ?? INITIAL_TIMELINE}
                  onAddNote={(body) => addNote(selectedInvoice.id, body)}
                />
              ) : null
            }
          />
        </CardContent>
      </Card>
      {children}
      <SkeletonPreview onClearSorting={() => updateSorting([])} />
    </>
  );
}
