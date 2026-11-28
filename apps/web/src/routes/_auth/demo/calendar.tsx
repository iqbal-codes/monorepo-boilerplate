import { useId, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  CalendarView,
  formatEventTimeRange,
  type CalendarEvent,
  type CalendarEventTone,
  type CalendarSlotClickContext,
  type CalendarViewMode,
} from "@monorepo-boilerplate/ui/components/calendar-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@monorepo-boilerplate/ui/components/field";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";

export const Route = createFileRoute("/_auth/demo/calendar")({
  component: CalendarDemo,
  staticData: { pageTitle: "Calendar" },
});

type PreviewMode = "ready" | "loading" | "empty";

const TONE_OPTIONS: ReadonlyArray<{ label: string; value: CalendarEventTone }> = [
  { label: "Info", value: "info" },
  { label: "Success", value: "success" },
  { label: "Warning", value: "warning" },
  { label: "Danger", value: "danger" },
  { label: "Default", value: "default" },
];

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
 * slot creation, loading overlay, and empty-range state.
 */
function CalendarDemo() {
  const initialAnchor = useMemo(() => new Date(), []);
  const [date, setDate] = useState<Date>(() => new Date(initialAnchor.getTime()));
  const [view, setView] = useState<CalendarViewMode>("month");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("ready");
  const [events, setEvents] = useState<CalendarEvent[]>(() => buildInitialEvents(initialAnchor));

  const [pendingSlot, setPendingSlot] = useState<CalendarSlotClickContext | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTone, setDraftTone] = useState<CalendarEventTone>("info");
  const titleInputId = useId();
  const toneSelectId = useId();

  const displayedEvents = previewMode === "empty" ? [] : events;

  function handleSlotClick(slot: CalendarSlotClickContext) {
    setPendingSlot(slot);
    setDraftTitle("");
    setDraftTone("info");
  }

  function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    if (!pendingSlot) return;
    const trimmed = draftTitle.trim();
    if (!trimmed) return;

    const created: CalendarEvent = {
      id: `cal-custom-${Date.now()}`,
      title: trimmed,
      start: pendingSlot.start.toISOString(),
      end: pendingSlot.end.toISOString(),
      allDay: pendingSlot.allDay,
      tone: draftTone,
      category: "Custom",
      description: `Added from ${pendingSlot.view} slot.`,
    };
    setEvents((prev) => [...prev, created]);
    setPendingSlot(null);
    setPreviewMode("ready");
    toast.success(`Scheduled "${trimmed}".`);
  }

  function handleDeleteEvent(eventId: string, title: string, close: () => void) {
    setEvents((prev) => prev.filter((item) => item.id !== eventId));
    close();
    toast(`Removed "${title}".`);
  }

  function handleReset() {
    setDate(new Date(initialAnchor.getTime()));
    setView("month");
    setPreviewMode("ready");
    setEvents(buildInitialEvents(initialAnchor));
    toast("Calendar demo reset.");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <PageHeader
        title="Calendar"
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
                <ToggleGroupItem value="ready">Ready</ToggleGroupItem>
                <ToggleGroupItem value="loading">Loading</ToggleGroupItem>
                <ToggleGroupItem value="empty">Empty</ToggleGroupItem>
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
            <Button
              type="button"
              size="sm"
              onClick={() =>
                handleSlotClick({
                  start: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0, 0),
                  end: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 11, 0, 0),
                  allDay: false,
                  view,
                })
              }
            >
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              New event
            </Button>
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
        onSlotClick={handleSlotClick}
        renderEventPopover={(event, close) => (
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{event.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">{formatEventTimeRange(event)}</span>
                </p>
              </div>
              {event.category ? (
                <Badge variant="outline" className="shrink-0">
                  {event.category}
                </Badge>
              ) : null}
            </div>

            {event.location ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{event.location}</span>
              </div>
            ) : null}

            {event.description ? (
              <p className="text-xs leading-relaxed text-foreground">{event.description}</p>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <ClockIcon className="size-3" aria-hidden="true" />
                Click outside or Esc to close
              </span>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                onClick={() => handleDeleteEvent(event.id, event.title, close)}
              >
                <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                Remove
              </Button>
            </div>
          </div>
        )}
      />

      <Dialog
        open={pendingSlot !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSlot(null);
        }}
      >
        <DialogContent>
          <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Schedule event</DialogTitle>
              <DialogDescription>
                {pendingSlot
                  ? `Adding event to ${pendingSlot.start.toLocaleDateString()} (${pendingSlot.allDay ? "All day" : pendingSlot.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).`
                  : "Create a calendar event."}
              </DialogDescription>
            </DialogHeader>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={titleInputId}>Event title</FieldLabel>
                <Input
                  id={titleInputId}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="e.g. Architecture sync"
                  required
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={toneSelectId}>Tone</FieldLabel>
                <Select
                  items={TONE_OPTIONS}
                  value={draftTone}
                  onValueChange={(value) => {
                    if (value) setDraftTone(value as CalendarEventTone);
                  }}
                >
                  <SelectTrigger id={toneSelectId} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {TONE_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPendingSlot(null)}>
                Cancel
              </Button>
              <Button type="submit">Add event</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
