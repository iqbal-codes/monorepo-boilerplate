"use client";

import * as React from "react";
import { cn } from "cn";
import { endOfDay, format, isSameDay, isSameMonth, startOfDay } from "date-fns";

import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import { CalendarEventTrigger } from "./event-pill";
import type { CalendarEvent, CalendarSlotClickContext } from "./types";
import { getEventsForDay, getMonthGridDays } from "./utils";

export function CalendarMonthView<TMeta>({
  date,
  today,
  events,
  weekStartsOn,
  maxEventsPerDay,
  enableEventPopover,
  onEventClick,
  onSlotClick,
  renderEventPopover,
}: {
  date: Date;
  today: Date;
  events: readonly CalendarEvent<TMeta>[];
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  maxEventsPerDay: number;
  enableEventPopover: boolean;
  onEventClick?: (event: CalendarEvent<TMeta>) => void;
  onSlotClick?: (slot: CalendarSlotClickContext) => void;
  renderEventPopover?: (event: CalendarEvent<TMeta>, close: () => void) => React.ReactNode;
}) {
  const days = React.useMemo(() => getMonthGridDays(date, weekStartsOn), [date, weekStartsOn]);
  const weekdayHeaders = React.useMemo(() => days.slice(0, 7), [days]);

  return (
    <div data-slot="calendar-month" className="flex min-w-0 flex-col border-t border-border">
      <div
        role="row"
        className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground"
      >
        {weekdayHeaders.map((day) => (
          <div
            key={`weekday-${day.getDay()}`}
            role="columnheader"
            className="border-r border-border px-2 py-2 text-center uppercase tracking-wider last:border-r-0"
          >
            {format(day, "EEE")}
          </div>
        ))}
      </div>

      <div role="grid" className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayEvents = getEventsForDay(events, day);
          const inCurrentMonth = isSameMonth(day, date);
          const isCurrentDay = isSameDay(day, today);
          const visibleEvents = dayEvents.slice(0, maxEventsPerDay);
          const overflowCount = Math.max(0, dayEvents.length - visibleEvents.length);
          const isLastColumn = (index + 1) % 7 === 0;

          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              data-slot="calendar-day-cell"
              data-date={format(day, "yyyy-MM-dd")}
              data-outside={!inCurrentMonth ? "true" : undefined}
              data-today={isCurrentDay ? "true" : undefined}
              className={cn(
                "flex min-h-28 min-w-0 flex-col gap-1 border-b border-border p-1.5 transition-colors",
                !isLastColumn && "border-r",
                !inCurrentMonth && "bg-muted/25 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  data-slot="calendar-day-slot"
                  aria-label={`Select ${format(day, "MMMM d, yyyy")}`}
                  onClick={() =>
                    onSlotClick?.({
                      start: startOfDay(day),
                      end: endOfDay(day),
                      allDay: true,
                      view: "month",
                    })
                  }
                  className={cn(
                    "inline-flex min-h-6 min-w-6 items-center justify-center px-1.5 text-xs font-medium tabular-nums transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isCurrentDay && "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {format(day, "d")}
                </button>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {visibleEvents.map((event) => (
                  <CalendarEventTrigger
                    key={`${day.toISOString()}-${event.id}`}
                    event={event}
                    compact
                    enablePopover={enableEventPopover}
                    onEventClick={onEventClick}
                    renderEventPopover={renderEventPopover}
                  />
                ))}

                {overflowCount > 0 && (
                  <Popover>
                    <PopoverTrigger
                      render={
                        <button
                          type="button"
                          data-slot="calendar-overflow-trigger"
                          aria-label={`Show ${overflowCount} more events for ${format(day, "MMM d, yyyy")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="min-h-6 w-full truncate border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-start text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring"
                        >
                          +{overflowCount} more
                        </button>
                      }
                    />
                    <PopoverContent
                      align="start"
                      data-slot="calendar-overflow-popover"
                      className="w-72 max-w-[calc(100vw-2rem)] gap-2.5 p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PopoverHeader>
                        <PopoverTitle>{format(day, "EEEE, MMM d")}</PopoverTitle>
                      </PopoverHeader>
                      <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto overscroll-contain">
                        {dayEvents.map((event) => (
                          <CalendarEventTrigger
                            key={`overflow-${day.toISOString()}-${event.id}`}
                            event={event}
                            enablePopover={enableEventPopover}
                            onEventClick={onEventClick}
                            renderEventPopover={renderEventPopover}
                          />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
