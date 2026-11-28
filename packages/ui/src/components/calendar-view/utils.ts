import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

import type { CalendarEvent, CalendarViewMode } from "./types";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a `"YYYY-MM-DD"` date as local midnight without UTC offset drift, or
 * clones a `Date` / ISO-8601 datetime string into a fresh `Date` instance.
 */
export function parseCalendarDate(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const trimmed = value.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function resolveEventBounds<TMeta>(event: CalendarEvent<TMeta>): {
  start: Date;
  end: Date;
  allDay: boolean;
} {
  const start = parseCalendarDate(event.start);
  const allDay =
    event.allDay ?? (typeof event.start === "string" && ISO_DATE_RE.test(event.start.trim()));
  const rawEnd = event.end !== undefined ? parseCalendarDate(event.end) : new Date(start.getTime());
  const end = rawEnd.getTime() < start.getTime() ? new Date(start.getTime()) : rawEnd;
  return { start, end, allDay };
}

export function getCalendarDateRange(
  date: Date,
  view: CalendarViewMode,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0,
  agendaDays?: number,
): { start: Date; end: Date } {
  switch (view) {
    case "month": {
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      return {
        start: startOfWeek(monthStart, { weekStartsOn }),
        end: endOfWeek(monthEnd, { weekStartsOn }),
      };
    }
    case "week":
      return {
        start: startOfWeek(date, { weekStartsOn }),
        end: endOfWeek(date, { weekStartsOn }),
      };
    case "day":
      return {
        start: startOfDay(date),
        end: endOfDay(date),
      };
    case "agenda": {
      if (agendaDays !== undefined && agendaDays > 0) {
        const start = startOfDay(date);
        return {
          start,
          end: endOfDay(addDays(start, agendaDays - 1)),
        };
      }
      return {
        start: startOfMonth(date),
        end: endOfMonth(date),
      };
    }
  }
}

export function navigateCalendarDate(
  date: Date,
  view: CalendarViewMode,
  direction: "prev" | "next" | "today",
  today: Date = new Date(),
  agendaDays?: number,
): Date {
  if (direction === "today") {
    return new Date(today.getTime());
  }
  const delta = direction === "next" ? 1 : -1;
  switch (view) {
    case "month":
      return delta > 0 ? addMonths(date, 1) : subMonths(date, 1);
    case "week":
      return delta > 0 ? addWeeks(date, 1) : subWeeks(date, 1);
    case "day":
      return delta > 0 ? addDays(date, 1) : subDays(date, 1);
    case "agenda":
      if (agendaDays !== undefined && agendaDays > 0) {
        return delta > 0 ? addDays(date, agendaDays) : subDays(date, agendaDays);
      }
      return delta > 0 ? addMonths(date, 1) : subMonths(date, 1);
  }
}

export function getMonthGridDays(date: Date, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0): Date[] {
  const { start, end } = getCalendarDateRange(date, "month", weekStartsOn);
  return eachDayOfInterval({ start, end });
}

export function getWeekDays(date: Date, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0): Date[] {
  const { start, end } = getCalendarDateRange(date, "week", weekStartsOn);
  return eachDayOfInterval({ start, end });
}

function eventOverlapsInterval<TMeta>(
  event: CalendarEvent<TMeta>,
  intervalStart: Date,
  intervalEnd: Date,
): boolean {
  const { start, end, allDay } = resolveEventBounds(event);
  const effectiveEnd = allDay ? endOfDay(end) : end;
  return (
    start.getTime() <= intervalEnd.getTime() && effectiveEnd.getTime() >= intervalStart.getTime()
  );
}

function compareEvents<TMeta>(a: CalendarEvent<TMeta>, b: CalendarEvent<TMeta>): number {
  const boundsA = resolveEventBounds(a);
  const boundsB = resolveEventBounds(b);
  if (boundsA.allDay !== boundsB.allDay) {
    return boundsA.allDay ? -1 : 1;
  }
  const timeDiff = boundsA.start.getTime() - boundsB.start.getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.title.localeCompare(b.title);
}

export function getEventsForDay<TMeta>(
  events: readonly CalendarEvent<TMeta>[],
  day: Date,
): CalendarEvent<TMeta>[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return events
    .filter((event) => eventOverlapsInterval(event, dayStart, dayEnd))
    .sort(compareEvents);
}

export function getEventsInRange<TMeta>(
  events: readonly CalendarEvent<TMeta>[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent<TMeta>[] {
  return events
    .filter((event) => eventOverlapsInterval(event, rangeStart, rangeEnd))
    .sort(compareEvents);
}

export function formatCalendarRangeLabel(
  date: Date,
  view: CalendarViewMode,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0,
  agendaDays?: number,
): string {
  switch (view) {
    case "month":
      return format(date, "MMMM yyyy");
    case "week": {
      const { start, end } = getCalendarDateRange(date, "week", weekStartsOn);
      if (start.getMonth() === end.getMonth()) {
        return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
      }
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
      }
      return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
    }
    case "day":
      return format(date, "EEEE, MMM d, yyyy");
    case "agenda": {
      if (agendaDays !== undefined && agendaDays > 0) {
        const { start, end } = getCalendarDateRange(date, "agenda", weekStartsOn, agendaDays);
        return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
      }
      return format(date, "MMMM yyyy");
    }
  }
}

export function formatEventTimeRange<TMeta>(event: CalendarEvent<TMeta>): string {
  const { start, end, allDay } = resolveEventBounds(event);
  if (allDay) {
    return isSameDay(start, end)
      ? "All day"
      : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
  }
  if (isSameDay(start, end)) {
    return `${format(start, "p")} – ${format(end, "p")}`;
  }
  return `${format(start, "MMM d, p")} – ${format(end, "MMM d, p")}`;
}
