import type { KanbanColumnDef, KanbanMoveEvent } from "./types";

export function groupCardsByColumn<TCard, TColumn extends KanbanColumnDef = KanbanColumnDef>(
  columns: readonly TColumn[],
  cards: readonly TCard[],
  getCardColumnId: (card: TCard) => string,
): Map<string, TCard[]> {
  const map = new Map<string, TCard[]>();
  for (const column of columns) {
    map.set(column.id, []);
  }
  for (const card of cards) {
    const bucket = map.get(getCardColumnId(card));
    if (bucket) {
      bucket.push(card);
    }
  }
  return map;
}

export function buildOrderMap<TCard, TColumn extends KanbanColumnDef = KanbanColumnDef>(
  columns: readonly TColumn[],
  cards: readonly TCard[],
  getCardId: (card: TCard) => string,
  getCardColumnId: (card: TCard) => string,
): Map<string, string[]> {
  const grouped = groupCardsByColumn(columns, cards, getCardColumnId);
  const orderMap = new Map<string, string[]>();
  for (const [columnId, columnCards] of grouped) {
    orderMap.set(
      columnId,
      columnCards.map((card) => getCardId(card)),
    );
  }
  return orderMap;
}

export function findCardLocation(
  orderMap: ReadonlyMap<string, readonly string[]>,
  cardId: string,
): { columnId: string; index: number } | null {
  for (const [columnId, ids] of orderMap) {
    const index = ids.indexOf(cardId);
    if (index !== -1) {
      return { columnId, index };
    }
  }
  return null;
}

export function buildKanbanMoveEvent(
  orderMap: ReadonlyMap<string, readonly string[]>,
  input: {
    cardId: string;
    toColumnId: string;
    toIndex?: number;
    allowReorder?: boolean;
  },
): KanbanMoveEvent | null {
  const { cardId, toColumnId, allowReorder = true } = input;
  const targetColumn = orderMap.get(toColumnId);
  if (!targetColumn) return null;

  const location = findCardLocation(orderMap, cardId);
  if (!location) return null;

  const { columnId: fromColumnId, index: fromIndex } = location;

  if (fromColumnId === toColumnId) {
    if (!allowReorder) return null;

    const remaining = targetColumn.filter((id) => id !== cardId);
    const requestedIndex = input.toIndex ?? remaining.length;
    const clampedIndex = Math.max(0, Math.min(requestedIndex, remaining.length));

    if (clampedIndex === fromIndex) return null;

    return {
      cardId,
      fromColumnId,
      toColumnId,
      fromIndex,
      toIndex: clampedIndex,
      beforeCardId: clampedIndex > 0 ? (remaining[clampedIndex - 1] ?? null) : null,
      afterCardId: clampedIndex < remaining.length ? (remaining[clampedIndex] ?? null) : null,
    };
  }

  const remainingTarget = targetColumn.filter((id) => id !== cardId);
  const requestedIndex = !allowReorder
    ? remainingTarget.length
    : (input.toIndex ?? remainingTarget.length);
  const clampedIndex = Math.max(0, Math.min(requestedIndex, remainingTarget.length));

  return {
    cardId,
    fromColumnId,
    toColumnId,
    fromIndex,
    toIndex: clampedIndex,
    beforeCardId: clampedIndex > 0 ? (remainingTarget[clampedIndex - 1] ?? null) : null,
    afterCardId:
      clampedIndex < remainingTarget.length ? (remainingTarget[clampedIndex] ?? null) : null,
  };
}

export function moveCardInOrderMap(
  orderMap: ReadonlyMap<string, readonly string[]>,
  event: Pick<KanbanMoveEvent, "cardId" | "fromColumnId" | "toColumnId" | "toIndex">,
): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const [columnId, ids] of orderMap) {
    next.set(columnId, [...ids]);
  }

  const source = next.get(event.fromColumnId);
  const target = next.get(event.toColumnId);
  if (!source || !target) return next;

  const currentIdx = source.indexOf(event.cardId);
  if (currentIdx === -1) return next;

  source.splice(currentIdx, 1);

  const destination = event.fromColumnId === event.toColumnId ? source : target;
  const clampedIndex = Math.max(0, Math.min(event.toIndex, destination.length));
  destination.splice(clampedIndex, 0, event.cardId);

  return next;
}

export function applyKanbanMove<TCard>(
  cards: readonly TCard[],
  event: KanbanMoveEvent,
  options: {
    getCardId: (card: TCard) => string;
    getCardColumnId: (card: TCard) => string;
    setCardColumnId: (card: TCard, columnId: string) => TCard;
  },
): TCard[] {
  const { getCardId, getCardColumnId, setCardColumnId } = options;

  let movedCard: TCard | undefined;
  const withoutMoved: TCard[] = [];
  for (const card of cards) {
    if (getCardId(card) === event.cardId) {
      movedCard = card;
    } else {
      withoutMoved.push(card);
    }
  }

  if (!movedCard) return [...cards];

  const updatedCard =
    getCardColumnId(movedCard) === event.toColumnId
      ? movedCard
      : setCardColumnId(movedCard, event.toColumnId);

  const targetIndices: number[] = [];
  for (let i = 0; i < withoutMoved.length; i += 1) {
    const card = withoutMoved[i];
    if (card !== undefined && getCardColumnId(card) === event.toColumnId) {
      targetIndices.push(i);
    }
  }

  const clampedIndex = Math.max(0, Math.min(event.toIndex, targetIndices.length));

  if (targetIndices.length === 0) {
    return [...withoutMoved, updatedCard];
  }

  const insertAt =
    clampedIndex < targetIndices.length
      ? (targetIndices[clampedIndex] ?? withoutMoved.length)
      : (targetIndices[targetIndices.length - 1] ?? withoutMoved.length - 1) + 1;

  const result = [...withoutMoved];
  result.splice(insertAt, 0, updatedCard);
  return result;
}
