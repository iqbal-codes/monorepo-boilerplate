"use client";

import * as React from "react";
import { cn } from "cn";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  FileQuestionMarkIcon,
  ServerCrashIcon,
  ShieldAlertIcon,
} from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@monorepo-boilerplate/ui/components/collapsible";
import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@monorepo-boilerplate/ui/components/status-badge";

export type StatusScreenStatus = "404" | "403" | "500" | "error";

type StatusPreset = {
  code: string;
  tone: StatusBadgeTone;
  title: string;
  description: string;
  icon: React.ReactNode;
};

const STATUS_PRESETS: Record<StatusScreenStatus, StatusPreset> = {
  "404": {
    code: "404",
    tone: "neutral",
    title: "Page not found",
    description: "The page you are looking for does not exist or may have been moved.",
    icon: <FileQuestionMarkIcon aria-hidden="true" className="size-5" />,
  },
  "403": {
    code: "403",
    tone: "warning",
    title: "Access restricted",
    description:
      "You do not have permission to view this page. Contact an administrator if you need access.",
    icon: <ShieldAlertIcon aria-hidden="true" className="size-5" />,
  },
  "500": {
    code: "500",
    tone: "danger",
    title: "Something went wrong",
    description:
      "An unexpected error occurred while loading this page. Try again or return to a safe page.",
    icon: <ServerCrashIcon aria-hidden="true" className="size-5" />,
  },
  error: {
    code: "Error",
    tone: "danger",
    title: "Unable to complete request",
    description: "An unexpected error occurred. Try again or return home.",
    icon: <AlertCircleIcon aria-hidden="true" className="size-5" />,
  },
};

const ICON_TONE_CLASSES: Record<StatusBadgeTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/25 bg-info-subtle text-info-subtle-foreground",
  success: "border-success/25 bg-success-subtle text-success-subtle-foreground",
  warning: "border-warning/25 bg-warning-subtle text-warning-subtle-foreground",
  danger: "border-destructive/25 bg-destructive-subtle text-destructive-subtle-foreground",
};

export type StatusScreenProps = {
  /** Status mode driving default badge, icon, title, and description. */
  status?: StatusScreenStatus;
  /** Optional status code/label override inside the StatusBadge. */
  code?: React.ReactNode;
  /** Optional custom icon overriding the preset icon. */
  icon?: React.ReactNode;
  /** Main heading text. */
  title?: React.ReactNode;
  /** Recovery explanation text. */
  description?: React.ReactNode;
  /** Primary recovery action (e.g. Retry or Back to dashboard button). */
  primaryAction?: React.ReactNode;
  /** Secondary recovery action (e.g. Go home link). */
  secondaryAction?: React.ReactNode;
  /** Optional extra action slot rendered alongside primary/secondary actions. */
  actions?: React.ReactNode;
  /** Optional collapsible technical details (e.g. dev-only error stack). */
  details?: React.ReactNode;
  /** Label for the collapsible technical details toggle. */
  detailsLabel?: string;
  /** Controlled open state for technical details. */
  detailsOpen?: boolean;
  /** Initial open state for technical details. */
  defaultDetailsOpen?: boolean;
  /** Callback when technical details open state changes. */
  onDetailsOpenChange?: (open: boolean) => void;
  /** Full viewport centering (`page`) vs layout-embedded centering (`embedded`). */
  layout?: "page" | "embedded";
  /** Heading element level (`h1` default for standalone views, `h2` if nested under a page `h1`). */
  headingLevel?: "h1" | "h2";
  className?: string;
};

/**
 * Controlled, router-free status screen for 404, 403, 500, and generic error
 * boundaries with optional collapsible technical details.
 */
export function StatusScreen({
  status = "error",
  code,
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  actions,
  details,
  detailsLabel = "Technical details",
  detailsOpen,
  defaultDetailsOpen = false,
  onDetailsOpenChange,
  layout = "embedded",
  headingLevel = "h1",
  className,
}: StatusScreenProps) {
  const preset = STATUS_PRESETS[status];
  const resolvedCode = code ?? preset.code;
  const resolvedIcon = icon ?? preset.icon;
  const resolvedTitle = title ?? preset.title;
  const resolvedDescription = description ?? preset.description;
  const HeadingTag = headingLevel;
  const hasActions = Boolean(primaryAction || secondaryAction || actions);
  const copyableDetails = typeof details === "string" && details.trim().length > 0 ? details : null;

  return (
    <section
      data-slot="status-screen"
      data-status={status}
      data-layout={layout}
      className={cn(
        "flex w-full min-w-0 flex-col items-center justify-center px-4 py-8 sm:py-12",
        layout === "page" ? "min-h-svh" : "min-h-72 flex-1",
        className,
      )}
    >
      <div className="flex w-full max-w-md min-w-0 flex-col items-center gap-5 text-center">
        <div className="flex flex-col items-center gap-3">
          <div
            data-slot="status-screen-icon"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center border",
              ICON_TONE_CLASSES[preset.tone],
            )}
            aria-hidden="true"
          >
            {resolvedIcon}
          </div>
          <StatusBadge tone={preset.tone}>{resolvedCode}</StatusBadge>
        </div>

        <div className="flex w-full min-w-0 flex-col items-center gap-2">
          <HeadingTag
            data-slot="status-screen-title"
            className="font-heading text-xl font-semibold tracking-tight text-balance text-foreground sm:text-2xl"
          >
            {resolvedTitle}
          </HeadingTag>
          <p
            data-slot="status-screen-description"
            className="text-sm leading-relaxed text-pretty text-muted-foreground"
          >
            {resolvedDescription}
          </p>
        </div>

        {hasActions ? (
          <div
            data-slot="status-screen-actions"
            className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2.5"
          >
            {primaryAction}
            {secondaryAction}
            {actions}
          </div>
        ) : null}

        {details ? (
          <Collapsible
            data-slot="status-screen-details"
            open={detailsOpen}
            defaultOpen={defaultDetailsOpen}
            onOpenChange={onDetailsOpenChange}
            className="flex w-full min-w-0 flex-col items-center gap-2 pt-1"
          >
            <CollapsibleTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  data-slot="status-screen-details-trigger"
                  className="group/details gap-1.5 text-muted-foreground [&[data-panel-open]>svg]:rotate-180"
                />
              }
            >
              <span>{detailsLabel}</span>
              <ChevronDownIcon aria-hidden="true" className="transition-transform duration-150" />
            </CollapsibleTrigger>

            <CollapsibleContent
              data-slot="status-screen-details-content"
              className="w-full min-w-0 border border-border bg-muted/40 text-left"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
                <span className="text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {detailsLabel}
                </span>
                {copyableDetails ? (
                  <CopyButton
                    value={copyableDetails}
                    label="Copy technical details"
                    showTooltip={false}
                  />
                ) : null}
              </div>
              <pre className="max-h-56 w-full min-w-0 overflow-auto p-3 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-foreground">
                {details}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>
    </section>
  );
}
