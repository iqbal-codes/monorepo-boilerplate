"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { AlertCircleIcon, AlertTriangleIcon, InfoIcon, XIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";

export type SystemBannerTone = "neutral" | "info" | "warning" | "danger";

const systemBannerVariants = cva(
  "w-full shrink-0 border-b px-4 py-2 text-xs transition-colors sm:text-sm",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-foreground",
        info: "border-info/30 bg-info-subtle text-info-subtle-foreground",
        warning: "border-warning/30 bg-warning-subtle text-warning-subtle-foreground",
        danger: "border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

const DEFAULT_ICONS: Record<SystemBannerTone, React.ReactNode> = {
  neutral: <InfoIcon aria-hidden="true" className="size-4 shrink-0" />,
  info: <InfoIcon aria-hidden="true" className="size-4 shrink-0" />,
  warning: <AlertTriangleIcon aria-hidden="true" className="size-4 shrink-0" />,
  danger: <AlertCircleIcon aria-hidden="true" className="size-4 shrink-0" />,
};

export type SystemBannerProps = Omit<React.ComponentProps<"div">, "children"> &
  VariantProps<typeof systemBannerVariants> & {
    /** Controls visibility; returns `null` when `false`. Defaults to `true`. */
    open?: boolean;
    /** Semantic tone mapped to OKLCH tokens. Defaults to `"neutral"`. */
    tone?: SystemBannerTone;
    /** Leading icon; defaults to a tone icon unless `icon={null}` is passed. */
    icon?: React.ReactNode;
    /** Banner message content. */
    message: React.ReactNode;
    /** Optional action slot (e.g. Button or Link). */
    action?: React.ReactNode;
    /** Optional dismiss callback; renders a dismiss control only when provided. */
    onDismiss?: () => void;
    /** Accessible name for the dismiss button. */
    dismissLabel?: string;
    /** ARIA live-region role override (`alert` for warning/danger, `status` otherwise). */
    role?: "status" | "alert";
  };

/**
 * Controlled, router-free operational banner designed to stack above `AppTopbar`
 * inside `SidebarInset` without pushing the shell past `h-svh`.
 */
export function SystemBanner({
  open = true,
  tone = "neutral",
  icon,
  message,
  action,
  onDismiss,
  dismissLabel = "Dismiss notice",
  role,
  className,
  ...props
}: SystemBannerProps) {
  if (!open) {
    return null;
  }

  const resolvedIcon = icon === undefined ? DEFAULT_ICONS[tone] : icon;
  const resolvedRole = role ?? (tone === "warning" || tone === "danger" ? "alert" : "status");

  return (
    <div
      data-slot="system-banner"
      data-tone={tone}
      role={resolvedRole}
      className={cn(systemBannerVariants({ tone }), className)}
      {...props}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {resolvedIcon}
          <div data-slot="system-banner-message" className="min-w-0 font-medium text-pretty">
            {message}
          </div>
        </div>

        {(action || onDismiss) && (
          <div className="flex shrink-0 items-center gap-2">
            {action ? (
              <div data-slot="system-banner-action" className="flex items-center gap-2">
                {action}
              </div>
            ) : null}
            {onDismiss ? (
              <Button
                type="button"
                data-slot="system-banner-dismiss"
                variant="ghost"
                size="icon-xs"
                aria-label={dismissLabel}
                onClick={onDismiss}
              >
                <XIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export { systemBannerVariants };
