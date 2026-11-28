import { afterAll, describe, expect, mock, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CalendarEvent, CalendarViewMode } from "../src/components/calendar-view";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/popover", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
win.HTMLElement.prototype.scrollIntoView ??= () => {};

const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "HTMLDivElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "MutationObserver",
  "ResizeObserver",
  "matchMedia",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

const previousGlobals = Object.fromEntries(
  DOM_KEYS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
);

let currentWidth = 1024;
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

function setViewportWidth(width: number) {
  currentWidth = width;
  Object.defineProperty(win, "innerWidth", { value: width, configurable: true, writable: true });
  const matches = width < 768;
  const event = { matches, media: "(max-width: 767px)" } as MediaQueryListEvent;
  for (const listener of mediaListeners) {
    listener(event);
  }
}

const mockMatchMedia = (query: string): MediaQueryList => {
  const isMax767 = query.includes("max-width: 767px");
  const matches = isMax767 ? currentWidth < 768 : false;
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
      if (typeof cb === "function") {
        mediaListeners.add(cb as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (_type: string, cb: EventListenerOrEventListenerObject) => {
      if (typeof cb === "function") {
        mediaListeners.delete(cb as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  };
};

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  ShadowRoot: win.ShadowRoot,
  HTMLElement: win.HTMLElement,
  HTMLDivElement: win.HTMLDivElement,
  HTMLButtonElement: win.HTMLButtonElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  PointerEvent: win.PointerEvent,
  KeyboardEvent: win.KeyboardEvent,
  MutationObserver: win.MutationObserver,
  ResizeObserver: MockResizeObserver,
  matchMedia: mockMatchMedia,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

win.matchMedia = mockMatchMedia;
setViewportWidth(1024);

const { createRoot } = await import("react-dom/client");
const {
  CalendarView,
  getCalendarDateRange,
  getEventsForDay,
  navigateCalendarDate,
  parseCalendarDate,
} = await import("../src/components/calendar-view");

afterAll(() => {
  for (const key of DOM_KEYS) {
    (globalThis as Record<string, unknown>)[key] = previousGlobals[key];
  }
  win.close();
});

async function renderInDom(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    host,
    rerender: async (next: React.ReactNode) => {
      await act(async () => {
        root.render(next);
      });
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

const SAMPLE_EVENTS: CalendarEvent[] = [
  {
    id: "evt-1",
    title: "Design Sync",
    start: "2026-11-10T09:00:00",
    end: "2026-11-10T10:00:00",
    tone: "info",
    location: "Room 4A",
    category: "Product",
    description: "Review calendar and tree blocks.",
  },
  {
    id: "evt-2",
    title: "Customer Onboarding",
    start: "2026-11-10T11:30:00",
    end: "2026-11-10T12:30:00",
    tone: "success",
    category: "CS",
  },
  {
    id: "evt-3",
    title: "Security Audit",
    start: "2026-11-10T14:00:00",
    end: "2026-11-10T15:00:00",
    tone: "warning",
  },
  {
    id: "evt-4",
    title: "Release Freeze",
    start: "2026-11-10",
    allDay: true,
    tone: "danger",
  },
  {
    id: "evt-5",
    title: "Sprint Retro",
    start: "2026-11-12T16:00:00",
    end: "2026-11-12T17:00:00",
  },
];

describe("CalendarView subpath isolation & immutability (TC-03)", () => {
  test("packages/ui/package.json exposes ./components/calendar-view subpath export", () => {
    const pkgPath = resolve(import.meta.dir, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      exports?: Record<string, string>;
    };
    expect(pkg.exports?.["./components/calendar-view"]).toBe(
      "./src/components/calendar-view/index.ts",
    );
  });

  test("calendar-view stays isolated from unrelated bundles and router/query libs", async () => {
    const calDir = resolve(import.meta.dir, "../src/components/calendar-view");
    const uiSrcDir = resolve(import.meta.dir, "../src");

    function walk(dir: string): string[] {
      const files: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          files.push(...walk(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
          files.push(full);
        }
      }
      return files;
    }

    for (const file of walk(calDir)) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain("@tanstack/react-router");
      expect(content).not.toContain("@tanstack/react-virtual");
      expect(content).not.toMatch(/emerald-|amber-|sky-|blue-/);
    }

    const result = await Bun.build({
      entrypoints: [resolve(uiSrcDir, "components/form/index.ts")],
      write: false,
      external: [
        "react",
        "react-dom",
        "@tanstack/react-form",
        "@base-ui/react",
        "lucide-react",
        "cn",
        "libphonenumber-js",
        "date-fns",
        "react-day-picker",
        "input-otp",
      ],
    });
    expect(result.success).toBe(true);
    const bundledCode = await result.outputs[0]!.text();
    expect(bundledCode).not.toContain("calendar-view");
  });

  test("pure helpers parse YYYY-MM-DD locally without mutating caller events or dates", () => {
    const parsed = parseCalendarDate("2026-11-10");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(10);
    expect(parsed.getDate()).toBe(10);

    const frozenEvents = Object.freeze(SAMPLE_EVENTS.map((evt) => Object.freeze({ ...evt })));
    const dayEvents = getEventsForDay(frozenEvents, new Date(2026, 10, 10));
    expect(dayEvents).toHaveLength(4);
    expect(dayEvents[0]!.id).toBe("evt-4"); // all-day first

    const baseDate = new Date(2026, 10, 10);
    const nextMonth = navigateCalendarDate(baseDate, "month", "next");
    expect(baseDate.getMonth()).toBe(10);
    expect(nextMonth.getMonth()).toBe(11);

    const weekRange = getCalendarDateRange(baseDate, "week", 0);
    expect(weekRange.start.getDay()).toBe(0);
    expect(weekRange.end.getDay()).toBe(6);
  });
});

describe("CalendarView layouts, states, and callbacks (TC-01, TC-03)", () => {
  test("renders Month, Week, Day, and Agenda views with loading and empty states", () => {
    const monthHtml = renderToStaticMarkup(
      <CalendarView
        events={SAMPLE_EVENTS}
        date={new Date(2026, 10, 10)}
        today={new Date(2026, 10, 10)}
        view="month"
        maxEventsPerDay={2}
      />,
    );
    expect(monthHtml).toContain('data-slot="calendar-view"');
    expect(monthHtml).toContain('data-view="month"');
    expect(monthHtml).toContain("November 2026");
    expect(monthHtml).toContain("+2 more");

    const weekHtml = renderToStaticMarkup(
      <CalendarView
        events={SAMPLE_EVENTS}
        date={new Date(2026, 10, 10)}
        today={new Date(2026, 10, 10)}
        view="week"
      />,
    );
    expect(weekHtml).toContain('data-view="week"');
    expect(weekHtml).toContain("Design Sync");

    const dayHtml = renderToStaticMarkup(
      <CalendarView
        events={SAMPLE_EVENTS}
        date={new Date(2026, 10, 10)}
        today={new Date(2026, 10, 10)}
        view="day"
      />,
    );
    expect(dayHtml).toContain('data-view="day"');
    expect(dayHtml).toContain("Security Audit");

    const agendaHtml = renderToStaticMarkup(
      <CalendarView
        events={[]}
        date={new Date(2026, 10, 10)}
        today={new Date(2026, 10, 10)}
        view="agenda"
      />,
    );
    expect(agendaHtml).toContain('data-view="agenda"');
    expect(agendaHtml).toContain('data-slot="calendar-empty"');

    const loadingHtml = renderToStaticMarkup(
      <CalendarView events={SAMPLE_EVENTS} date={new Date(2026, 10, 10)} view="month" isLoading />,
    );
    expect(loadingHtml).toContain('data-slot="calendar-loading-overlay"');
    expect(loadingHtml).toContain('aria-busy="true"');
  });

  test("switches views, navigates Prev/Today/Next, and triggers onSlotClick, onEventClick, and +N more popover", async () => {
    setViewportWidth(1024);
    const clickedEvents: string[] = [];
    const clickedSlots: Array<{ allDay: boolean; view: CalendarViewMode }> = [];

    function Harness() {
      const [date, setDate] = React.useState(new Date(2026, 10, 10));
      const [view, setView] = React.useState<CalendarViewMode>("month");
      return (
        <CalendarView
          events={SAMPLE_EVENTS}
          date={date}
          today={new Date(2026, 10, 10)}
          onDateChange={setDate}
          view={view}
          onViewChange={setView}
          maxEventsPerDay={2}
          onEventClick={(evt) => clickedEvents.push(evt.id)}
          onSlotClick={(slot) => clickedSlots.push({ allDay: slot.allDay, view: slot.view })}
        />
      );
    }

    const view = await renderInDom(<Harness />);
    try {
      const rootEl = view.host.querySelector<HTMLElement>('[data-slot="calendar-view"]')!;
      expect(rootEl.getAttribute("data-view")).toBe("month");

      // Navigate Next month -> December 2026
      const nextBtn = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="calendar-nav-next"]',
      )!;
      await act(async () => {
        nextBtn.click();
      });
      expect(view.host.textContent).toContain("December 2026");
      expect(view.host.querySelector('[data-slot="calendar-empty-range"]')).not.toBeNull();

      // Navigate Today -> November 2026
      const todayBtn = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="calendar-nav-today"]',
      )!;
      await act(async () => {
        todayBtn.click();
      });
      expect(view.host.textContent).toContain("November 2026");

      // Click +2 more overflow trigger to open overflow popover
      const overflowBtn = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="calendar-overflow-trigger"]',
      )!;
      expect(overflowBtn.textContent).toContain("+2 more");
      await act(async () => {
        overflowBtn.click();
      });
      expect(document.body.querySelector('[data-slot="calendar-overflow-popover"]')).not.toBeNull();

      // Click an event -> fires onEventClick and opens event popover
      const eventBtn = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="calendar-event-trigger"][data-event-id="evt-1"]',
      )!;
      await act(async () => {
        eventBtn.click();
      });
      expect(clickedEvents).toContain("evt-1");
      expect(document.body.querySelector('[data-slot="calendar-event-popover"]')).not.toBeNull();

      // Click a day slot -> fires onSlotClick
      const slotBtn = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="calendar-day-slot"]',
      )!;
      await act(async () => {
        slotBtn.click();
      });
      expect(clickedSlots.at(-1)).toEqual({ allDay: true, view: "month" });

      // Switch to Week view via view switcher
      const weekToggle = view.host.querySelector<HTMLButtonElement>(
        '[data-slot="calendar-view-switch"][data-view-option="week"]',
      )!;
      await act(async () => {
        weekToggle.click();
      });
      expect(rootEl.getAttribute("data-view")).toBe("week");
    } finally {
      await view.cleanup();
    }
  });

  test("falls back to narrow Agenda layout below md (< 768px)", async () => {
    setViewportWidth(320);

    const view = await renderInDom(
      <CalendarView
        events={SAMPLE_EVENTS}
        date={new Date(2026, 10, 10)}
        today={new Date(2026, 10, 10)}
        view="month"
      />,
    );

    try {
      const rootEl = view.host.querySelector<HTMLElement>('[data-slot="calendar-view"]')!;
      expect(rootEl.getAttribute("data-effective-view")).toBe("agenda");
      expect(view.host.querySelector('[data-slot="calendar-agenda"]')).not.toBeNull();
    } finally {
      await view.cleanup();
      setViewportWidth(1024);
    }
  });
});
