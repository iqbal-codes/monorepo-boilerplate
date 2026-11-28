import { createFileRoute } from "@tanstack/react-router";
import { InspectionPreview, StatusScreenPreview } from "./-blocks-inspection-previews";
import { InvoiceWorkspace } from "./-blocks-invoice-workspace";
import { TableStatePreviews } from "./-blocks-state-previews";
import { VirtualizedTablePreview, VirtualListPreview } from "./-blocks-virtual-previews";

export const Route = createFileRoute("/_auth/demo/blocks")({
  component: BlocksDemo,
  staticData: { pageTitle: "Blocks" },
});

/** Deletable showcase with local in-memory fixtures only. */
function BlocksDemo() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <InvoiceWorkspace>
        <div className="grid grid-cols-1 gap-4">
          <VirtualizedTablePreview />
          <VirtualListPreview />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InspectionPreview />
          <StatusScreenPreview />
        </div>
        <TableStatePreviews />
      </InvoiceWorkspace>
    </div>
  );
}
