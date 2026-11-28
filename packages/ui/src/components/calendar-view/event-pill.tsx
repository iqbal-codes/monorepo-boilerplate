"use client";

import * as React from "react";
import { cn } from "cn";
import { CalendarIcon, ClockIcon, MapPinIcon } from "lucide-react";
import { format } from "date-fns";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import type { CalendarEvent, CalendarEventTone } from "./types";
import { formatEventTimeRange, resolveEventBounds } from "./utils";

const TONE_PILL_CLASSES: Record<CalendarEventTone, string> = {
  default: "border-border bg-secondary text-secondary-foreground hover:bg-muted",
  info: "border-info/30 bg-info-subtle text-info-subtle-foreground hover:bg-info/15",
  success: "border-success/30 bg-success-subtle text-success-subtle-foreground hover:bg-success/15",
  warning: "border-warning/30 bg-warning-subtle text-warning-subtle-foreground hover:bg-warning/15",
  danger:
    "border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground hover:bg-destructive/15",
};

const TONE_DOT_CLASSES: Record<CalendarEventTone, string> = {
  default: "bg-foreground/60",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export function CalendarEventDot({ tone = "default" }: { tone?: CalendarEventTone }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT_CLASSES[tone])}
    />
  );
}

export function CalendarEventTrigger<TMeta>({
  event,
  compact = false,
  showTime = true,
  enablePopover = true,
  onEventClick,
  renderEventPopover,
  className,
  style,
}: {
  event: CalendarEvent<TMeta>;
  compact?: boolean;
  showTime?: boolean;
  enablePopover?: boolean;
  onEventClick?: (event: CalendarEvent<TMeta>) => void;
  renderEventPopover?: (event: CalendarEvent<TMeta>, close: () => void) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = React.useState(false);
  const tone = event.tone ?? "default";
  const { start, allDay } = resolveEventBounds(event);
  const timeText = allDay ? "All day" : format(start, "HH:mm");

  const buttonNode = (
    <button
      type="button"
      data-slot="calendar-event-trigger"
      data-event-id={event.id}
      data-tone={tone}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
        if (!enablePopover) return;
      }}
      className={cn(
        "group/event flex w-full min-w-0 items-center gap-1.5 border px-1.5 text-start text-xs leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring",
        compact ? "min-h-6 py-0.5" : "min-h-7 py-1",
        TONE_PILL_CLASSES[tone],
        className,
      )}
    >
      <CalendarEventDot tone={tone} />
      {showTime && (
        <span className="shrink-0 font-mono text-[11px] opacity-80 tabular-nums">{timeText}</span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
    </button>
  );

  if (!enablePopover) {
    return buttonNode;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={buttonNode} />
      <PopoverContent
        align="start"
        data-slot="calendar-event-popover"
        className="w-72 max-w-[calc(100vw-2rem)] gap-3 p-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        {renderEventPopover ? (
          renderEventPopover(event, () => setOpen(false))
        ) : (
          <>
            <PopoverHeader>
              <div className="flex items-start justify-between gap-2">
                <PopoverTitle className="text-sm font-semibold normal-case tracking-normal">
                  {event.title}
                </PopoverTitle>
                {event.category ? (
                  <Badge variant="outline" className="shrink-0">
                    {event.category}
                  </Badge>
                ) : null}
              </div>
              <PopoverDescription className="flex items-center gap-1.5 text-xs">
                <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{format(start, "EEE, MMM d, yyyy")}</span>
              </PopoverDescription>
            </PopoverHeader>

            <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="tabular-nums">{formatEventTimeRange(event)}</span>
              </div>
              {event.location ? (
                <div className="flex items-center gap-1.5">
                  <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{event.location}</span>
                </div>
              ) : null}
              {event.description ? (
                <p className="pt-1 text-xs leading-relaxed text-foreground">{event.description}</p>
              ) : null}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
