import type { FlattenedTreeItem, TreeNode } from "./types";

export function toIdSet(value?: ReadonlySet<string> | readonly string[]): Set<string> {
  if (!value) return new Set();
  return value instanceof Set ? new Set(value) : new Set(value);
}

export function getResolvedChildren<TMeta>(
  node: TreeNode<TMeta>,
  loadedChildren?: ReadonlyMap<string, readonly TreeNode<TMeta>[]>,
): readonly TreeNode<TMeta>[] | undefined {
  if (node.children && node.children.length > 0) {
    return node.children;
  }
  return loadedChildren?.get(node.id);
}

export function isTreeBranch<TMeta>(
  node: TreeNode<TMeta>,
  loadedChildren?: ReadonlyMap<string, readonly TreeNode<TMeta>[]>,
): boolean {
  const children = getResolvedChildren(node, loadedChildren);
  return Boolean(node.hasChildren || (children && children.length > 0));
}

export function flattenVisibleTree<TMeta>(
  nodes: readonly TreeNode<TMeta>[],
  expandedIds: ReadonlySet<string>,
  loadedChildren?: ReadonlyMap<string, readonly TreeNode<TMeta>[]>,
): FlattenedTreeItem<TMeta>[] {
  const result: FlattenedTreeItem<TMeta>[] = [];

  function visit(list: readonly TreeNode<TMeta>[], depth: number, parentId: string | null) {
    const siblingCount = list.length;
    for (let i = 0; i < siblingCount; i += 1) {
      const node = list[i]!;
      const children = getResolvedChildren(node, loadedChildren);
      const isBranch = Boolean(node.hasChildren || (children && children.length > 0));
      const isExpanded = isBranch && expandedIds.has(node.id);

      result.push({
        node,
        depth,
        parentId,
        isBranch,
        isExpanded,
        siblingIndex: i,
        siblingCount,
      });

      if (isExpanded && children && children.length > 0) {
        visit(children, depth + 1, node.id);
      }
    }
  }

  visit(nodes, 0, null);
  return result;
}

/** Index a visible (or windowed) preorder sequence without changing sibling order. */
export function groupTreeRows<T>(rows: readonly T[], getParentId: (row: T) => string | null) {
  const groups = new Map<string | null, T[]>();
  for (const row of rows) {
    const parentId = getParentId(row);
    const siblings = groups.get(parentId);
    if (siblings) siblings.push(row);
    else groups.set(parentId, [row]);
  }
  return groups;
}

export function collectVisibleParentIds<TMeta>(nodes: readonly TreeNode<TMeta>[]): string[] {
  const ids: string[] = [];
  function visit(list: readonly TreeNode<TMeta>[]) {
    for (const { id, children } of list) {
      if (!children?.length) continue;
      ids.push(id);
      visit(children);
    }
  }
  visit(nodes);
  return ids;
}

export function filterTreeNodes<TMeta>(
  nodes: readonly TreeNode<TMeta>[],
  query: string,
  loadedChildren?: ReadonlyMap<string, readonly TreeNode<TMeta>[]>,
): TreeNode<TMeta>[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...nodes];
  }

  const matched: TreeNode<TMeta>[] = [];
  for (const node of nodes) {
    const children = getResolvedChildren(node, loadedChildren);
    const filteredChildren = children ? filterTreeNodes(children, normalized, loadedChildren) : [];
    const selfMatches =
      node.label.toLowerCase().includes(normalized) ||
      (node.description?.toLowerCase().includes(normalized) ?? false);

    if (selfMatches || filteredChildren.length > 0) {
      matched.push({
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : children,
      });
    }
  }

  return matched;
}

export function collectExpandableIds<TMeta>(
  nodes: readonly TreeNode<TMeta>[],
  loadedChildren?: ReadonlyMap<string, readonly TreeNode<TMeta>[]>,
): string[] {
  const ids: string[] = [];

  function visit(list: readonly TreeNode<TMeta>[]) {
    for (const node of list) {
      const children = getResolvedChildren(node, loadedChildren);
      if (node.hasChildren || (children && children.length > 0)) {
        ids.push(node.id);
      }
      if (children && children.length > 0) {
        visit(children);
      }
    }
  }

  visit(nodes);
  return ids;
}

export function collectAllNodeIds<TMeta>(
  nodes: readonly TreeNode<TMeta>[],
  loadedChildren?: ReadonlyMap<string, readonly TreeNode<TMeta>[]>,
): string[] {
  const ids: string[] = [];

  function visit(list: readonly TreeNode<TMeta>[]) {
    for (const node of list) {
      ids.push(node.id);
      const children = getResolvedChildren(node, loadedChildren);
      if (children && children.length > 0) {
        visit(children);
      }
    }
  }

  visit(nodes);
  return ids;
}
