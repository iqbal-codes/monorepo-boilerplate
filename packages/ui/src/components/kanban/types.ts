import type { ReactNode } from "react";

export type KanbanColumnDef = {
  id: string;
  title: string;
  description?: string;
  wipLimit?: number;
  collapsible?: boolean;
};

export type KanbanMoveEvent = {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  fromIndex: number;
  toIndex: number;
  beforeCardId: string | null;
  afterCardId: string | null;
};

export type KanbanCardRenderContext<TCard, TColumn extends KanbanColumnDef = KanbanColumnDef> = {
  card: TCard;
  column: TColumn;
  index: number;
  isDragging: boolean;
  isOverlay: boolean;
  isPending: boolean;
  canDrag: boolean;
  dragHandleRef: (element: Element | null) => void;
  moveToColumn: (targetColumnId: string) => void;
  availableTargetColumns: readonly TColumn[];
};

export type KanbanColumnRenderContext<TCard, TColumn extends KanbanColumnDef = KanbanColumnDef> = {
  column: TColumn;
  cards: readonly TCard[];
  count: number;
  isOverWipLimit: boolean;
  isCollapsed: boolean;
  toggleCollapse: () => void;
};

export type KanbanBoardProps<TCard, TColumn extends KanbanColumnDef = KanbanColumnDef> = {
  columns: readonly TColumn[];
  cards: readonly TCard[];
  getCardId: (card: TCard) => string;
  getCardColumnId: (card: TCard) => string;
  getCardLabel?: (card: TCard) => string;
  renderCard: (context: KanbanCardRenderContext<TCard, TColumn>) => ReactNode;
  onCardMove?: (event: KanbanMoveEvent) => void;
  onCardClick?: (card: TCard, column: TColumn) => void;
  /** When false, dragging within the same column is disabled and cross-column drops append. */
  allowReorder?: boolean;
  /** When true, only the element attached to `dragHandleRef` initiates dragging. */
  dragHandle?: boolean;
  canDragCard?: (card: TCard) => boolean;
  canDropCard?: (event: KanbanMoveEvent, card: TCard, targetColumn: TColumn) => boolean;
  pendingCardIds?: ReadonlySet<string>;
  collapsedColumnIds?: ReadonlySet<string>;
  defaultCollapsedColumnIds?: ReadonlySet<string>;
  onCollapsedColumnIdsChange?: (ids: ReadonlySet<string>) => void;
  renderColumnHeader?: (context: KanbanColumnRenderContext<TCard, TColumn>) => ReactNode;
  renderColumnFooter?: (context: KanbanColumnRenderContext<TCard, TColumn>) => ReactNode;
  renderEmptyColumn?: (column: TColumn) => ReactNode;
  renderDragOverlay?: (card: TCard, column: TColumn | undefined) => ReactNode;
  emptyState?: ReactNode;
  isLoading?: boolean;
  loadingColumnCount?: number;
  loadingCardsPerColumn?: number;
  ariaLabel?: string;
  className?: string;
};
