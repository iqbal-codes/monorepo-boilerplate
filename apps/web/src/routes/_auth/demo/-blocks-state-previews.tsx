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
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { InboxIcon } from "lucide-react";
import type { Invoice } from "./-blocks-invoice-data";

const staticHelper = columnsFor<Invoice>();
const staticPreviewColumns = staticHelper.columns([
  staticHelper.accessor("number", { header: "Invoice" }),
  staticHelper.accessor("amountMinor", {
    header: "Amount",
    cell: (info) => formatMoney({ minor: info.getValue(), currency: "USD" }),
  }),
  staticHelper.accessor("status", { header: "Status" }),
]);

export function TableStatePreviews() {
  return (
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
  );
}

export function SkeletonPreview({ onClearSorting }: { onClearSorting: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Skeleton primitive</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
        <Button variant="outline" size="sm" className="self-start" onClick={onClearSorting}>
          Clear sorting
        </Button>
      </CardContent>
    </Card>
  );
}
