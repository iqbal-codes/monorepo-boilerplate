import type { ReactNode } from "react";

export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export type CalendarEventTone = "default" | "info" | "success" | "warning" | "danger";

export type CalendarEvent<TMeta = unknown> = {
  id: string;
  title: string;
  /** Local `"YYYY-MM-DD"` date string, ISO-8601 datetime string, or `Date`. */
  start: Date | string;
  /** Optional end date/time; defaults to `start`. */
  end?: Date | string;
  allDay?: boolean;
  tone?: CalendarEventTone;
  description?: string;
  location?: string;
  category?: string;
  meta?: TMeta;
};

export type CalendarSlotClickContext = {
  start: Date;
  end: Date;
  allDay: boolean;
  view: CalendarViewMode;
};

export type CalendarViewProps<TMeta = unknown> = {
  events: readonly CalendarEvent<TMeta>[];
  date?: Date;
  defaultDate?: Date;
  onDateChange?: (date: Date) => void;
  view?: CalendarViewMode;
  defaultView?: CalendarViewMode;
  onViewChange?: (view: CalendarViewMode) => void;
  /** Week start day (`0` = Sunday, `1` = Monday). Defaults to `0`. */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Optional number of days displayed in Agenda view; defaults to the active month. */
  agendaDays?: number;
  /** Start hour (0–23) for Week/Day time grids. Defaults to `7`. */
  startHour?: number;
  /** End hour (1–24) for Week/Day time grids. Defaults to `20`. */
  endHour?: number;
  /** Maximum visible event pills per day cell before collapsing into `+N more`. Defaults to `2`. */
  maxEventsPerDay?: number;
  isLoading?: boolean;
  emptyState?: ReactNode;
  /** Automatically render the narrow Agenda layout below `md` (`< 768px`). Defaults to `true`. */
  responsiveAgenda?: boolean;
  /** Opens a built-in detail popover when an event is clicked. Defaults to `true`. */
  enableEventPopover?: boolean;
  onEventClick?: (event: CalendarEvent<TMeta>) => void;
  onSlotClick?: (slot: CalendarSlotClickContext) => void;
  renderEventPopover?: (event: CalendarEvent<TMeta>, close: () => void) => ReactNode;
  toolbarActions?: ReactNode;
  /** Reference date used for Today highlight and Today button. */
  today?: Date;
  ariaLabel?: string;
  className?: string;
};
