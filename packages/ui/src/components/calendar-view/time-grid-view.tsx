"use client";

import * as React from "react";
import { cn } from "cn";
import { format, isSameDay, setHours, startOfDay } from "date-fns";

import { CalendarEventTrigger } from "./event-pill";
import type { CalendarEvent, CalendarSlotClickContext, CalendarViewMode } from "./types";
import { getEventsForDay, getWeekDays, resolveEventBounds } from "./utils";

const HOUR_ROW_HEIGHT = 48;

const MIN_EVENT_MINUTES = 30;

type TimedSegment<TMeta> = {
  event: CalendarEvent<TMeta>;
  start: number;
  end: number;
  lane: number;
  laneCount: number;
};

function layoutTimedEvents<TMeta>(
  events: readonly CalendarEvent<TMeta>[],
  day: Date,
  startHour: number,
  endHour: number,
): TimedSegment<TMeta>[] {
  const windowStart = setHours(day, startHour).getTime();
  const windowEnd = setHours(day, endHour).getTime();
  const totalMinutes = (endHour - startHour) * 60;
  // The grid is labelled in local wall-clock hours, not elapsed time since midnight.
  const minutesFromStart = (value: Date) =>
    (value.getHours() - startHour) * 60 +
    value.getMinutes() +
    value.getSeconds() / 60 +
    value.getMilliseconds() / 60_000;

  const segments = events
    .flatMap((event): TimedSegment<TMeta>[] => {
      const { start, end } = resolveEventBounds(event);
      const point = start.getTime() === end.getTime();
      if (
        start.getTime() >= windowEnd ||
        (point ? end.getTime() < windowStart : end.getTime() <= windowStart)
      ) {
        return [];
      }
      const clippedStart = start.getTime() <= windowStart ? 0 : minutesFromStart(start);
      const clippedEnd = end.getTime() >= windowEnd ? totalMinutes : minutesFromStart(end);
      return [
        {
          event,
          start: clippedStart,
          end: Math.min(totalMinutes, Math.max(clippedEnd, clippedStart + MIN_EVENT_MINUTES)),
          lane: 0,
          laneCount: 1,
        },
      ];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Use the rendered extent for collisions, including the minimum visual height.
  // A disjoint group starts over so its events can use the full column width.
  let group: TimedSegment<TMeta>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = 0;
  function finishGroup() {
    for (const segment of group) segment.laneCount = laneEnds.length;
  }
  for (const segment of segments) {
    if (segment.start >= groupEnd) {
      finishGroup();
      group = [];
      laneEnds = [];
    }
    const availableLane = laneEnds.findIndex((end) => end <= segment.start);
    segment.lane = availableLane === -1 ? laneEnds.length : availableLane;
    laneEnds[segment.lane] = segment.end;
    group.push(segment);
    groupEnd = Math.max(groupEnd, segment.end);
  }
  finishGroup();
  return segments;
}

export function CalendarTimeGridView<TMeta>({
  mode,
  date,
  today,
  events,
  weekStartsOn,
  startHour,
  endHour,
  enableEventPopover,
  onEventClick,
  onSlotClick,
  renderEventPopover,
}: {
  mode: Extract<CalendarViewMode, "week" | "day">;
  date: Date;
  today: Date;
  events: readonly CalendarEvent<TMeta>[];
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startHour: number;
  endHour: number;
  enableEventPopover: boolean;
  onEventClick?: (event: CalendarEvent<TMeta>) => void;
  onSlotClick?: (slot: CalendarSlotClickContext) => void;
  renderEventPopover?: (event: CalendarEvent<TMeta>, close: () => void) => React.ReactNode;
}) {
  const days = React.useMemo(
    () => (mode === "week" ? getWeekDays(date, weekStartsOn) : [startOfDay(date)]),
    [date, mode, weekStartsOn],
  );

  const safeStartHour = Math.max(0, Math.min(23, startHour));
  const safeEndHour = Math.max(safeStartHour + 1, Math.min(24, endHour));
  const hours = React.useMemo(
    () => Array.from({ length: safeEndHour - safeStartHour }, (_, index) => safeStartHour + index),
    [safeEndHour, safeStartHour],
  );
  const totalMinutes = (safeEndHour - safeStartHour) * 60;
  const gridHeight = hours.length * HOUR_ROW_HEIGHT;

  const dayColumns = React.useMemo(
    () =>
      days.map((day) => {
        const dayEvents = getEventsForDay(events, day);
        const allDayEvents: CalendarEvent<TMeta>[] = [];
        const timedEvents: CalendarEvent<TMeta>[] = [];
        for (const event of dayEvents) {
          if (resolveEventBounds(event).allDay) {
            allDayEvents.push(event);
          } else {
            timedEvents.push(event);
          }
        }
        return {
          day,
          allDayEvents,
          timedEvents: layoutTimedEvents(timedEvents, day, safeStartHour, safeEndHour),
        };
      }),
    [days, events, safeEndHour, safeStartHour],
  );

  const hasAllDay = dayColumns.some((col) => col.allDayEvents.length > 0);
  const gridColsClass =
    mode === "week"
      ? "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
      : "grid-cols-[3.5rem_minmax(0,1fr)]";

  return (
    <div data-slot={`calendar-${mode}`} className="flex min-w-0 flex-col border-t border-border">
      {/* Column day headers */}
      <div className={cn("grid border-b border-border bg-muted/40", gridColsClass)}>
        <div className="border-r border-border px-2 py-2 text-xs font-medium text-muted-foreground">
          Time
        </div>
        {dayColumns.map(({ day }) => {
          const isCurrentDay = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 border-r border-border px-2 py-2 text-xs font-medium last:border-r-0",
                isCurrentDay && "bg-primary/5 text-foreground",
              )}
            >
              <span className="uppercase tracking-wider text-muted-foreground">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center tabular-nums",
                  isCurrentDay && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day strip */}
      {hasAllDay && (
        <div className={cn("grid border-b border-border bg-muted/20", gridColsClass)}>
          <div className="flex items-center border-r border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            All day
          </div>
          {dayColumns.map(({ day, allDayEvents }) => (
            <div
              key={`allday-${day.toISOString()}`}
              className="flex min-w-0 flex-col gap-1 border-r border-border p-1 last:border-r-0"
            >
              {allDayEvents.map((event) => (
                <CalendarEventTrigger
                  key={`allday-${day.toISOString()}-${event.id}`}
                  event={event}
                  compact
                  showTime={false}
                  enablePopover={enableEventPopover}
                  onEventClick={onEventClick}
                  renderEventPopover={renderEventPopover}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Hourly grid */}
      <div className="max-h-[34rem] overflow-y-auto overscroll-contain">
        <div className={cn("grid", gridColsClass)}>
          {/* Hour labels column */}
          <div className="border-r border-border bg-muted/10">
            {hours.map((hour) => (
              <div
                key={`label-${hour}`}
                style={{ height: `${HOUR_ROW_HEIGHT}px` }}
                className="flex items-start justify-end border-b border-border/70 px-2 pt-1 font-mono text-[11px] text-muted-foreground tabular-nums last:border-b-0"
              >
                {format(setHours(startOfDay(date), hour), "HH:mm")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dayColumns.map(({ day, timedEvents }) => (
            <div
              key={`col-${day.toISOString()}`}
              style={{ height: `${gridHeight}px` }}
              className="relative min-w-0 border-r border-border last:border-r-0"
            >
              {/* Clickable hour slots */}
              {hours.map((hour) => {
                const slotStart = setHours(day, hour);
                const slotEnd = setHours(day, hour + 1);
                return (
                  <button
                    key={`slot-${day.toISOString()}-${hour}`}
                    type="button"
                    data-slot="calendar-time-slot"
                    aria-label={`Select ${format(slotStart, "MMM d, yyyy HH:mm")}`}
                    style={{ height: `${HOUR_ROW_HEIGHT}px` }}
                    onClick={() =>
                      onSlotClick?.({
                        start: slotStart,
                        end: slotEnd,
                        allDay: false,
                        view: mode,
                      })
                    }
                    className="block w-full border-b border-border/60 text-start transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  />
                );
              })}

              {/* Positioned timed events */}
              {timedEvents.map(({ event, start, end, lane, laneCount }) => (
                <div
                  key={`timed-${day.toISOString()}-${event.id}`}
                  style={{
                    top: `${(start / totalMinutes) * 100}%`,
                    height: `${((end - start) / totalMinutes) * 100}%`,
                    insetInlineStart: `${(lane / laneCount) * 100}%`,
                    inlineSize: `${100 / laneCount}%`,
                  }}
                  className="pointer-events-none absolute z-10 px-0.5 focus-within:z-20"
                >
                  <CalendarEventTrigger
                    event={event}
                    compact
                    showTime={laneCount === 1}
                    enablePopover={enableEventPopover}
                    onEventClick={onEventClick}
                    renderEventPopover={renderEventPopover}
                    className="pointer-events-auto h-full min-h-0 overflow-hidden px-0.5 py-0 shadow-xs"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
