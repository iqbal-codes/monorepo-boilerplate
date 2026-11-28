"use client";

import * as React from "react";
import { cn } from "cn";
import { CalendarIcon } from "lucide-react";
import { eachDayOfInterval, format, isSameDay } from "date-fns";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { CalendarEventTrigger } from "./event-pill";
import type { CalendarEvent } from "./types";
import { getEventsForDay } from "./utils";

export function CalendarAgendaView<TMeta>({
  rangeStart,
  rangeEnd,
  today,
  events,
  emptyState,
  enableEventPopover,
  onEventClick,
  renderEventPopover,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  today: Date;
  events: readonly CalendarEvent<TMeta>[];
  emptyState?: React.ReactNode;
  enableEventPopover: boolean;
  onEventClick?: (event: CalendarEvent<TMeta>) => void;
  renderEventPopover?: (event: CalendarEvent<TMeta>, close: () => void) => React.ReactNode;
}) {
  const groupedDays = React.useMemo(() => {
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    const populated: Array<{ day: Date; events: CalendarEvent<TMeta>[] }> = [];
    for (const day of days) {
      const dayEvents = getEventsForDay(events, day);
      if (dayEvents.length > 0) {
        populated.push({ day, events: dayEvents });
      }
    }
    return populated;
  }, [events, rangeEnd, rangeStart]);

  if (groupedDays.length === 0) {
    return (
      <div data-slot="calendar-empty" className="border-t border-border p-4">
        {emptyState ?? (
          <Empty className="border-0 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No scheduled events</EmptyTitle>
              <EmptyDescription>
                There are no events in this date range. Try another period or jump to Today.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    );
  }

  return (
    <div
      data-slot="calendar-agenda"
      className="flex min-w-0 flex-col divide-y divide-border border-t border-border"
    >
      {groupedDays.map(({ day, events: dayEvents }) => {
        const isCurrentDay = isSameDay(day, today);
        return (
          <div
            key={day.toISOString()}
            className="flex min-w-0 flex-col gap-2 p-3 sm:flex-row sm:gap-4"
          >
            <div className="flex shrink-0 items-baseline gap-2 sm:w-36 sm:flex-col sm:gap-0.5">
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  isCurrentDay ? "text-primary" : "text-muted-foreground",
                )}
              >
                {format(day, "EEE")}
                {isCurrentDay ? " · Today" : ""}
              </span>
              <span className="text-sm font-medium text-foreground tabular-nums">
                {format(day, "MMM d, yyyy")}
              </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {dayEvents.map((event) => (
                <CalendarEventTrigger
                  key={`agenda-${day.toISOString()}-${event.id}`}
                  event={event}
                  enablePopover={enableEventPopover}
                  onEventClick={onEventClick}
                  renderEventPopover={renderEventPopover}
                  className="py-1.5"
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
