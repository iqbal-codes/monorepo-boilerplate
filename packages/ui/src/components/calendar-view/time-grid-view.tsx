"use client";

import * as React from "react";
import { cn } from "cn";
import {
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";

import { CalendarEventTrigger } from "./event-pill";
import type { CalendarEvent, CalendarSlotClickContext, CalendarViewMode } from "./types";
import { getEventsForDay, getWeekDays, resolveEventBounds } from "./utils";

const HOUR_ROW_HEIGHT = 48;

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

  const safeStartHour = Math.max(0, Math.min(22, startHour));
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
        return { day, allDayEvents, timedEvents };
      }),
    [days, events],
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
          {dayColumns.map(({ day, timedEvents }) => {
            const windowStart = setMinutes(setHours(startOfDay(day), safeStartHour), 0);
            const windowEnd =
              safeEndHour === 24
                ? endOfDay(day)
                : setMinutes(setHours(startOfDay(day), safeEndHour), 0);

            return (
              <div
                key={`col-${day.toISOString()}`}
                style={{ height: `${gridHeight}px` }}
                className="relative min-w-0 border-r border-border last:border-r-0"
              >
                {/* Clickable hour slots */}
                {hours.map((hour) => {
                  const slotStart = setMinutes(setHours(startOfDay(day), hour), 0);
                  const slotEnd = setMinutes(setHours(startOfDay(day), hour + 1), 0);
                  return (
                    <button
                      key={`slot-${day.toISOString()}-${hour}`}
                      type="button"
                      data-slot="calendar-time-slot"
                      aria-label={`Create event on ${format(slotStart, "MMM d, yyyy HH:mm")}`}
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
                {timedEvents.map((event) => {
                  const bounds = resolveEventBounds(event);
                  const clampedStart =
                    bounds.start.getTime() < windowStart.getTime() ? windowStart : bounds.start;
                  const clampedEnd =
                    bounds.end.getTime() > windowEnd.getTime() ? windowEnd : bounds.end;
                  const startMinutes = Math.max(0, differenceInMinutes(clampedStart, windowStart));
                  const durationMinutes = Math.max(
                    30,
                    differenceInMinutes(clampedEnd, clampedStart),
                  );
                  const topPercent = (startMinutes / totalMinutes) * 100;
                  const heightPercent = Math.min(
                    100 - topPercent,
                    (durationMinutes / totalMinutes) * 100,
                  );

                  return (
                    <div
                      key={`timed-${day.toISOString()}-${event.id}`}
                      style={{
                        top: `${topPercent}%`,
                        height: `${heightPercent}%`,
                      }}
                      className="pointer-events-none absolute inset-x-1 z-10 py-0.5"
                    >
                      <CalendarEventTrigger
                        event={event}
                        compact
                        enablePopover={enableEventPopover}
                        onEventClick={onEventClick}
                        renderEventPopover={renderEventPopover}
                        className="pointer-events-auto h-full items-start py-1 shadow-xs"
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
