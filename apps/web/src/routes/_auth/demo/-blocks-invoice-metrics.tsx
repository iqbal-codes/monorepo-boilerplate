import { KpiCard, KpiGrid } from "@monorepo-boilerplate/ui/components/kpi-card";
import { formatMoney, formatNumber, formatPercent } from "@monorepo-boilerplate/ui/lib/format";
import { CheckCircle2Icon, CircleDollarSignIcon, ClockIcon, FileTextIcon } from "lucide-react";
import { INVOICES, type InvoiceStatus, type InvoiceViewSettings } from "./-blocks-invoice-data";

const INVOICE_SPARKLINE = INVOICES.slice(-8).map((invoice) => invoice.amountMinor);
const openInvoices = INVOICES.filter((invoice) => invoice.status === "open");
const paidInvoices = INVOICES.filter((invoice) => invoice.status === "paid");
const openMinor = openInvoices.reduce((sum, invoice) => sum + invoice.amountMinor, 0);
const paidMinor = paidInvoices.reduce((sum, invoice) => sum + invoice.amountMinor, 0);

export function InvoiceMetrics({
  kpiVariant,
  statusFilter,
  resetFilters,
  toggleStatusFilter,
}: {
  kpiVariant: "cards" | "strip";
  statusFilter: InvoiceViewSettings["statusFilter"];
  resetFilters: () => void;
  toggleStatusFilter: (status: InvoiceStatus) => void;
}) {
  return (
    <KpiGrid variant={kpiVariant}>
      <KpiCard
        label="Invoices"
        icon={<FileTextIcon />}
        value={formatNumber(INVOICES.length)}
        sparkline={INVOICE_SPARKLINE}
        hint={statusFilter === "all" ? "Showing all rows" : "Click to clear filter"}
        active={statusFilter === "all"}
        onClick={resetFilters}
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
  );
}
