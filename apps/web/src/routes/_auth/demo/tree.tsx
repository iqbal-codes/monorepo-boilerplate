import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";
import { TreeExplorerPreview } from "./-tree-explorer-preview";
import { TreeVirtualPreview } from "./-tree-virtual-preview";

export const Route = createFileRoute("/_auth/demo/tree")({
  component: TreeDemo,
  staticData: { pageTitle: "Tree View" },
});

/** Deletable showcase for the interactive and virtualized tree previews. */
function TreeDemo() {
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  function handleReset() {
    setIsLoadingPreview(false);
    setPreviewKey((key) => key + 1);
    toast("Tree demo reset.");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <PageHeader
        title="Tree View"
        stackActionsOnMobile
        description="Controlled, subpath-isolated TreeView block with WAI-ARIA keyboard navigation, single/multi selection, async lazy-loading, and 1,000+ node virtualization. Deletable demo."
        actions={
          <>
            <ToggleGroup
              aria-label="Tree loading state"
              size="sm"
              value={[isLoadingPreview ? "loading" : "ready"]}
              onValueChange={(next) => {
                const mode = next[0];
                if (mode === "loading") setIsLoadingPreview(true);
                if (mode === "ready") setIsLoadingPreview(false);
              }}
            >
              <ToggleGroupItem
                className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
                value="ready"
              >
                Ready
              </ToggleGroupItem>
              <ToggleGroupItem
                className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
                value="loading"
              >
                Loading
              </ToggleGroupItem>
            </ToggleGroup>
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset
            </Button>
          </>
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <TreeExplorerPreview key={`explorer-${previewKey}`} isLoading={isLoadingPreview} />
        <TreeVirtualPreview key={`virtual-${previewKey}`} isLoading={isLoadingPreview} />
      </div>
    </div>
  );
}
