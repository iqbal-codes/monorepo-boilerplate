import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
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
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";
import {
  TreeView,
  type TreeNode,
  type TreeSelectionMode,
} from "@monorepo-boilerplate/ui/components/tree-view";
import { formatNumber } from "@monorepo-boilerplate/ui/lib/format";

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

export function TreeExplorerPreview({ isLoading }: { isLoading: boolean }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] =
    useState<Exclude<TreeSelectionMode, "none">>("multiple");
  const [explorerExpanded, setExplorerExpanded] = useState<ReadonlySet<string>>(
    () => new Set(["org-root", "apps", "packages"]),
  );
  const [explorerSelected, setExplorerSelected] = useState<ReadonlySet<string>>(
    () => new Set(["pkg-ui-tree"]),
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

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-40 flex-1">
            <CardTitle>Interactive &amp; Lazy-Loaded Tree</CardTitle>
            <CardDescription>
              Use Arrow keys, Home/End, Space/Enter, or expand lazy branches (<code>server</code>,{" "}
              <code>api</code>, <code>docs/adr</code>).
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
              className="focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
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
            <ToggleGroupItem
              value="single"
              className="px-2.5 focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Single
            </ToggleGroupItem>
            <ToggleGroupItem
              value="multiple"
              className="px-2.5 focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Multi
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <TreeView
          nodes={INITIAL_EXPLORER_NODES}
          expandedIds={explorerExpanded}
          onExpandedIdsChange={setExplorerExpanded}
          selectedIds={explorerSelected}
          onSelectedIdsChange={setExplorerSelected}
          selectionMode={selectionMode}
          searchQuery={searchQuery}
          isLoading={isLoading}
          onLoadChildren={handleLoadChildren}
          onNodeActivate={(node) => toast(`Activated "${node.label}".`)}
          ariaLabel="Workspace explorer tree"
        />
      </CardContent>
    </Card>
  );
}
