import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import {
  DragDropProvider,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
} from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { BanIcon, ChevronRightIcon, Columns3Icon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { buildKanbanMoveEvent, buildOrderMap, findCardLocation, moveCardInOrderMap } from "./move";
import { KanbanColumnHeader } from "./surfaces";
import type {
  KanbanBoardProps,
  KanbanCardRenderContext,
  KanbanColumnDef,
  KanbanColumnRenderContext,
  KanbanMoveEvent,
} from "./types";

const COLUMN_DROP_PREFIX = "kanban-column:";

function toColumnDropId(columnId: string): string {
  return `${COLUMN_DROP_PREFIX}${columnId}`;
}

function isInteractiveDragExclusion(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-kanban-drag-handle="true"]')) return false;
  if (target.closest('[data-kanban-no-drag="true"]')) return true;

  const interactive = target.closest(
    'button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [contenteditable="true"]',
  );
  if (!interactive) return false;
  if (interactive.getAttribute("data-kanban-card-trigger") === "true") return false;
  return true;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

type SortableCardData = {
  kind: "card";
  cardId: string;
  columnId: string;
};

type ColumnDropData = {
  kind: "column";
  columnId: string;
};

function isSortableCardData(data: unknown): data is SortableCardData {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    (data as { kind?: unknown }).kind === "card"
  );
}

function isColumnDropData(data: unknown): data is ColumnDropData {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    (data as { kind?: unknown }).kind === "column"
  );
}

type KanbanSortableCardProps<TCard, TColumn extends KanbanColumnDef> = {
  card: TCard;
  cardId: string;
  cardLabel: string;
  column: TColumn;
  index: number;
  canDrag: boolean;
  isPending: boolean;
  dragHandle: boolean;
  reducedMotion: boolean;
  availableTargetColumns: readonly TColumn[];
  onCardClick?: (card: TCard, column: TColumn) => void;
  onMoveToColumn: (cardId: string, targetColumnId: string) => void;
  renderCard: (context: KanbanCardRenderContext<TCard, TColumn>) => ReactNode;
};

