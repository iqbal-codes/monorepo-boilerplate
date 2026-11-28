"use client";

import * as React from "react";
import { cn } from "cn";
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";
import { useIsMobile } from "@monorepo-boilerplate/ui/hooks/use-mobile";
import { CalendarAgendaView } from "./agenda-view";
import { CalendarMonthView } from "./month-view";
import { CalendarTimeGridView } from "./time-grid-view";
import type { CalendarViewMode, CalendarViewProps } from "./types";
import {
  formatCalendarRangeLabel,
  getCalendarDateRange,
  getEventsInRange,
  navigateCalendarDate,
} from "./utils";

const VIEW_OPTIONS: ReadonlyArray<{ value: CalendarViewMode; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

/**
 * Controlled, router-free Calendar View block supporting Month, Week, Day, and
 * Agenda layouts, range navigation, `+N more` overflow popovers, event detail
 * popovers, and automatic narrow Agenda fallback below `md`.
 */
export function CalendarView<TMeta = unknown>({
  events,
  date: controlledDate,
  defaultDate,
  onDateChange,
  view: controlledView,
  defaultView = "month",
  onViewChange,
  weekStartsOn = 0,
  agendaDays,
  startHour = 7,
  endHour = 20,
  maxEventsPerDay = 2,
  isLoading = false,
  emptyState,
  responsiveAgenda = true,
  enableEventPopover = true,
  onEventClick,
  onSlotClick,
  renderEventPopover,
  toolbarActions,
  today: todayProp,
  ariaLabel = "Calendar",
  className,
}: CalendarViewProps<TMeta>) {
  const isMobile = useIsMobile();
  const [uncontrolledDate, setUncontrolledDate] = React.useState(
    () => defaultDate ?? todayProp ?? new Date(),
  );
  const [uncontrolledView, setUncontrolledView] = React.useState<CalendarViewMode>(defaultView);

  const activeDate = controlledDate ?? uncontrolledDate;
  const activeView = controlledView ?? uncontrolledView;
  const today = todayProp ?? new Date();
  const handleEventClick = isLoading ? undefined : onEventClick;
  const handleSlotClick = isLoading ? undefined : onSlotClick;

  const effectiveView: CalendarViewMode =
    responsiveAgenda && isMobile && activeView !== "agenda" ? "agenda" : activeView;

  const { start: rangeStart, end: rangeEnd } = React.useMemo(
    () => getCalendarDateRange(activeDate, effectiveView, weekStartsOn, agendaDays),
    [activeDate, agendaDays, effectiveView, weekStartsOn],
  );

  const rangeEvents = React.useMemo(
    () => getEventsInRange(events, rangeStart, rangeEnd),
    [events, rangeEnd, rangeStart],
  );

  const rangeLabel = React.useMemo(
    () => formatCalendarRangeLabel(activeDate, effectiveView, weekStartsOn, agendaDays),
    [activeDate, agendaDays, effectiveView, weekStartsOn],
  );

  function handleNavigate(direction: "prev" | "next" | "today") {
    const nextDate = navigateCalendarDate(activeDate, effectiveView, direction, today, agendaDays);
    if (controlledDate === undefined) {
      setUncontrolledDate(nextDate);
    }
    onDateChange?.(nextDate);
  }

  function handleViewSelect(nextView: CalendarViewMode) {
    if (controlledView === undefined) {
      setUncontrolledView(nextView);
    }
    onViewChange?.(nextView);
  }

  return (
    <section
      data-slot="calendar-view"
      data-view={activeView}
      data-effective-view={effectiveView}
      aria-label={ariaLabel}
      aria-busy={isLoading ? "true" : undefined}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {/* Top toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              data-slot="calendar-nav-prev"
              aria-label="Previous period"
              onClick={() => handleNavigate("prev")}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-slot="calendar-nav-today"
              onClick={() => handleNavigate("today")}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              data-slot="calendar-nav-next"
              aria-label="Next period"
              onClick={() => handleNavigate("next")}
            >
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>

          <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight sm:text-base">
            {rangeLabel}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {responsiveAgenda && isMobile ? (
            <Badge variant="outline" data-slot="calendar-mobile-agenda-badge">
              Agenda
            </Badge>
          ) : (
            <ToggleGroup
              aria-label="Calendar view"
              size="sm"
              spacing={0}
              variant="outline"
              value={[activeView]}
              onValueChange={(next) => {
                const mode = next[0] as CalendarViewMode | undefined;
                if (mode) handleViewSelect(mode);
              }}
            >
              {VIEW_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  data-slot="calendar-view-switch"
                  data-view-option={option.value}
                  className="px-2.5 focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {toolbarActions}
        </div>
      </div>

      {/* Empty range cue for grid layouts */}
      {!isLoading && effectiveView !== "agenda" && rangeEvents.length === 0 && (
        <div
          data-slot="calendar-empty-range"
          className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:px-4"
        >
          <CalendarOffIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span>No events scheduled in this range.</span>
        </div>
      )}

      {/* Calendar body */}
      <div className="relative min-w-0">
        <div inert={isLoading}>
          {effectiveView === "month" && (
            <CalendarMonthView
              date={activeDate}
              today={today}
              events={events}
              weekStartsOn={weekStartsOn}
              maxEventsPerDay={maxEventsPerDay}
              isLoading={isLoading}
              enableEventPopover={!isLoading && enableEventPopover}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              renderEventPopover={renderEventPopover}
            />
          )}

          {(effectiveView === "week" || effectiveView === "day") && (
            <CalendarTimeGridView
              mode={effectiveView}
              date={activeDate}
              today={today}
              events={events}
              weekStartsOn={weekStartsOn}
              startHour={startHour}
              endHour={endHour}
              enableEventPopover={!isLoading && enableEventPopover}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              renderEventPopover={renderEventPopover}
            />
          )}

          {effectiveView === "agenda" && (
            <CalendarAgendaView
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              today={today}
              events={events}
              emptyState={emptyState}
              enableEventPopover={!isLoading && enableEventPopover}
              onEventClick={handleEventClick}
              renderEventPopover={renderEventPopover}
            />
          )}
        </div>

        {/* Loading skeleton overlay */}
        {isLoading && (
          <div
            data-slot="calendar-loading-overlay"
            aria-label="Loading calendar events"
            className="absolute inset-0 z-20 flex flex-col gap-3 border-t border-border bg-card/90 p-4 backdrop-blur-[1px]"
          >
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }, (_, i) => (
                <Skeleton key={`hdr-skel-${i}`} className="h-5 w-full" />
              ))}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-7">
              {Array.from({ length: 14 }, (_, i) => (
                <div
                  key={`cell-skel-${i}`}
                  className="flex flex-col gap-1.5 border border-border/60 p-2"
                >
                  <Skeleton className="h-3.5 w-6" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
