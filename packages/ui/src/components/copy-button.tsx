"use client";

import * as React from "react";
import { cn } from "cn";
import { AlertCircleIcon, CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@monorepo-boilerplate/ui/components/tooltip";

export type CopyButtonStatus = "idle" | "copied" | "failed";

export type CopyButtonProps = Omit<React.ComponentProps<typeof Button>, "value" | "onCopy"> & {
  /** Text written to the clipboard when activated. */
  value: string;
  /** Accessible name (when icon-only) and default idle tooltip text. */
  label?: string;
  /** Feedback text shown and announced after a successful copy. */
  copiedLabel?: string;
  /** Feedback text shown and announced when clipboard access fails or is unavailable. */
  failedLabel?: string;
  /** Duration in milliseconds before returning to idle. */
  resetAfterMs?: number;
  /** Placement of the feedback tooltip. */
  tooltipSide?: "top" | "bottom" | "left" | "right";
  /** Disable tooltip wrapper when embedded in another popover/tooltip trigger. */
  showTooltip?: boolean;
  /** Callback invoked after a copy succeeds. */
  onCopied?: (value: string) => void;
  /** Callback invoked when clipboard access fails or is unavailable. */
  onCopyError?: (error: unknown) => void;
};

/**
 * Controlled one-click clipboard copy button with icon feedback, Base UI
 * tooltip, and a sibling `aria-live="polite"` status announcement.
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  failedLabel = "Copy failed",
  resetAfterMs = 2000,
  tooltipSide = "top",
  showTooltip = true,
  variant = "ghost",
  size,
  className,
  children,
  onClick,
  onCopied,
  onCopyError,
  "aria-label": ariaLabel,
  ...props
}: CopyButtonProps) {
  const [status, setStatus] = React.useState<CopyButtonStatus>("idle");
  const [announcement, setAnnouncement] = React.useState("");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnouncementRef = React.useRef("");

  const clearPendingTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  const scheduleReset = React.useCallback(() => {
    clearPendingTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus("idle");
      setAnnouncement("");
    }, resetAfterMs);
  }, [clearPendingTimer, resetAfterMs]);

  const announce = React.useCallback((message: string) => {
    // VoiceOver skips identical consecutive live-region updates even after clearing.
    const nextMessage = lastAnnouncementRef.current === message ? `${message}\u00A0` : message;
    lastAnnouncementRef.current = nextMessage;
    setAnnouncement(nextMessage);
  }, []);

  const handleCopyClick: NonNullable<React.ComponentProps<typeof Button>["onClick"]> = async (
    event,
  ) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    try {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(value);
      setStatus("copied");
      announce(copiedLabel);
      onCopied?.(value);
    } catch (error) {
      setStatus("failed");
      announce(failedLabel);
      onCopyError?.(error);
    } finally {
      scheduleReset();
    }
  };

  const resolvedSize = size ?? (children ? "xs" : "icon-xs");
  const resolvedAriaLabel = children ? ariaLabel : (ariaLabel ?? label);
  const feedbackText =
    status === "copied" ? copiedLabel : status === "failed" ? failedLabel : label;

  const icon =
    status === "copied" ? (
      <CheckIcon
        data-slot="copy-button-icon-copied"
        aria-hidden="true"
        className="text-success-subtle-foreground"
      />
    ) : status === "failed" ? (
      <AlertCircleIcon
        data-slot="copy-button-icon-failed"
        aria-hidden="true"
        className="text-destructive"
      />
    ) : (
      <CopyIcon data-slot="copy-button-icon-idle" aria-hidden="true" />
    );

  const content = (
    <>
      {icon}
      {children}
    </>
  );

  const buttonElement = (
    <Button
      type="button"
      data-slot="copy-button"
      data-status={status}
      data-copied={status === "copied" ? "" : undefined}
      data-failed={status === "failed" ? "" : undefined}
      variant={variant}
      size={resolvedSize}
      aria-label={resolvedAriaLabel}
      className={cn(
        "min-h-7 min-w-7 transition-[color,background-color,border-color]",
        status === "failed" && "border-destructive/40 text-destructive",
        className,
      )}
      onClick={handleCopyClick}
      {...props}
    />
  );

  return (
    <span data-slot="copy-button-root" className="inline-flex items-center">
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger render={buttonElement}>{content}</TooltipTrigger>
          <TooltipContent side={tooltipSide}>{feedbackText}</TooltipContent>
        </Tooltip>
      ) : (
        React.cloneElement(buttonElement, undefined, content)
      )}
      <span
        data-slot="copy-button-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </span>
    </span>
  );
}