function KanbanSortableCard<TCard, TColumn extends KanbanColumnDef>({
  card,
  cardId,
  cardLabel,
  column,
  index,
  canDrag,
  isPending,
  dragHandle,
  reducedMotion,
  availableTargetColumns,
  onCardClick,
  onMoveToColumn,
  renderCard,
}: KanbanSortableCardProps<TCard, TColumn>) {
  const draggableDisabled = !canDrag || isPending;

  const { ref, handleRef, isDragging } = useSortable<SortableCardData>({
    id: cardId,
    index,
    group: column.id,
    type: "card",
    accept: "card",
    disabled: {
      draggable: draggableDisabled,
      droppable: false,
    },
    transition: reducedMotion ? null : { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    data: {
      kind: "card",
      cardId,
      columnId: column.id,
    },
  });

  const handleMove = useCallback(
    (targetColumnId: string) => {
      onMoveToColumn(cardId, targetColumnId);
    },
    [cardId, onMoveToColumn],
  );

  return (
    <li
      ref={ref}
      data-slot="kanban-card-item"
      data-card-id={cardId}
      data-dragging={isDragging ? "true" : undefined}
      data-pending={isPending ? "true" : undefined}
      aria-busy={isPending ? true : undefined}
      className={cn(
        "group/kanban-item relative list-none touch-manipulation",
        !dragHandle && !draggableDisabled && "cursor-grab active:cursor-grabbing",
      )}
    >
      {onCardClick && (
        <button
          type="button"
          data-kanban-card-trigger="true"
          aria-label={`Open ${cardLabel}`}
          onClick={() => onCardClick(card, column)}
          className="absolute inset-0 z-[1] cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      )}
      {!dragHandle && !draggableDisabled && (
        <button
          ref={handleRef}
          type="button"
          data-slot="kanban-keyboard-handle"
          data-kanban-drag-handle="true"
          aria-label={`Reorder ${cardLabel}`}
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:end-10 focus-visible:z-20 focus-visible:border focus-visible:border-ring focus-visible:bg-popover focus-visible:px-2 focus-visible:py-1 focus-visible:text-xs focus-visible:font-medium focus-visible:text-foreground focus-visible:shadow-sm focus-visible:outline-none"
        >
          Reorder
        </button>
      )}
      {renderCard({
        card,
        column,
        index,
        isDragging,
        isOverlay: false,
        isPending,
        canDrag: !draggableDisabled,
        dragHandleRef: dragHandle ? handleRef : () => {},
        moveToColumn: handleMove,
        availableTargetColumns,
      })}
    </li>
  );
}

type KanbanColumnViewProps<TCard, TColumn extends KanbanColumnDef> = {
  column: TColumn;
  cards: readonly TCard[];
  getCardId: (card: TCard) => string;
  getCardLabel: (card: TCard) => string;
  isCollapsed: boolean;
  isBlockedDrop: boolean;
  isDraggingAny: boolean;
  dragHandle: boolean;
  reducedMotion: boolean;
  pendingCardIds?: ReadonlySet<string>;
  canDragCard?: (card: TCard) => boolean;
  getAvailableTargetColumns: (card: TCard, column: TColumn) => readonly TColumn[];
  onToggleCollapse: (columnId: string) => void;
  onCardClick?: (card: TCard, column: TColumn) => void;
  onMoveToColumn: (cardId: string, targetColumnId: string) => void;
  renderCard: (context: KanbanCardRenderContext<TCard, TColumn>) => ReactNode;
  renderColumnHeader?: (context: KanbanColumnRenderContext<TCard, TColumn>) => ReactNode;
  renderColumnFooter?: (context: KanbanColumnRenderContext<TCard, TColumn>) => ReactNode;
  renderEmptyColumn?: (column: TColumn) => ReactNode;
};

function KanbanColumnView<TCard, TColumn extends KanbanColumnDef>({
  column,
  cards,
  getCardId,
  getCardLabel,
  isCollapsed,
  isBlockedDrop,
  isDraggingAny,
  dragHandle,
  reducedMotion,
  pendingCardIds,
  canDragCard,
  getAvailableTargetColumns,
  onToggleCollapse,
  onCardClick,
  onMoveToColumn,
  renderCard,
  renderColumnHeader,
  renderColumnFooter,
  renderEmptyColumn,
}: KanbanColumnViewProps<TCard, TColumn>) {
  const { ref: dropRef, isDropTarget } = useDroppable<ColumnDropData>({
    id: toColumnDropId(column.id),
    type: "column",
    accept: "card",
    collisionPriority: 1,
    data: {
      kind: "column",
      columnId: column.id,
    },
  });

  const count = cards.length;
  const isOverWipLimit = column.wipLimit !== undefined && count > column.wipLimit;
  const collapsible = column.collapsible !== false;
  const toggleCollapse = useCallback(
    () => onToggleCollapse(column.id),
    [column.id, onToggleCollapse],
  );

  const columnContext: KanbanColumnRenderContext<TCard, TColumn> = {
    column,
    cards,
    count,
    isOverWipLimit,
    isCollapsed,
    toggleCollapse,
  };

  if (isCollapsed) {
    return (
      <div
        ref={dropRef}
        role="group"
        aria-label={`${column.title} column, collapsed`}
        data-slot="kanban-column"
        data-column-id={column.id}
        data-collapsed="true"
        data-over-wip={isOverWipLimit ? "true" : undefined}
        data-drop-target={isDropTarget && !isBlockedDrop ? "true" : undefined}
        data-drop-invalid={isBlockedDrop ? "true" : undefined}
        className={cn(
          "flex w-13 shrink-0 snap-start flex-col items-center gap-3 border bg-muted/40 px-1.5 py-3 transition-[border-color,background-color] duration-150 ease-out",
          isOverWipLimit ? "border-destructive/50" : "border-border",
          isDropTarget && !isBlockedDrop && "border-foreground/40 bg-accent/60",
          isBlockedDrop && "border-destructive bg-destructive/5",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={toggleCollapse}
          aria-expanded={false}
          aria-label={`Expand ${column.title} column`}
          data-slot="kanban-column-expand"
        >
          <ChevronRightIcon className="rtl:rotate-180" aria-hidden="true" />
        </Button>
        <Badge
          variant={isOverWipLimit ? "destructive" : "secondary"}
          className="px-1.5 tabular-nums"
        >
          {count}
        </Badge>
        <span
          aria-hidden="true"
          className="flex-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase [writing-mode:vertical-rl]"
        >
          {column.title}
        </span>
        {isBlockedDrop && <span className="sr-only">Drop not allowed in {column.title}</span>}
      </div>
    );
  }

  return (
    <div
      ref={dropRef}
      role="group"
      aria-label={`${column.title} column`}
      data-slot="kanban-column"
      data-column-id={column.id}
      data-over-wip={isOverWipLimit ? "true" : undefined}
      data-drop-target={isDropTarget && !isBlockedDrop ? "true" : undefined}
      data-drop-invalid={isBlockedDrop ? "true" : undefined}
      className={cn(
        "flex w-[min(85vw,19.5rem)] shrink-0 snap-start flex-col border bg-muted/35 transition-[border-color,background-color] duration-150 ease-out sm:w-80",
        isOverWipLimit ? "border-destructive/50" : "border-border",
        isDropTarget && !isBlockedDrop && "border-foreground/40 bg-accent/40",
        isBlockedDrop && "border-destructive bg-destructive/5",
      )}
    >
      <div className="border-b border-border/70 px-3.5 py-3">
        {renderColumnHeader ? (
          renderColumnHeader(columnContext)
        ) : (
          <KanbanColumnHeader
            title={column.title}
            description={column.description}
            count={count}
            wipLimit={column.wipLimit}
            isOverWipLimit={isOverWipLimit}
            collapsible={collapsible}
            onToggleCollapse={toggleCollapse}
          />
        )}
      </div>

      {isBlockedDrop && (
        <div
          role="note"
          className="flex items-center gap-1.5 border-b border-destructive/30 bg-destructive/10 px-3.5 py-1.5 text-xs font-medium text-destructive"
        >
          <BanIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Move to {column.title} is not allowed</span>
        </div>
      )}

      <div className="kanban-scroll flex min-h-32 max-h-[min(65vh,36rem)] flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain p-2.5">
        {cards.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-6">
            {renderEmptyColumn ? (
              renderEmptyColumn(column)
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                {isDraggingAny ? `Drop a card into ${column.title}` : "No cards in this column."}
              </p>
            )}
          </div>
        ) : (
          <ul role="list" className="flex flex-col gap-2.5">
            {cards.map((card, index) => {
              const cardId = getCardId(card);
              const cardLabel = getCardLabel(card);
              const isPending = pendingCardIds?.has(cardId) ?? false;
              const canDrag = canDragCard ? canDragCard(card) : true;
              const availableTargetColumns = getAvailableTargetColumns(card, column);

              return (
                <KanbanSortableCard
                  key={cardId}
                  card={card}
                  cardId={cardId}
                  cardLabel={cardLabel}
                  column={column}
                  index={index}
                  canDrag={canDrag}
                  isPending={isPending}
                  dragHandle={dragHandle}
                  reducedMotion={reducedMotion}
                  availableTargetColumns={availableTargetColumns}
                  onCardClick={onCardClick}
                  onMoveToColumn={onMoveToColumn}
                  renderCard={renderCard}
                />
              );
            })}
          </ul>
        )}
      </div>

      {renderColumnFooter && (
        <div className="border-t border-border/70 p-2.5">{renderColumnFooter(columnContext)}</div>
      )}
    </div>
  );
}

export function KanbanBoard<TCard, TColumn extends KanbanColumnDef = KanbanColumnDef>({
  columns,
  cards,
  getCardId,
  getCardColumnId,
  getCardLabel,
  renderCard,
  onCardMove,
  onCardClick,
  allowReorder = true,
  dragHandle = false,
  canDragCard,
  canDropCard,
  pendingCardIds,
  collapsedColumnIds,
  defaultCollapsedColumnIds,
  onCollapsedColumnIdsChange,
  renderColumnHeader,
  renderColumnFooter,
  renderEmptyColumn,
  renderDragOverlay,
  emptyState,
  isLoading = false,
  loadingColumnCount = 4,
  loadingCardsPerColumn = 3,
  ariaLabel = "Kanban board",
  className,
}: KanbanBoardProps<TCard, TColumn>) {
  const reducedMotion = usePrefersReducedMotion();

  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(defaultCollapsedColumnIds ?? []),
  );
  const resolvedCollapsed = collapsedColumnIds ?? uncontrolledCollapsed;

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Map<string, string[]> | null>(null);
  const [blockedTargetColumnId, setBlockedTargetColumnId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const dragSnapshotRef = useRef<{
    cardId: string;
    initialOrder: Map<string, string[]>;
  } | null>(null);
  const previewOrderRef = useRef<Map<string, string[]> | null>(null);

  const columnById = useMemo(() => {
    const map = new Map<string, TColumn>();
    for (const column of columns) {
      map.set(column.id, column);
    }
    return map;
  }, [columns]);

  const cardById = useMemo(() => {
    const map = new Map<string, TCard>();
    for (const card of cards) {
      map.set(getCardId(card), card);
    }
    return map;
  }, [cards, getCardId]);

  const controlledOrder = useMemo(
    () => buildOrderMap(columns, cards, getCardId, getCardColumnId),
    [columns, cards, getCardId, getCardColumnId],
  );

  const displayOrder = previewOrder ?? controlledOrder;

  const resolveCardLabel = useCallback(
    (card: TCard) => (getCardLabel ? getCardLabel(card) : getCardId(card)),
    [getCardId, getCardLabel],
  );

  const toggleCollapse = useCallback(
    (columnId: string) => {
      const next = new Set(resolvedCollapsed);
      const willCollapse = !next.has(columnId);
      if (willCollapse) {
        next.add(columnId);
      } else {
        next.delete(columnId);
      }
      if (collapsedColumnIds === undefined) {
        setUncontrolledCollapsed(next);
      }
      onCollapsedColumnIdsChange?.(next);

      const columnTitle = columnById.get(columnId)?.title ?? columnId;
      setAnnouncement(
        willCollapse ? `${columnTitle} column collapsed.` : `${columnTitle} column expanded.`,
      );
    },
    [collapsedColumnIds, columnById, onCollapsedColumnIdsChange, resolvedCollapsed],
  );

  const isMoveAllowed = useCallback(
    (event: KanbanMoveEvent): boolean => {
      if (!canDropCard) return true;
      const card = cardById.get(event.cardId);
      const targetColumn = columnById.get(event.toColumnId);
      if (!card || !targetColumn) return false;
      return canDropCard(event, card, targetColumn);
    },
    [canDropCard, cardById, columnById],
  );

  const handleProgrammaticMove = useCallback(
    (cardId: string, targetColumnId: string) => {
      const card = cardById.get(cardId);
      const targetColumn = columnById.get(targetColumnId);
      if (!card || !targetColumn) return;

      const event = buildKanbanMoveEvent(controlledOrder, {
        cardId,
        toColumnId: targetColumnId,
        allowReorder,
      });
      if (!event) return;

      if (!isMoveAllowed(event)) {
        setAnnouncement(`Could not move ${resolveCardLabel(card)} to ${targetColumn.title}.`);
        return;
      }

      onCardMove?.(event);
      setAnnouncement(`Moved ${resolveCardLabel(card)} to ${targetColumn.title}.`);
    },
    [
      allowReorder,
      cardById,
      columnById,
      controlledOrder,
      isMoveAllowed,
      onCardMove,
      resolveCardLabel,
    ],
  );

  const getAvailableTargetColumns = useCallback(
    (card: TCard, currentColumn: TColumn): readonly TColumn[] => {
      const cardId = getCardId(card);
      const isPending = pendingCardIds?.has(cardId) ?? false;
      const draggable = canDragCard ? canDragCard(card) : true;
      if (isPending || !draggable) return [];

      return columns.filter((targetColumn) => {
        if (targetColumn.id === currentColumn.id) return false;
        const candidate = buildKanbanMoveEvent(controlledOrder, {
          cardId,
          toColumnId: targetColumn.id,
          allowReorder,
        });
        if (!candidate) return false;
        return canDropCard ? canDropCard(candidate, card, targetColumn) : true;
      });
    },
    [allowReorder, canDragCard, canDropCard, columns, controlledOrder, getCardId, pendingCardIds],
  );

  const sensors = useMemo(
    () => [
      PointerSensor.configure({
        activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
        activatorElements: dragHandle ? undefined : (source) => [source.element ?? source.handle],
        preventActivation: (event) => isInteractiveDragExclusion(event.target),
      }),
      KeyboardSensor,
    ],
    [dragHandle],
  );

  if (isLoading) {
    return (
      <div
        data-slot="kanban-board"
        data-loading="true"
        aria-label={ariaLabel}
        aria-busy="true"
        className={cn("kanban-scroll flex gap-4 overflow-x-auto pb-2", className)}
      >
        {Array.from({ length: loadingColumnCount }, (_, colIdx) => (
          <div
            key={`loading-col-${colIdx}`}
            className="flex w-[min(85vw,19.5rem)] shrink-0 flex-col gap-3 border border-border bg-muted/35 p-3.5 sm:w-80"
          >
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-8" />
            </div>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: loadingCardsPerColumn }, (_, cardIdx) => (
                <div
                  key={`loading-card-${colIdx}-${cardIdx}`}
                  className="flex flex-col gap-2 border border-border bg-card p-3.5"
                >
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <div className="flex items-center justify-between pt-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div data-slot="kanban-board" aria-label={ariaLabel} className={className}>
        {emptyState ?? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Columns3Icon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No columns configured</EmptyTitle>
              <EmptyDescription>
                Add at least one column to organize cards on this board.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }

  const activeCard = activeCardId ? cardById.get(activeCardId) : undefined;
  const activeColumn = activeCard
    ? columnById.get(
        findCardLocation(displayOrder, getCardId(activeCard))?.columnId ??
          getCardColumnId(activeCard),
      )
    : undefined;

  return (
    <div data-slot="kanban-board" className={cn("relative min-w-0", className)}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <DragDropProvider
        sensors={sensors}
        onDragStart={(event) => {
          const sourceId = String(event.operation.source?.id ?? "");
          const card = cardById.get(sourceId);
          if (!card) return;

          const initial = new Map<string, string[]>();
          for (const [colId, ids] of controlledOrder) {
            initial.set(colId, [...ids]);
          }

          dragSnapshotRef.current = { cardId: sourceId, initialOrder: initial };
          previewOrderRef.current = initial;
          setActiveCardId(sourceId);
          setPreviewOrder(initial);
          setBlockedTargetColumnId(null);

          const startLocation = findCardLocation(initial, sourceId);
          const colTitle = startLocation
            ? columnById.get(startLocation.columnId)?.title
            : undefined;
          setAnnouncement(
            colTitle
              ? `Picked up ${resolveCardLabel(card)} from ${colTitle}.`
              : `Picked up ${resolveCardLabel(card)}.`,
          );
        }}
        onDragOver={(event) => {
          const snapshot = dragSnapshotRef.current;
          const currentPreview = previewOrderRef.current;
          if (!snapshot || !currentPreview) return;

          const { target } = event.operation;
          if (!target) {
            setBlockedTargetColumnId(null);
            return;
          }

          let targetColumnId: string | null = null;
          let targetIndex: number | undefined;

          if (isColumnDropData(target.data)) {
            targetColumnId = target.data.columnId;
            targetIndex = currentPreview.get(targetColumnId)?.length ?? 0;
          } else if (isSortableCardData(target.data)) {
            const targetCardId = target.data.cardId;
            if (targetCardId === snapshot.cardId) {
              setBlockedTargetColumnId(null);
              return;
            }
            const targetLoc = findCardLocation(currentPreview, targetCardId);
            if (targetLoc) {
              targetColumnId = targetLoc.columnId;
              targetIndex = targetLoc.index;
            } else {
              targetColumnId = target.data.columnId;
            }
          }

          if (!targetColumnId) return;

          const initialLoc = findCardLocation(snapshot.initialOrder, snapshot.cardId);
          if (!initialLoc) return;

          if (!allowReorder && targetColumnId === initialLoc.columnId) {
            setBlockedTargetColumnId(null);
            if (
              findCardLocation(currentPreview, snapshot.cardId)?.columnId !== initialLoc.columnId
            ) {
              previewOrderRef.current = snapshot.initialOrder;
              setPreviewOrder(snapshot.initialOrder);
            }
            return;
          }

          const candidateEvent = buildKanbanMoveEvent(snapshot.initialOrder, {
            cardId: snapshot.cardId,
            toColumnId: targetColumnId,
            toIndex: targetIndex,
            allowReorder,
          });

          if (candidateEvent && !isMoveAllowed(candidateEvent)) {
            setBlockedTargetColumnId(targetColumnId);
            return;
          }

          setBlockedTargetColumnId(null);

          const currentLoc = findCardLocation(currentPreview, snapshot.cardId);
          if (!currentLoc) return;

          const destinationIds = currentPreview.get(targetColumnId);
          if (!destinationIds) return;

          const resolvedIndex = !allowReorder
            ? destinationIds.filter((id) => id !== snapshot.cardId).length
            : (targetIndex ?? destinationIds.length);

          if (currentLoc.columnId === targetColumnId && currentLoc.index === resolvedIndex) {
            return;
          }

          const nextPreview = moveCardInOrderMap(currentPreview, {
            cardId: snapshot.cardId,
            fromColumnId: currentLoc.columnId,
            toColumnId: targetColumnId,
            toIndex: resolvedIndex,
          });

          previewOrderRef.current = nextPreview;
          setPreviewOrder(nextPreview);
        }}
        onDragEnd={(event) => {
          const snapshot = dragSnapshotRef.current;
          const finalPreview = previewOrderRef.current;
          const card = snapshot ? cardById.get(snapshot.cardId) : undefined;

          dragSnapshotRef.current = null;
          previewOrderRef.current = null;
          setActiveCardId(null);
          setPreviewOrder(null);
          setBlockedTargetColumnId(null);

          if (!snapshot || !card) return;

          if (event.canceled) {
            setAnnouncement(`Cancelled moving ${resolveCardLabel(card)}.`);
            return;
          }

          const initialLoc = findCardLocation(snapshot.initialOrder, snapshot.cardId);
          if (!initialLoc) return;

          let targetColumnId: string | null = null;
          let targetIndex: number | undefined;

          const previewLoc = finalPreview ? findCardLocation(finalPreview, snapshot.cardId) : null;

          if (
            previewLoc &&
            (previewLoc.columnId !== initialLoc.columnId || previewLoc.index !== initialLoc.index)
          ) {
            targetColumnId = previewLoc.columnId;
            targetIndex = previewLoc.index;
          } else if (event.operation.target) {
            const { target } = event.operation;
            if (isColumnDropData(target.data)) {
              targetColumnId = target.data.columnId;
            } else if (isSortableCardData(target.data)) {
              const targetLoc = findCardLocation(snapshot.initialOrder, target.data.cardId);
              targetColumnId = targetLoc?.columnId ?? target.data.columnId;
              targetIndex = targetLoc?.index;
            }
          }

          if (!targetColumnId) return;

          const moveEvent = buildKanbanMoveEvent(snapshot.initialOrder, {
            cardId: snapshot.cardId,
            toColumnId: targetColumnId,
            toIndex: targetIndex,
            allowReorder,
          });

          if (!moveEvent) return;

          const targetCol = columnById.get(moveEvent.toColumnId);
          if (!isMoveAllowed(moveEvent)) {
            setAnnouncement(
              `Could not move ${resolveCardLabel(card)} to ${targetCol?.title ?? moveEvent.toColumnId}.`,
            );
            return;
          }

          onCardMove?.(moveEvent);
          setAnnouncement(
            `Moved ${resolveCardLabel(card)} to ${targetCol?.title ?? moveEvent.toColumnId}.`,
          );
        }}
      >
        <div
          role="region"
          aria-label={ariaLabel}
          className="kanban-scroll flex snap-x snap-mandatory items-start gap-4 overflow-x-auto pb-2 sm:snap-none"
        >
          {columns.map((column) => {
            const ids = displayOrder.get(column.id) ?? [];
            const columnCards: TCard[] = [];
            for (const id of ids) {
              const card = cardById.get(id);
              if (card) columnCards.push(card);
            }

            return (
              <KanbanColumnView
                key={column.id}
                column={column}
                cards={columnCards}
                getCardId={getCardId}
                getCardLabel={resolveCardLabel}
                isCollapsed={resolvedCollapsed.has(column.id)}
                isBlockedDrop={blockedTargetColumnId === column.id}
                isDraggingAny={activeCardId !== null}
                dragHandle={dragHandle}
                reducedMotion={reducedMotion}
                pendingCardIds={pendingCardIds}
                canDragCard={canDragCard}
                getAvailableTargetColumns={getAvailableTargetColumns}
                onToggleCollapse={toggleCollapse}
                onCardClick={onCardClick}
                onMoveToColumn={handleProgrammaticMove}
                renderCard={renderCard}
                renderColumnHeader={renderColumnHeader}
                renderColumnFooter={renderColumnFooter}
                renderEmptyColumn={renderEmptyColumn}
              />
            );
          })}
        </div>

        <DragOverlay dropAnimation={reducedMotion ? null : { duration: 180, easing: "ease-out" }}>
          {activeCard && activeColumn ? (
            <div className="w-[min(85vw,18.25rem)] sm:w-[18.75rem]">
              {renderDragOverlay
                ? renderDragOverlay(activeCard, activeColumn)
                : renderCard({
                    card: activeCard,
                    column: activeColumn,
                    index: 0,
                    isDragging: false,
                    isOverlay: true,
                    isPending: pendingCardIds?.has(getCardId(activeCard)) ?? false,
                    canDrag: true,
                    dragHandleRef: () => {},
                    moveToColumn: () => {},
                    availableTargetColumns: [],
                  })}
            </div>
          ) : null}
        </DragOverlay>
      </DragDropProvider>
    </div>
  );
}
