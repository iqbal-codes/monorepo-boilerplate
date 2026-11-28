"use client";

import * as React from "react";
import { cn } from "cn";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";

import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import type {
  FlattenedTreeItem,
  TreeNode,
  TreeNodeRenderContext,
  TreeSelectionMode,
} from "./types";

export function TreeRow<TMeta>({
  item,
  selectionMode,
  isSelected,
  isLoading,
  isFocused,
  setItemRef,
  onToggleExpand,
  onSelectOrActivate,
  onKeyDown,
  onFocus,
  renderNodeContent,
  style,
  className,
  children,
}: {
  item: FlattenedTreeItem<TMeta>;
  selectionMode: TreeSelectionMode;
  isSelected: boolean;
  isLoading: boolean;
  isFocused: boolean;
  setItemRef: (nodeId: string, element: HTMLDivElement | null) => void;
  onToggleExpand: (item: FlattenedTreeItem<TMeta>) => void;
  onSelectOrActivate: (item: FlattenedTreeItem<TMeta>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, item: FlattenedTreeItem<TMeta>) => void;
  onFocus: (nodeId: string) => void;
  renderNodeContent?: (context: TreeNodeRenderContext<TMeta>) => React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}) {
  const { node, depth, isBranch, isExpanded, siblingIndex, siblingCount } = item;
  const isDisabled = Boolean(node.disabled);
  const rowId = React.useId();

  const defaultIcon =
    node.icon ??
    (isBranch ? (
      isExpanded ? (
        <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )
    ) : (
      <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    ));

  return (
    <div
      ref={(el) => setItemRef(node.id, el)}
      role="treeitem"
      data-slot="tree-node"
      data-node-id={node.id}
      data-depth={depth}
      data-selected={isSelected ? "true" : undefined}
      data-disabled={isDisabled ? "true" : undefined}
      data-loading={isLoading ? "true" : undefined}
      aria-level={depth + 1}
      aria-setsize={siblingCount}
      aria-posinset={siblingIndex + 1}
      aria-expanded={isBranch ? isExpanded : undefined}
      aria-selected={selectionMode === "none" ? undefined : isSelected}
      aria-disabled={isDisabled ? "true" : undefined}
      aria-busy={isLoading ? "true" : undefined}
      tabIndex={isFocused ? 0 : -1}
      aria-labelledby={rowId}
      style={style}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocus(node.id);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) onKeyDown(event, item);
      }}
      onClick={(event) => {
        if (
          !(event.target instanceof Element) ||
          event.target.closest('[role="treeitem"]') !== event.currentTarget
        )
          return;
        onFocus(node.id);
        if (!isDisabled) onSelectOrActivate(item);
      }}
      className="min-w-0 outline-none [&:focus-visible>[data-slot=tree-row]]:bg-muted/70 [&:focus-visible>[data-slot=tree-row]]:outline-2 [&:focus-visible>[data-slot=tree-row]]:outline-solid [&:focus-visible>[data-slot=tree-row]]:outline-offset-[-2px] [&:focus-visible>[data-slot=tree-row]]:outline-ring"
    >
      <div
        id={rowId}
        data-slot="tree-row"
        style={{ paddingInlineStart: `${depth * 18 + 8}px` }}
        className={cn(
          "flex min-h-9 w-full min-w-0 cursor-pointer items-center gap-1.5 pe-3 text-sm select-none transition-colors hover:bg-muted/60",
          style && "h-full",
          isSelected && "bg-muted text-foreground",
          isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
          className,
        )}
      >
        {isBranch ? (
          <span
            data-slot="tree-node-toggle"
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              onFocus(node.id);
              if (!isDisabled) {
                onToggleExpand(item);
              }
            }}
            className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isLoading ? (
              <Spinner className="size-3.5" aria-hidden="true" />
            ) : isExpanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5 rtl:rotate-180" />
            )}
          </span>
        ) : (
          <span aria-hidden="true" className="inline-flex size-6 shrink-0" />
        )}

        {selectionMode === "multiple" && (
          <span
            aria-hidden="true"
            data-slot="tree-node-checkbox"
            data-checked={isSelected ? "true" : undefined}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center border border-input bg-background transition-colors",
              isSelected && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {isSelected && <CheckIcon className="size-3" />}
          </span>
        )}

        {renderNodeContent ? (
          renderNodeContent({
            node,
            depth,
            isBranch,
            isExpanded,
            isSelected,
            isLoading,
            isFocused,
          })
        ) : (
          <>
            {defaultIcon}
            <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
            {node.description ? (
              <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">
                {node.description}
              </span>
            ) : null}
            {node.badge}
          </>
        )}
      </div>
      {children && <div role="group">{children}</div>}
    </div>
  );
}

export type { TreeNode };
