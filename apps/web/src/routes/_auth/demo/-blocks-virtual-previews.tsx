import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import {
  columnsFor,
  DataTable,
  type SortingState,
} from "@monorepo-boilerplate/ui/components/data-table";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import { VirtualList } from "@monorepo-boilerplate/ui/components/virtual-list";
import { formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { useState } from "react";
import { toast } from "sonner";

type LedgerRow = {
  id: string;
  entryCode: string;
  account: string;
  amountMinor: number;
  status: "settled" | "pending" | "flagged";
};
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
    sortFn: "textCaseSensitive", // Fixed-width IDs sort lexically without numeric tokenization.
    header: "Entry",
    cell: (info) => <span className="font-mono text-xs font-medium">{info.getValue()}</span>,
  }),
  ledgerHelper.accessor("account", {
    sortFn: "textCaseSensitive",
    header: "Account",
  }),
  ledgerHelper.accessor("amountMinor", {
    sortFn: "basic",
    header: "Amount",
    cell: (info) => (
      <span className="tabular-nums">
        {formatMoney({ minor: info.getValue(), currency: "USD" })}
      </span>
    ),
  }),
  ledgerHelper.accessor("status", {
    sortFn: "textCaseSensitive",
    header: "Status",
    cell: (info) => <LedgerStatus status={info.getValue()} />,
  }),
]);

function LedgerStatus({ status }: { status: LedgerRow["status"] }) {
  const tone = status === "settled" ? "success" : status === "flagged" ? "danger" : "warning";
  return <StatusBadge tone={tone}>{status}</StatusBadge>;
}

export function VirtualizedTablePreview() {
  const [sorting, setSorting] = useState<SortingState>([]);
  return (
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
          sorting={sorting}
          onSortingChange={setSorting}
          regionLabel="Virtualized ledger table"
          virtualized={{ estimateRowHeight: 36, height: 320, overscan: 6 }}
        />
      </CardContent>
    </Card>
  );
}

export function VirtualListPreview() {
  const [activeStreamIndex, setActiveStreamIndex] = useState<number>(0);
  return (
    <Card className="@container min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>Subpath-Isolated VirtualList (10,000 items)</CardTitle>
          <CardDescription>
            Imported from{" "}
            <code className="wrap-anywhere">@monorepo-boilerplate/ui/components/virtual-list</code>{" "}
            with keyboard navigation.
          </CardDescription>
        </div>
        <Badge variant="outline" className="tabular-nums">
          Active #{activeStreamIndex + 1}
        </Badge>
      </CardHeader>
      <CardContent>
        <VirtualList
          items={LEDGER_10K}
          estimateSize={56}
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
          measureDynamic
          renderItem={({ item }) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm @sm:flex @sm:gap-2.5">
              <span className="col-span-2 min-w-0 font-medium @sm:flex-1">{item.account}</span>
              <span className="font-mono text-xs text-muted-foreground">{item.entryCode}</span>
              <div className="flex items-center gap-2">
                <LedgerStatus status={item.status} />
                <span className="text-xs tabular-nums">
                  {formatMoney({ minor: item.amountMinor, currency: "USD" })}
                </span>
              </div>
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
}
