import { useState } from "react";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import {
  TreeView,
  collectAllNodeIds,
  collectExpandableIds,
  type TreeNode,
} from "@monorepo-boilerplate/ui/components/tree-view";
import { formatNumber } from "@monorepo-boilerplate/ui/lib/format";

function buildVirtualStressTree(groupCount = 30, childrenPerGroup = 35): TreeNode[] {
  return Array.from({ length: groupCount }, (_, groupIndex) => {
    const groupNum = groupIndex + 1;
    return {
      id: `v-group-${groupNum}`,
      label: `Region ${String(groupNum).padStart(2, "0")}`,
      badge: (
        <Badge variant="outline" className="tabular-nums">
          {childrenPerGroup}
        </Badge>
      ),
      children: Array.from({ length: childrenPerGroup }, (__, childIndex) => ({
        id: `v-node-${groupNum}-${childIndex + 1}`,
        label: `Cluster Node ${groupNum}.${String(childIndex + 1).padStart(2, "0")}`,
        description: childIndex % 7 === 0 ? "Primary shard" : undefined,
      })),
    };
  });
}

const virtualNodes = buildVirtualStressTree();
const totalVirtualCount = collectAllNodeIds(virtualNodes).length;
const allVirtualExpandable = collectExpandableIds(virtualNodes);

export function TreeVirtualPreview({ isLoading }: { isLoading: boolean }) {
  const [virtualExpanded, setVirtualExpanded] = useState<ReadonlySet<string>>(
    () => new Set(allVirtualExpandable),
  );
  const [virtualSelected, setVirtualSelected] = useState<ReadonlySet<string>>(
    () => new Set(["v-node-1-1"]),
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-[1_1_14rem]">
            <CardTitle>Virtualized Tree ({formatNumber(totalVirtualCount)} nodes)</CardTitle>
            <CardDescription>
              TanStack Virtual windowing keeps DOM node count bounded across 1,000+ expanded tree
              items.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setVirtualExpanded(new Set(allVirtualExpandable))}
            >
              <ChevronsUpDownIcon data-icon="inline-start" aria-hidden="true" />
              Expand all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setVirtualExpanded(new Set())}
            >
              <ChevronsDownUpIcon data-icon="inline-start" aria-hidden="true" />
              Collapse all
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3">
        <TreeView
          nodes={virtualNodes}
          expandedIds={virtualExpanded}
          onExpandedIdsChange={setVirtualExpanded}
          selectedIds={virtualSelected}
          onSelectedIdsChange={setVirtualSelected}
          selectionMode="single"
          isLoading={isLoading}
          virtualized={{ height: 420, estimateSize: 36, overscan: 6 }}
          ariaLabel="1000+ node virtualized tree"
        />
      </CardContent>
    </Card>
  );
}
