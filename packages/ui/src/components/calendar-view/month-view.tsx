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
  isLoading,
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
  isLoading: boolean;
  enableEventPopover: boolean;
  onEventClick?: (event: CalendarEvent<TMeta>) => void;
  onSlotClick?: (slot: CalendarSlotClickContext) => void;
  renderEventPopover?: (event: CalendarEvent<TMeta>, close: () => void) => React.ReactNode;
}) {
  const days = React.useMemo(() => getMonthGridDays(date, weekStartsOn), [date, weekStartsOn]);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, (index + 1) * 7),
  );

  return (
    <table
      data-slot="calendar-month"
      className="w-full table-fixed border-collapse border-t border-border"
    >
      <caption className="sr-only">{format(date, "MMMM yyyy")}</caption>
      <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
        <tr>
          {days.slice(0, 7).map((day) => (
            <th
              key={day.getDay()}
              scope="col"
              className="border-r border-border px-2 py-2 text-center font-medium uppercase tracking-wider last:border-r-0"
            >
              {format(day, "EEE")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]!.toISOString()}>
            {week.map((day) => {
              const dayEvents = getEventsForDay(events, day);
              const inCurrentMonth = isSameMonth(day, date);
              const isCurrentDay = isSameDay(day, today);
              const visibleEvents = dayEvents.slice(0, maxEventsPerDay);
              const overflowCount = Math.max(0, dayEvents.length - visibleEvents.length);
              const overflowTrigger = overflowCount > 0 && (
                <button
                  type="button"
                  data-slot="calendar-overflow-trigger"
                  aria-label={`Show ${overflowCount} more events for ${format(day, "MMM d, yyyy")}`}
                  className="min-h-6 w-full truncate border border-dashed border-border bg-muted/40 px-1.5 py-0.5 text-start text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  +{overflowCount} more
                </button>
              );

              return (
                <td
                  key={day.toISOString()}
                  data-slot="calendar-day-cell"
                  data-date={format(day, "yyyy-MM-dd")}
                  data-outside={!inCurrentMonth ? "true" : undefined}
                  data-today={isCurrentDay ? "true" : undefined}
                  className={cn(
                    "h-28 border-r border-b border-border p-1.5 align-top transition-colors last:border-r-0",
                    !inCurrentMonth && "bg-muted/25 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 flex items-center">
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

                  <div className="flex min-w-0 flex-col gap-1">
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

                    {isLoading
                      ? overflowTrigger
                      : overflowTrigger && (
                          <Popover>
                            <PopoverTrigger render={overflowTrigger} />
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
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
