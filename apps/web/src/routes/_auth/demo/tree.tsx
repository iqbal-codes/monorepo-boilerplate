import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  RotateCcwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@monorepo-boilerplate/ui/components/input-group";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";
import {
  TreeView,
  collectAllNodeIds,
  collectExpandableIds,
  type TreeNode,
  type TreeSelectionMode,
} from "@monorepo-boilerplate/ui/components/tree-view";
import { formatNumber } from "@monorepo-boilerplate/ui/lib/format";

export const Route = createFileRoute("/_auth/demo/tree")({
  component: TreeDemo,
  staticData: { pageTitle: "Tree View" },
});

const INITIAL_EXPLORER_NODES: TreeNode[] = [
  {
    id: "org-root",
    label: "monorepo-boilerplate",
    badge: <Badge variant="outline">Workspace</Badge>,
    children: [
      {
        id: "apps",
        label: "apps",
        children: [
          {
            id: "apps-web",
            label: "web",
            description: "TanStack Start + Vite",
            children: [
              {
                id: "apps-web-routes",
                label: "routes/_auth",
                badge: <Badge variant="secondary">8</Badge>,
              },
              { id: "apps-web-lib", label: "lib/nav.ts" },
            ],
          },
          {
            id: "apps-server",
            label: "server",
            description: "Hono + tRPC",
            hasChildren: true,
          },
        ],
      },
      {
        id: "packages",
        label: "packages",
        children: [
          {
            id: "pkg-ui",
            label: "ui",
            description: "Controlled blocks",
            children: [
              { id: "pkg-ui-calendar", label: "components/calendar-view" },
              { id: "pkg-ui-tree", label: "components/tree-view" },
              { id: "pkg-ui-kanban", label: "components/kanban" },
            ],
          },
          {
            id: "pkg-api",
            label: "api",
            hasChildren: true,
          },
          {
            id: "pkg-legacy",
            label: "legacy-adapter (deprecated)",
            disabled: true,
            badge: <Badge variant="outline">Disabled</Badge>,
          },
        ],
      },
      {
        id: "docs",
        label: "docs/adr",
        hasChildren: true,
      },
    ],
  },
];

const LAZY_BRANCH_DATA: Record<string, TreeNode[]> = {
  "apps-server": [
    { id: "apps-server-index", label: "src/index.ts" },
    { id: "apps-server-auth", label: "src/auth.ts" },
  ],
  "pkg-api": [
    { id: "pkg-api-procedures", label: "src/procedures.ts" },
    { id: "pkg-api-customers", label: "src/routers/customers.ts" },
  ],
  docs: [
    { id: "adr-0002", label: "0002-table-v9-and-controlled-blocks.md" },
    { id: "adr-0009", label: "0009-dnd-kit-react-and-controlled-kanban.md" },
  ],
};

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

/**
 * DELETABLE DEMO. Exhibits the subpath-isolated TreeView block:
 * - Left: interactive search, single/multi selection, disabled state, and async lazy-loading.
 * - Right: virtualized 1,000+ node tree stress preview.
 */
