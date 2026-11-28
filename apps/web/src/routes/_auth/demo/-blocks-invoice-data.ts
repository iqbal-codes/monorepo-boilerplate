import type { ActivityTimelineItem } from "@monorepo-boilerplate/ui/components/activity-timeline";
import type {
  SortingState,
  ColumnVisibilityState,
} from "@monorepo-boilerplate/ui/components/data-table";
import type { SavedViewItem } from "@monorepo-boilerplate/ui/components/saved-view-bar";

export type InvoiceStatus = "paid" | "open";

export type InvoiceLineItem = {
  id: string;
  description: string;
  qty: number;
  amountMinor: number;
};

export type Invoice = {
  id: string;
  number: string;
  customer: string;
  reference: string;
  amountMinor: number;
  issuedAt: string;
  status: InvoiceStatus;
  lineItems: readonly InvoiceLineItem[];
};

export type InvoiceViewSettings = {
  statusFilter: "all" | InvoiceStatus;
  minAmountMinor: number;
  sorting: SortingState;
  columnVisibility: ColumnVisibilityState;
};

export type InvoiceView = SavedViewItem & { settings: InvoiceViewSettings };

export const INVOICES: Invoice[] = Array.from({ length: 23 }, (_, index) => {
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

export const DEFAULT_VIEW: InvoiceView = {
  id: "all",
  name: "All invoices",
  settings: {
    statusFilter: "all",
    minAmountMinor: 0,
    sorting: [{ id: "number", desc: true }],
    columnVisibility: {},
  },
  isDefault: true,
  canRename: false,
  canDelete: false,
};

export const INITIAL_SAVED_VIEWS: InvoiceView[] = [
  DEFAULT_VIEW,
  {
    id: "open",
    name: "Open balance",
    settings: {
      statusFilter: "open",
      minAmountMinor: 0,
      sorting: [{ id: "amountMinor", desc: true }],
      columnVisibility: {},
    },
  },
  {
    id: "high-value",
    name: "High value ($500+)",
    settings: {
      statusFilter: "all",
      minAmountMinor: 50_000,
      sorting: [{ id: "amountMinor", desc: true }],
      columnVisibility: { customer: false },
    },
  },
];

export function matchesView(
  invoice: Invoice,
  { statusFilter, minAmountMinor }: InvoiceViewSettings,
) {
  return (
    (statusFilter === "all" || invoice.status === statusFilter) &&
    invoice.amountMinor >= minAmountMinor
  );
}

export function sameViewSettings(
  current: InvoiceViewSettings,
  saved: InvoiceViewSettings,
): boolean {
  return (
    current.statusFilter === saved.statusFilter &&
    current.minAmountMinor === saved.minAmountMinor &&
    sameSorting(current.sorting, saved.sorting) &&
    // TanStack treats an absent key and an explicit true as the same (visible).
    Object.entries(current.columnVisibility).every(
      ([id, visible]) => visible || saved.columnVisibility[id] === false,
    ) &&
    Object.entries(saved.columnVisibility).every(
      ([id, visible]) => visible || current.columnVisibility[id] === false,
    )
  );
}

function sameSorting(a: SortingState, b: SortingState): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => item.id === b[index]?.id && item.desc === b[index]?.desc)
  );
}
export const INITIAL_TIMELINE: ActivityTimelineItem[] = [
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
