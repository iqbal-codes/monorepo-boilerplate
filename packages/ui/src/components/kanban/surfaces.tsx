import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import {
  AlertTriangleIcon,
  ArrowRightLeftIcon,
  ChevronLeftIcon,
  GripVerticalIcon,
} from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import type { KanbanColumnDef } from "./types";

export function KanbanCardSurface({
  className,
  isDragging = false,
  isOverlay = false,
  isPending = false,
  ...props
}: ComponentProps<"div"> & {
  isDragging?: boolean;
  isOverlay?: boolean;
  isPending?: boolean;
}) {
  return (
    <div
      data-slot="kanban-card-surface"
      data-dragging={isDragging ? "true" : undefined}
      data-overlay={isOverlay ? "true" : undefined}
      data-pending={isPending ? "true" : undefined}
      aria-busy={isPending ? true : undefined}
      className={cn(
        "group/kanban-card relative flex min-w-0 flex-col gap-2 border border-border bg-card p-3.5 text-start text-sm text-card-foreground shadow-xs transition-[box-shadow,border-color,opacity,background-color] duration-150 ease-out hover:border-foreground/20 group-hover/kanban-item:border-foreground/20",
        isDragging && "opacity-40 select-none",
        isOverlay && "border-foreground/30 shadow-lg ring-1 ring-foreground/10 select-none",
        isPending && "opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function KanbanCardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="kanban-card-title"
      className={cn(
        "min-w-0 text-sm font-medium leading-snug text-foreground wrap-break-word",
        className,
      )}
      {...props}
    />
  );
}

export function KanbanCardDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="kanban-card-description"
      className={cn(
        "line-clamp-2 min-w-0 text-xs leading-[1.5] text-muted-foreground wrap-break-word",
        className,
      )}
      {...props}
    />
  );
}

export function KanbanCardMeta({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="kanban-card-meta"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export function KanbanDragHandle({
  handleRef,
  cardLabel,
  disabled = false,
  className,
}: {
  handleRef: (element: Element | null) => void;
  cardLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      ref={handleRef}
      type="button"
      variant="ghost"
      size="icon-xs"
      disabled={disabled}
      aria-label={`Drag ${cardLabel}`}
      data-slot="kanban-drag-handle"
      data-kanban-drag-handle="true"
      className={cn("relative z-10 cursor-grab touch-none active:cursor-grabbing", className)}
    >
      <GripVerticalIcon aria-hidden="true" />
    </Button>
  );
}

export function KanbanCardMoveMenu<TColumn extends KanbanColumnDef = KanbanColumnDef>({
  cardLabel,
  columns,
  onSelectColumn,
  disabled = false,
  className,
}: {
  cardLabel: string;
  columns: readonly TColumn[];
  onSelectColumn: (columnId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled || columns.length === 0}
            aria-label={`Move ${cardLabel} to another column`}
            data-slot="kanban-card-move-trigger"
            data-kanban-no-drag="true"
            className={cn("relative z-10", className)}
          />
        }
      >
        <ArrowRightLeftIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-kanban-no-drag="true">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to column</DropdownMenuLabel>
          {columns.map((column) => (
            <DropdownMenuItem key={column.id} onClick={() => onSelectColumn(column.id)}>
              {column.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function KanbanColumnHeader({
  title,
  description,
  count,
  wipLimit,
  isOverWipLimit = false,
  collapsible = true,
  onToggleCollapse,
  trailing,
  className,
}: {
  title: string;
  description?: string;
  count: number;
  wipLimit?: number;
  isOverWipLimit?: boolean;
  collapsible?: boolean;
  onToggleCollapse?: () => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const countLabel = wipLimit !== undefined ? `${count} / ${wipLimit}` : String(count);

  return (
    <div
      data-slot="kanban-column-header"
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-heading text-xs font-semibold tracking-wider text-foreground uppercase">
          {title}
        </h3>
        <Badge
          variant={isOverWipLimit ? "destructive" : "secondary"}
          className="shrink-0 gap-1 tabular-nums"
          aria-label={
            isOverWipLimit && wipLimit !== undefined
              ? `${count} of ${wipLimit} cards, over work-in-progress limit`
              : wipLimit !== undefined
                ? `${count} of ${wipLimit} cards`
                : `${count} cards`
          }
        >
          {isOverWipLimit && <AlertTriangleIcon aria-hidden="true" />}
          <span>{countLabel}</span>
          {isOverWipLimit && <span className="sr-only">Over WIP limit</span>}
        </Badge>
        {collapsible && onToggleCollapse && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onToggleCollapse}
            aria-expanded={true}
            aria-label={`Collapse ${title} column`}
            data-slot="kanban-column-collapse"
          >
            <ChevronLeftIcon className="rtl:rotate-180" aria-hidden="true" />
          </Button>
        )}
      </div>
      {(description || trailing) && (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {description && (
            <p className="min-w-0 truncate text-xs leading-snug text-muted-foreground">
              {description}
            </p>
          )}
          {trailing}
        </div>
      )}
    </div>
  );
}
