"use client";

import * as React from "react";
import { cn } from "cn";
import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  ArchiveIcon,
  ChevronDownIcon,
  HistoryIcon,
  ImageIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusCircleIcon,
  RotateCcwIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@monorepo-boilerplate/ui/components/alert";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@monorepo-boilerplate/ui/components/avatar";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import { Textarea } from "@monorepo-boilerplate/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@monorepo-boilerplate/ui/components/tooltip";
import { formatDateTime } from "@monorepo-boilerplate/ui/lib/format";

export type ActivityTimelineActor = {
  name: string;
  avatarUrl?: string | null;
  initials?: string;
};

export type ActivityTimelineEventType =
  | "created"
  | "updated"
  | "archived"
  | "restored"
  | "avatar_updated"
  | "avatar_removed"
  | "note"
  | (string & {});

export type ActivityTimelineItem = {
  id: string;
  type: ActivityTimelineEventType;
  title: React.ReactNode;
  description?: React.ReactNode;
  actor?: ActivityTimelineActor;
  timestamp: Date | string | number;
  /** Structured metadata object or custom element rendered in an expandable panel. */
  metadata?: Record<string, unknown> | React.ReactNode;
  icon?: React.ReactNode;
};

export type ActivityTimelineProps = {
  items: readonly ActivityTimelineItem[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  /** Optional comment composer rendered even when the timeline is empty. */
  composer?: React.ReactNode;
  composerPosition?: "top" | "bottom";
  className?: string;
};

const EVENT_ICON_STYLES: Record<string, { icon: React.ReactNode; badgeClassName: string }> = {
  created: {
    icon: <PlusCircleIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-success/25 bg-success-subtle text-success-subtle-foreground",
  },
  updated: {
    icon: <PencilIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-info/25 bg-info-subtle text-info-subtle-foreground",
  },
  archived: {
    icon: <ArchiveIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-warning/25 bg-warning-subtle text-warning-subtle-foreground",
  },
  restored: {
    icon: <RotateCcwIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-success/25 bg-success-subtle text-success-subtle-foreground",
  },
  avatar_updated: {
    icon: <ImageIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-border bg-muted text-muted-foreground",
  },
  avatar_removed: {
    icon: <ImageIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-border bg-muted text-muted-foreground",
  },
  note: {
    icon: <MessageSquareIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-info/25 bg-info-subtle text-info-subtle-foreground",
  },
};

function hasMetadataContent(metadata: ActivityTimelineItem["metadata"]): boolean {
  if (metadata === null || metadata === undefined) return false;
  if (React.isValidElement(metadata)) return true;
  if (typeof metadata === "object") {
    return Object.keys(metadata).length > 0;
  }
  return String(metadata).trim().length > 0;
}

function renderMetadataBody(metadata: NonNullable<ActivityTimelineItem["metadata"]>) {
  if (React.isValidElement(metadata) || typeof metadata !== "object") {
    return metadata;
  }
  return (
    <pre className="max-h-48 overflow-auto font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-foreground">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

function TimelineTimestamp({ value }: { value: Date | string | number }) {
  const date = value instanceof Date ? value : new Date(value);
  const iso = Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  const relative = Number.isNaN(date.getTime())
    ? String(value)
    : formatDistanceToNow(date, { addSuffix: true });
  const exact = Number.isNaN(date.getTime()) ? String(value) : formatDateTime(date);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${relative} (${exact})`}
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <time dateTime={iso}>{relative}</time>
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  );
}

function TimelineRow({ item, isLast }: { item: ActivityTimelineItem; isLast: boolean }) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const iconStyle = EVENT_ICON_STYLES[item.type] ?? {
    icon: <ActivityIcon className="size-3.5" aria-hidden="true" />,
    badgeClassName: "border-border bg-muted text-muted-foreground",
  };
  const showMetadata = hasMetadataContent(item.metadata);

  return (
    <li
      data-slot="activity-timeline-item"
      data-event-type={item.type}
      className="relative flex gap-3 pb-5 last:pb-0"
    >
      {!isLast ? (
        <span aria-hidden="true" className="absolute top-7 bottom-0 start-3.5 w-px bg-border" />
      ) : null}

      <div
        data-slot="activity-timeline-icon"
        aria-hidden="true"
        className={cn(
          "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
          iconStyle.badgeClassName,
        )}
      >
        {item.icon ?? iconStyle.icon}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            {item.actor ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <Avatar size="sm">
                  {item.actor.avatarUrl ? (
                    <AvatarImage src={item.actor.avatarUrl} alt={item.actor.name} />
                  ) : null}
                  <AvatarFallback>
                    {item.actor.initials ?? getInitials(item.actor.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{item.actor.name}</span>
              </span>
            ) : null}
            <span className="min-w-0 wrap-break-word text-foreground">{item.title}</span>
          </div>
          <TimelineTimestamp value={item.timestamp} />
        </div>

        {item.description ? (
          <div className="rounded-none border border-border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap text-foreground">
            {item.description}
          </div>
        ) : null}

        {showMetadata && item.metadata !== undefined && item.metadata !== null ? (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-slot="activity-timeline-metadata-trigger"
                  className="-ms-2 h-6 gap-1 px-2 text-xs text-muted-foreground [&[data-panel-open]>svg]:rotate-180"
                />
              }
            >
              <span>{detailsOpen ? "Hide details" : "View details"}</span>
              <ChevronDownIcon
                className="size-3 transition-transform duration-150"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent
              data-slot="activity-timeline-metadata-content"
              className="mt-1.5 border border-border bg-muted/40 p-2.5"
            >
              {renderMetadataBody(item.metadata)}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Controlled, router-free Activity Timeline Block displaying chronological
 * events with actor avatars, relative + exact timestamp tooltips, typed icons,
 * expandable metadata, and a comment composer slot.
 */
export function ActivityTimeline({
  items,
  isLoading = false,
  error,
  onRetry,
  emptyTitle = "No activity yet.",
  emptyDescription,
  composer,
  composerPosition = "bottom",
  className,
}: ActivityTimelineProps) {
  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading activity">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            data-slot="activity-timeline-skeleton"
            className="flex items-start gap-3"
          >
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <Alert variant="destructive">
        <AlertTitle>Could not load activity</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{error}</span>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  } else if (items.length === 0) {
    body = (
      <Empty className="border-0 py-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <ol data-slot="activity-timeline-list" className="flex flex-col">
        {items.map((item, index) => (
          <TimelineRow key={item.id} item={item} isLast={index === items.length - 1} />
        ))}
      </ol>
    );
  }

  return (
    <div data-slot="activity-timeline" className={cn("flex flex-col gap-4", className)}>
      {composer && composerPosition === "top" ? composer : null}
      {body}
      {composer && composerPosition === "bottom" ? composer : null}
    </div>
  );
}

export type ActivityTimelineComposerProps = {
  onSubmit: (body: string) => void | Promise<void>;
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  submittingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
};

/**
 * Controlled comment composer for `ActivityTimeline` with an explicit submit
 * button and IME-safe `Ctrl/Cmd + Enter` submission.
 */
export function ActivityTimelineComposer({
  onSubmit,
  label = "Add a note",
  placeholder = "Add a note to the timeline…",
  submitLabel = "Add note",
  submittingLabel = "Adding…",
  pending = false,
  disabled = false,
  maxLength = 2000,
  className,
}: ActivityTimelineComposerProps) {
  const inputId = React.useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = React.useState("");
  const [localPending, setLocalPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isBusy = pending || localPending;
  const trimmed = draft.trim();
  const canSubmit = !disabled && !isBusy && trimmed.length > 0;

  async function submitDraft() {
    if (!canSubmit) return;
    setError(null);
    setLocalPending(true);
    try {
      await onSubmit(trimmed);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add note.");
    } finally {
      setLocalPending(false);
    }
  }

  return (
    <form
      data-slot="activity-timeline-composer"
      className={cn("flex flex-col gap-2 border-t border-border pt-4", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void submitDraft();
      }}
    >
      <label
        htmlFor={inputId}
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </label>
      <Textarea
        id={inputId}
        name="note"
        rows={2}
        maxLength={maxLength}
        value={draft}
        placeholder={placeholder}
        disabled={disabled || isBusy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
              return;
            }
            event.preventDefault();
            void submitDraft();
          }
        }}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Press Ctrl+Enter to submit</span>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {isBusy ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
          {isBusy ? submittingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
