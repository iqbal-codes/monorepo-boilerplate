import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { badgeBaseClass } from "./badge-styles";

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const statusBadgeVariants = cva(cn("group/status-badge", badgeBaseClass), {
  variants: {
    tone: {
      neutral: "border-border bg-muted text-foreground/80",
      info: "border-info/25 bg-info-subtle text-info-subtle-foreground",
      success: "border-success/25 bg-success-subtle text-success-subtle-foreground",
      warning: "border-warning/25 bg-warning-subtle text-warning-subtle-foreground",
      danger: "border-destructive/25 bg-destructive-subtle text-destructive-subtle-foreground",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

const DOT_TONE_CLASSES: Record<StatusBadgeTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export type StatusBadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    /** Semantic status tone mapped to WCAG-AA OKLCH tokens. */
    tone?: StatusBadgeTone;
    /** Renders a decorative status dot before the label. */
    dot?: boolean;
  };

/**
 * Semantic status badge backed by the shared OKLCH token pairs (`neutral`,
 * `info`, `success`, `warning`, `danger`).
 */
export function StatusBadge({
  className,
  tone = "neutral",
  dot = false,
  render,
  children,
  ...props
}: StatusBadgeProps) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(statusBadgeVariants({ tone }), className),
        children: (
          <>
            {dot ? (
              <span
                data-slot="status-badge-dot"
                aria-hidden="true"
                className={cn("size-1.5 shrink-0 rounded-full", DOT_TONE_CLASSES[tone])}
              />
            ) : null}
            {children}
          </>
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "status-badge",
      tone,
      ...(dot ? { dot: true } : {}),
    },
  });
}

export { statusBadgeVariants };
