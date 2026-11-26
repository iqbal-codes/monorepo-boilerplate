import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KanbanBoard,
  KanbanCardDescription,
  KanbanCardMoveMenu,
  KanbanCardSurface,
  KanbanCardTitle,
  applyKanbanMove,
  buildKanbanMoveEvent,
  groupCardsByColumn,
  moveCardInOrderMap,
  type KanbanColumnDef,
} from "../src/components/kanban";

type TaskCard = {
  id: string;
  columnId: string;
  title: string;
};

const COLUMNS: KanbanColumnDef[] = [
  { id: "todo", title: "Todo" },
  { id: "doing", title: "In Progress", wipLimit: 2 },
  { id: "done", title: "Done" },
];

const CARDS: TaskCard[] = [
  { id: "c1", columnId: "todo", title: "First" },
  { id: "c2", columnId: "todo", title: "Second" },
  { id: "c3", columnId: "todo", title: "Third" },
  { id: "c4", columnId: "doing", title: "Fourth" },
  { id: "c5", columnId: "orphan-stage", title: "Unmatched" },
];

describe("groupCardsByColumn", () => {
  test("groups cards into declared columns and ignores unmatched columnIds", () => {
    const grouped = groupCardsByColumn(COLUMNS, CARDS, (card) => card.columnId);

    expect(grouped.get("todo")?.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(grouped.get("doing")?.map((c) => c.id)).toEqual(["c4"]);
    expect(grouped.get("done")?.map((c) => c.id)).toEqual([]);
    expect(grouped.has("orphan-stage")).toBe(false);
  });
});

describe("buildKanbanMoveEvent", () => {
  test("computes indices and neighbor IDs when reordering within the same column", () => {
    const order = new Map<string, string[]>([
      ["todo", ["c1", "c2", "c3"]],
      ["doing", ["c4"]],
      ["done", []],
    ]);

    const down = buildKanbanMoveEvent(order, {
      cardId: "c1",
      toColumnId: "todo",
      toIndex: 2,
      allowReorder: true,
    });
    expect(down).toEqual({
      cardId: "c1",
      fromColumnId: "todo",
      toColumnId: "todo",
      fromIndex: 0,
      toIndex: 2,
      beforeCardId: "c3",
      afterCardId: null,
    });

    const up = buildKanbanMoveEvent(order, {
      cardId: "c3",
      toColumnId: "todo",
      toIndex: 1,
      allowReorder: true,
    });
    expect(up).toEqual({
      cardId: "c3",
      fromColumnId: "todo",
      toColumnId: "todo",
      fromIndex: 2,
      toIndex: 1,
      beforeCardId: "c1",
      afterCardId: "c2",
    });
  });

  test("returns null for no-op moves or within-column moves when allowReorder is false", () => {
    const order = new Map<string, string[]>([
      ["todo", ["c1", "c2", "c3"]],
      ["doing", ["c4"]],
    ]);

    expect(
      buildKanbanMoveEvent(order, {
        cardId: "c2",
        toColumnId: "todo",
        toIndex: 1,
        allowReorder: true,
      }),
    ).toBeNull();

    expect(
      buildKanbanMoveEvent(order, {
        cardId: "c1",
        toColumnId: "todo",
        toIndex: 2,
        allowReorder: false,
      }),
    ).toBeNull();
  });

  test("appends cross-column moves to end when allowReorder is false and computes neighbors", () => {
    const order = new Map<string, string[]>([
      ["todo", ["c1", "c2"]],
      ["doing", ["c4"]],
      ["done", []],
    ]);

    const intoNonEmpty = buildKanbanMoveEvent(order, {
      cardId: "c1",
      toColumnId: "doing",
      toIndex: 0,
      allowReorder: false,
    });
    expect(intoNonEmpty).toEqual({
      cardId: "c1",
      fromColumnId: "todo",
      toColumnId: "doing",
      fromIndex: 0,
      toIndex: 1,
      beforeCardId: "c4",
      afterCardId: null,
    });

    const intoEmpty = buildKanbanMoveEvent(order, {
      cardId: "c1",
      toColumnId: "done",
      toIndex: 0,
      allowReorder: true,
    });
    expect(intoEmpty).toEqual({
      cardId: "c1",
      fromColumnId: "todo",
      toColumnId: "done",
      fromIndex: 0,
      toIndex: 0,
      beforeCardId: null,
      afterCardId: null,
    });
  });
});

describe("applyKanbanMove", () => {
  test("moves a card across columns to an exact position while preserving untouched cards", () => {
    const base: TaskCard[] = [
      { id: "c1", columnId: "todo", title: "First" },
      { id: "c2", columnId: "todo", title: "Second" },
      { id: "c3", columnId: "doing", title: "Third" },
      { id: "c4", columnId: "doing", title: "Fourth" },
      { id: "c5", columnId: "orphan-stage", title: "Unmatched" },
    ];

    const event = {
      cardId: "c1",
      fromColumnId: "todo",
      toColumnId: "doing",
      fromIndex: 0,
      toIndex: 1,
      beforeCardId: "c3",
      afterCardId: "c4",
    };

    const next = applyKanbanMove(base, event, {
      getCardId: (c) => c.id,
      getCardColumnId: (c) => c.columnId,
      setCardColumnId: (c, columnId) => ({ ...c, columnId }),
    });

    const grouped = groupCardsByColumn(COLUMNS, next, (c) => c.columnId);
    expect(grouped.get("todo")?.map((c) => c.id)).toEqual(["c2"]);
    expect(grouped.get("doing")?.map((c) => c.id)).toEqual(["c3", "c1", "c4"]);
    expect(next.find((c) => c.id === "c5")?.columnId).toBe("orphan-stage");
  });

  test("reorders within the same column and updates order map immutably", () => {
    const base: TaskCard[] = [
      { id: "c1", columnId: "todo", title: "First" },
      { id: "c2", columnId: "todo", title: "Second" },
      { id: "c3", columnId: "todo", title: "Third" },
    ];

    const event = {
      cardId: "c3",
      fromColumnId: "todo",
      toColumnId: "todo",
      fromIndex: 2,
      toIndex: 0,
      beforeCardId: null,
      afterCardId: "c1",
    };

    const next = applyKanbanMove(base, event, {
      getCardId: (c) => c.id,
      getCardColumnId: (c) => c.columnId,
      setCardColumnId: (c, columnId) => ({ ...c, columnId }),
    });
    expect(next.map((c) => c.id)).toEqual(["c3", "c1", "c2"]);

    const orderMap = new Map([["todo", ["c1", "c2", "c3"]]]);
    const nextMap = moveCardInOrderMap(orderMap, event);
    expect(nextMap.get("todo")).toEqual(["c3", "c1", "c2"]);
    expect(orderMap.get("todo")).toEqual(["c1", "c2", "c3"]);
  });
});

describe("KanbanBoard", () => {
  test("renders columns, cards, live region, and ignores unmatched cards", () => {
    const html = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={CARDS}
        getCardId={(card) => card.id}
        getCardColumnId={(card) => card.columnId}
        getCardLabel={(card) => card.title}
        renderCard={({ card }) => (
          <KanbanCardSurface>
            <KanbanCardTitle>{card.title}</KanbanCardTitle>
            <KanbanCardDescription>Details for {card.title}</KanbanCardDescription>
          </KanbanCardSurface>
        )}
      />,
    );

    expect(html).toContain('data-slot="kanban-board"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Todo");
    expect(html).toContain("In Progress");
    expect(html).toContain("Done");
    expect(html).toContain("First");
    expect(html).toContain("Fourth");
    expect(html).not.toContain("Unmatched");
  });

  test("column card wrapper scopes overscroll containment to vertical axis so horizontal scrolling chains to the board", () => {
    const html = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={CARDS}
        getCardId={(card) => card.id}
        getCardColumnId={(card) => card.columnId}
        renderCard={({ card }) => <KanbanCardSurface>{card.title}</KanbanCardSurface>}
      />,
    );

    expect(html).toContain("overflow-x-clip overflow-y-auto overscroll-y-contain");
    expect(html).not.toContain("overscroll-contain");
  });

  test("marks a column exceeding its WIP limit with an accessible text cue", () => {
    const overloadedCards: TaskCard[] = [
      { id: "c1", columnId: "doing", title: "A" },
      { id: "c2", columnId: "doing", title: "B" },
      { id: "c3", columnId: "doing", title: "C" },
    ];

    const html = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={overloadedCards}
        getCardId={(card) => card.id}
        getCardColumnId={(card) => card.columnId}
        renderCard={({ card }) => <KanbanCardSurface>{card.title}</KanbanCardSurface>}
      />,
    );

    expect(html).toContain('data-over-wip="true"');
    expect(html).toContain("3 / 2");
  });

  test("renders collapsed columns with expand controls and preserves drop target", () => {
    const html = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={CARDS}
        getCardId={(card) => card.id}
        getCardColumnId={(card) => card.columnId}
        collapsedColumnIds={new Set(["done"])}
        renderCard={({ card }) => <KanbanCardSurface>{card.title}</KanbanCardSurface>}
      />,
    );

    expect(html).toContain('data-collapsed="true"');
    expect(html).toContain('aria-label="Expand Done column"');
    expect(html).toContain('aria-expanded="false"');
  });

  test("renders loading skeletons, empty board, and custom empty column slots", () => {
    const loadingHtml = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={[]}
        isLoading
        loadingColumnCount={3}
        loadingCardsPerColumn={2}
        getCardId={(card: TaskCard) => card.id}
        getCardColumnId={(card: TaskCard) => card.columnId}
        renderCard={({ card }) => <KanbanCardSurface>{card.title}</KanbanCardSurface>}
      />,
    );
    expect(loadingHtml).toContain('data-slot="skeleton"');

    const emptyBoardHtml = renderToStaticMarkup(
      <KanbanBoard
        columns={[]}
        cards={[]}
        getCardId={(card: TaskCard) => card.id}
        getCardColumnId={(card: TaskCard) => card.columnId}
        renderCard={({ card }) => <KanbanCardSurface>{card.title}</KanbanCardSurface>}
        emptyState={<div>No stages configured</div>}
      />,
    );
    expect(emptyBoardHtml).toContain("No stages configured");

    const emptyColumnHtml = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={[]}
        getCardId={(card: TaskCard) => card.id}
        getCardColumnId={(card: TaskCard) => card.columnId}
        renderCard={({ card }) => <KanbanCardSurface>{card.title}</KanbanCardSurface>}
        renderEmptyColumn={(column) => <div>Empty {column.title}</div>}
      />,
    );
    expect(emptyColumnHtml).toContain("Empty Done");
  });

  test("marks pending cards and filters availableTargetColumns via canDropCard", () => {
    let targetsForPending: string[] = [];
    let targetsForActive: string[] = [];

    const html = renderToStaticMarkup(
      <KanbanBoard
        columns={COLUMNS}
        cards={CARDS}
        getCardId={(card) => card.id}
        getCardColumnId={(card) => card.columnId}
        getCardLabel={(card) => card.title}
        pendingCardIds={new Set(["c1"])}
        canDropCard={(event) => !(event.fromColumnId === "todo" && event.toColumnId === "done")}
        renderCard={({ card, isPending, availableTargetColumns, moveToColumn }) => {
          if (card.id === "c1") {
            targetsForPending = availableTargetColumns.map((col) => col.id);
          }
          if (card.id === "c2") {
            targetsForActive = availableTargetColumns.map((col) => col.id);
          }
          return (
            <KanbanCardSurface isPending={isPending}>
              <KanbanCardTitle>{card.title}</KanbanCardTitle>
              <KanbanCardMoveMenu
                cardLabel={card.title}
                columns={availableTargetColumns}
                onSelectColumn={moveToColumn}
              />
            </KanbanCardSurface>
          );
        }}
      />,
    );

    expect(targetsForPending).toEqual([]);
    expect(targetsForActive).toEqual(["doing"]);
    expect(html).toContain('data-pending="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Move Second to another column"');
    expect(html).toContain('aria-label="Reorder Second"');
    expect(html).not.toContain('role="button"');
  });

  test("mounted DOM keeps card list items free of role=button after dnd-kit effects and toggles column collapse", async () => {
    const win = new Window({ url: "http://localhost/" });
    const domKeys = [
      "window",
      "document",
      "Document",
      "ShadowRoot",
      "HTMLElement",
      "Element",
      "Node",
      "Event",
      "MouseEvent",
      "PointerEvent",
      "KeyboardEvent",
      "MutationObserver",
      "navigator",
      "getComputedStyle",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "IS_REACT_ACT_ENVIRONMENT",
    ] as const;

    const prevGlobals = Object.fromEntries(
      domKeys.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
    );

    Object.assign(globalThis, {
      window: win,
      document: win.document,
      Document: win.Document,
      ShadowRoot: win.ShadowRoot,
      HTMLElement: win.HTMLElement,
      Element: win.Element,
      Node: win.Node,
      Event: win.Event,
      MouseEvent: win.MouseEvent,
      PointerEvent: win.PointerEvent,
      KeyboardEvent: win.KeyboardEvent,
      MutationObserver: win.MutationObserver,
      navigator: win.navigator,
      getComputedStyle: win.getComputedStyle.bind(win),
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
      IS_REACT_ACT_ENVIRONMENT: true,
    });

    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <KanbanBoard
            columns={COLUMNS}
            cards={CARDS}
            getCardId={(card) => card.id}
            getCardColumnId={(card) => card.columnId}
            getCardLabel={(card) => card.title}
            onCardClick={() => {}}
            renderCard={({ card, availableTargetColumns, moveToColumn }) => (
              <KanbanCardSurface>
                <KanbanCardTitle>{card.title}</KanbanCardTitle>
                <KanbanCardMoveMenu
                  cardLabel={card.title}
                  columns={availableTargetColumns}
                  onSelectColumn={moveToColumn}
                />
              </KanbanCardSurface>
            )}
          />,
        );
        await new Promise((resolve) => setTimeout(resolve, 25));
      });

      const cardItem = container.querySelector('[data-slot="kanban-card-item"][data-card-id="c1"]');
      const keyboardHandle = cardItem?.querySelector('[data-slot="kanban-keyboard-handle"]');
      expect(cardItem?.getAttribute("role")).toBeNull();
      expect(cardItem?.getAttribute("tabindex")).toBeNull();
      expect(keyboardHandle?.getAttribute("aria-roledescription")).toBe("draggable");

      const collapseTodo = container.querySelector(
        '[data-column-id="todo"] [data-slot="kanban-column-collapse"]',
      ) as HTMLButtonElement | null;
      expect(collapseTodo).not.toBeNull();

      await act(async () => {
        collapseTodo?.click();
      });

      const collapsedTodo = container.querySelector('[data-column-id="todo"]');
      expect(collapsedTodo?.getAttribute("data-collapsed")).toBe("true");
      expect(
        collapsedTodo
          ?.querySelector('[data-slot="kanban-column-expand"]')
          ?.getAttribute("aria-label"),
      ).toBe("Expand Todo column");
    } finally {
      await act(async () => {
        root.unmount();
      });
      await win.close();
      Object.assign(globalThis, prevGlobals);
    }
  });
});