function TreeDemo() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] =
    useState<Exclude<TreeSelectionMode, "none">>("multiple");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [explorerExpanded, setExplorerExpanded] = useState<ReadonlySet<string>>(
    () => new Set(["org-root", "apps", "packages"]),
  );
  const [explorerSelected, setExplorerSelected] = useState<ReadonlySet<string>>(
    () => new Set(["pkg-ui-tree"]),
  );
  const [treeKey, setTreeKey] = useState(0);

  const virtualNodes = useMemo(() => buildVirtualStressTree(30, 35), []);
  const totalVirtualCount = useMemo(() => collectAllNodeIds(virtualNodes).length, [virtualNodes]);
  const allVirtualExpandable = useMemo(() => collectExpandableIds(virtualNodes), [virtualNodes]);
  const [virtualExpanded, setVirtualExpanded] = useState<ReadonlySet<string>>(
    () => new Set(allVirtualExpandable),
  );
  const [virtualSelected, setVirtualSelected] = useState<ReadonlySet<string>>(
    () => new Set(["v-node-1-1"]),
  );

  async function handleLoadChildren(node: TreeNode): Promise<TreeNode[]> {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const loaded = LAZY_BRANCH_DATA[node.id] ?? [];
    toast(`Loaded ${loaded.length} items in "${node.label}".`);
    return loaded;
  }

  function handleSelectionModeChange(mode: Exclude<TreeSelectionMode, "none">) {
    setSelectionMode(mode);
    if (mode === "single" && explorerSelected.size > 1) {
      const first = [...explorerSelected][0];
      setExplorerSelected(first ? new Set([first]) : new Set());
    }
  }

  function handleReset() {
    setSearchQuery("");
    setSelectionMode("multiple");
    setIsLoadingPreview(false);
    setExplorerExpanded(new Set(["org-root", "apps", "packages"]));
    setExplorerSelected(new Set(["pkg-ui-tree"]));
    setVirtualExpanded(new Set(allVirtualExpandable));
    setVirtualSelected(new Set(["v-node-1-1"]));
    setTreeKey((k) => k + 1);
    toast("Tree demo reset.");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <PageHeader
        title="Tree View"
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
              <ToggleGroupItem value="ready">Ready</ToggleGroupItem>
              <ToggleGroupItem value="loading">Loading</ToggleGroupItem>
            </ToggleGroup>
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset
            </Button>
          </>
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Interactive + Lazy-loaded Tree */}
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle>Interactive &amp; Lazy-Loaded Tree</CardTitle>
                <CardDescription>
                  Use Arrow keys, Home/End, Space/Enter, or expand lazy branches (
                  <code>server</code>, <code>api</code>, <code>docs/adr</code>).
                </CardDescription>
              </div>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {formatNumber(explorerSelected.size)} selected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <InputGroup className="min-w-44 flex-1">
                <InputGroupInput
                  type="search"
                  aria-label="Filter tree nodes"
                  placeholder="Filter nodes…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="[&::-webkit-search-cancel-button]:hidden"
                />
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                {searchQuery.length > 0 && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      size="icon-xs"
                      aria-label="Clear tree filter"
                      onClick={() => setSearchQuery("")}
                    >
                      <XIcon aria-hidden="true" />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>

              <ToggleGroup
                aria-label="Selection mode"
                size="sm"
                variant="outline"
                spacing={0}
                value={[selectionMode]}
                onValueChange={(next) => {
                  const mode = next[0] as Exclude<TreeSelectionMode, "none"> | undefined;
                  if (mode) handleSelectionModeChange(mode);
                }}
              >
                <ToggleGroupItem value="single" className="px-2.5">
                  Single
                </ToggleGroupItem>
                <ToggleGroupItem value="multiple" className="px-2.5">
                  Multi
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <TreeView
              key={treeKey}
              nodes={INITIAL_EXPLORER_NODES}
              expandedIds={explorerExpanded}
              onExpandedIdsChange={setExplorerExpanded}
              selectedIds={explorerSelected}
              onSelectedIdsChange={setExplorerSelected}
              selectionMode={selectionMode}
              searchQuery={searchQuery}
              isLoading={isLoadingPreview}
              onLoadChildren={handleLoadChildren}
              onNodeActivate={(node) => toast(`Activated "${node.label}".`)}
              ariaLabel="Workspace explorer tree"
            />
          </CardContent>
        </Card>

        {/* 1,000+ Node Virtualized Tree */}
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle>Virtualized Tree ({formatNumber(totalVirtualCount)} nodes)</CardTitle>
                <CardDescription>
                  TanStack Virtual windowing keeps DOM node count constant across 1,000+ expanded
                  tree items.
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
              isLoading={isLoadingPreview}
              virtualized={{ height: 420, estimateSize: 36, overscan: 6 }}
              ariaLabel="1000+ node virtualized tree"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
