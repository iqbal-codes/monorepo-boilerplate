import {
  ActivityTimeline,
  ActivityTimelineComposer,
  type ActivityTimelineItem,
} from "@monorepo-boilerplate/ui/components/activity-timeline";
import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";
import { DescriptionList } from "@monorepo-boilerplate/ui/components/description-list";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import { formatDate, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { type Invoice } from "./-blocks-invoice-data";

export function InvoiceInspector({
  selectedInvoice,
  timeline,
  onAddNote,
}: {
  selectedInvoice: Invoice;
  timeline: ActivityTimelineItem[];
  onAddNote: (body: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge tone={selectedInvoice.status === "paid" ? "success" : "warning"} dot>
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
        items={timeline}
        composer={<ActivityTimelineComposer onSubmit={onAddNote} />}
      />
    </div>
  );
}

export function InvoiceSubRow({ invoice: row }: { invoice: Invoice }) {
  return (
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
  );
}
