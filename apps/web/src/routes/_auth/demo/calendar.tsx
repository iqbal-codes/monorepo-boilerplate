import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  CalendarView,
  type CalendarEvent,
  type CalendarViewMode,
} from "@monorepo-boilerplate/ui/components/calendar-view";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";
import { formatDate, formatDateTime } from "@monorepo-boilerplate/ui/lib/format";

export const Route = createFileRoute("/_auth/demo/calendar")({
  component: CalendarDemo,
  staticData: { pageTitle: "Calendar" },
});

type PreviewMode = "ready" | "loading" | "empty";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDay(base: Date, dayOfMonth: number): string {
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(dayOfMonth)}`;
}

function buildInitialEvents(anchor: Date): CalendarEvent[] {
  const todayDay = anchor.getDate();
  const busyDay = todayDay === 10 ? 12 : 10;
  const secondaryDay = Math.min(28, Math.max(1, todayDay === 15 ? 17 : 15));
  const lateDay = Math.min(28, Math.max(1, todayDay === 22 ? 24 : 22));

  return [
    {
      id: "cal-1",
      title: "Product Design Review",
      start: `${isoDay(anchor, todayDay)}T09:30:00`,
      end: `${isoDay(anchor, todayDay)}T10:30:00`,
      tone: "info",
      category: "Design",
      location: "Studio B",
      description: "Walk through CalendarView and TreeView layout ergonomics.",
    },
    {
      id: "cal-2",
      title: "Customer Onboarding Sync",
      start: `${isoDay(anchor, todayDay)}T11:00:00`,
      end: `${isoDay(anchor, todayDay)}T12:00:00`,
      tone: "success",
      category: "Customers",
      location: "Meet · Link",
      description: "Kickoff checklist and workspace provisioning.",
    },
    {
      id: "cal-3",
      title: "Release Readiness Check",
      start: `${isoDay(anchor, todayDay)}T14:00:00`,
      end: `${isoDay(anchor, todayDay)}T15:00:00`,
      tone: "warning",
      category: "Engineering",
      description: "Verify mechanical gates and subpath bundle isolation.",
    },
    {
      id: "cal-4",
      title: "Support Escalation Window",
      start: isoDay(anchor, todayDay),
      allDay: true,
      tone: "danger",
      category: "Ops",
      description: "On-call coverage for priority enterprise tickets.",
    },
    {
      id: "cal-5",
      title: "Quarterly Pipeline Review",
      start: `${isoDay(anchor, busyDay)}T10:00:00`,
      end: `${isoDay(anchor, busyDay)}T11:30:00`,
      tone: "info",
      category: "Sales",
      location: "Boardroom 2",
    },
    {
      id: "cal-6",
      title: "Billing Reconciliation",
      start: `${isoDay(anchor, busyDay)}T13:30:00`,
      end: `${isoDay(anchor, busyDay)}T14:30:00`,
      tone: "default",
      category: "Finance",
    },
    {
      id: "cal-7",
      title: "Accessibility Audit",
      start: `${isoDay(anchor, busyDay)}T15:30:00`,
      end: `${isoDay(anchor, busyDay)}T16:30:00`,
      tone: "success",
      category: "QA",
    },
    {
      id: "cal-8",
      title: "Architecture Office Hours",
      start: `${isoDay(anchor, secondaryDay)}T11:00:00`,
      end: `${isoDay(anchor, secondaryDay)}T12:00:00`,
      tone: "info",
      category: "Platform",
    },
    {
      id: "cal-9",
      title: "Database Maintenance Window",
      start: isoDay(anchor, lateDay),
      allDay: true,
      tone: "warning",
      category: "Infra",
      description: "Read-replica snapshot verification.",
    },
  ];
}

/**
 * DELETABLE DEMO. Exhibits the subpath-isolated CalendarView block across Month,
 * Week, Day, and Agenda views, with `+N more` overflow popovers, event popovers,
 * slot callback feedback, loading overlay, and empty-range state.
 */
function CalendarDemo() {
  const initialAnchor = useMemo(() => new Date(), []);
  const [date, setDate] = useState<Date>(() => new Date(initialAnchor.getTime()));
  const [view, setView] = useState<CalendarViewMode>("month");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("ready");
  const events = useMemo(() => buildInitialEvents(initialAnchor), [initialAnchor]);
  const displayedEvents = previewMode === "empty" ? [] : events;

  function handleReset() {
    setDate(new Date(initialAnchor.getTime()));
    setView("month");
    setPreviewMode("ready");
    toast("Calendar demo reset.");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <PageHeader
        title="Calendar"
        stackActionsOnMobile
        description="Controlled, subpath-isolated CalendarView block with Month, Week, Day, and Agenda layouts, overflow popovers, and mobile Agenda fallback. Deletable demo."
        actions={
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <ToggleGroup
                aria-label="Calendar state preview"
                size="sm"
                value={[previewMode]}
                onValueChange={(next) => {
                  const mode = next[0] as PreviewMode | undefined;
                  if (mode) setPreviewMode(mode);
                }}
              >
                <ToggleGroupItem
                  className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
                  value="ready"
                >
                  Ready
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
                  value="loading"
                >
                  Loading
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
                  value="empty"
                >
                  Empty
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline" size="sm" className="sm:hidden">
                    Preview: {previewMode}
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Calendar state</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={previewMode}
                    onValueChange={(value) => {
                      if (value === "ready" || value === "loading" || value === "empty") {
                        setPreviewMode(value);
                      }
                    }}
                  >
                    <DropdownMenuRadioItem value="ready">Ready</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="loading">Loading</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="empty">Empty</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Reset
            </Button>
          </>
        }
      />

      <CalendarView
        events={displayedEvents}
        date={date}
        today={initialAnchor}
        onDateChange={setDate}
        view={view}
        onViewChange={setView}
        isLoading={previewMode === "loading"}
        maxEventsPerDay={2}
        onEventClick={(event) => toast(`Selected event: ${event.title}`)}
        onSlotClick={(slot) => {
          const label = slot.allDay ? formatDate(slot.start) : formatDateTime(slot.start);
          toast(`Selected ${slot.allDay ? "day" : "slot"}: ${label}`);
        }}
      />
    </div>
  );
}
