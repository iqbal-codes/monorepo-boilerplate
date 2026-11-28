import type { ReactNode } from "react";

export type TreeSelectionMode = "none" | "single" | "multiple";

export type TreeNode<TMeta = unknown> = {
  id: string;
  label: string;
  children?: readonly TreeNode<TMeta>[];
  /** Marks a branch whose children are loaded lazily via `onLoadChildren`. */
  hasChildren?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  badge?: ReactNode;
  description?: string;
  meta?: TMeta;
};

export type FlattenedTreeItem<TMeta = unknown> = {
  node: TreeNode<TMeta>;
  depth: number;
  parentId: string | null;
  isBranch: boolean;
  isExpanded: boolean;
  siblingIndex: number;
  siblingCount: number;
};

export type TreeVirtualizationOptions = {
  height?: number | string;
  estimateSize?: number;
  overscan?: number;
};

export type TreeNodeRenderContext<TMeta = unknown> = {
  node: TreeNode<TMeta>;
  depth: number;
  isBranch: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isLoading: boolean;
  isFocused: boolean;
};

export type TreeViewProps<TMeta = unknown> = {
  nodes: readonly TreeNode<TMeta>[];
  expandedIds?: ReadonlySet<string> | readonly string[];
  defaultExpandedIds?: ReadonlySet<string> | readonly string[];
  onExpandedIdsChange?: (ids: ReadonlySet<string>) => void;
  selectedIds?: ReadonlySet<string> | readonly string[];
  defaultSelectedIds?: ReadonlySet<string> | readonly string[];
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  selectionMode?: TreeSelectionMode;
  onNodeActivate?: (node: TreeNode<TMeta>) => void;
  /** Async or sync lazy-load callback invoked when expanding a branch with `hasChildren`. */
  onLoadChildren?: (
    node: TreeNode<TMeta>,
  ) => Promise<readonly TreeNode<TMeta>[] | void> | readonly TreeNode<TMeta>[] | void;
  loadingNodeIds?: ReadonlySet<string>;
  searchQuery?: string;
  isLoading?: boolean;
  loadingCount?: number;
  emptyState?: ReactNode;
  searchEmptyState?: ReactNode;
  /** Enables TanStack Virtual row windowing for large trees (1,000+ nodes). */
  virtualized?: boolean | TreeVirtualizationOptions;
  renderNodeContent?: (context: TreeNodeRenderContext<TMeta>) => ReactNode;
  ariaLabel?: string;
  className?: string;
};
