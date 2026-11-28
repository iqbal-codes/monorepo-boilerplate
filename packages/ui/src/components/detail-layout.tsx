import type * as React from "react";
import { cn } from "cn";

export type DetailScreenProps = React.ComponentProps<"div">;

/**
 * Standard outer stack for entity detail screens.
 */
export function DetailScreen({ className, ...props }: DetailScreenProps) {
  return (
    <div
      data-slot="detail-screen"
      className={cn("flex min-w-0 flex-col gap-5 sm:gap-6", className)}
      {...props}
    />
  );
}

export type DetailHeaderProps = {
  /** Leading visual slot such as an `Avatar` or framed icon. */
  media?: React.ReactNode;
  /** Primary entity name rendered inside the `<h1>`. */
  title: React.ReactNode;
  /** Inline status or type badge placed alongside `title`. */
  badge?: React.ReactNode;
  /** Secondary identifying line beneath `title` (e.g. copyable email or ID). */
  subtitle?: React.ReactNode;
  /** Optional metadata strip beneath `subtitle` (e.g. tag pills). */
  meta?: React.ReactNode;
  /** Action controls; full-width row below identity on `<sm`, right-aligned on `sm+`. */
  actions?: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<"header">, "title">;

/**
 * Responsive detail-page identity header. Stacks identity above actions below
 * `sm` so narrow viewports (320px) keep full horizontal width for the title,
 * subtitle, and tags without mid-word squeezing.
 */
export function DetailHeader({
  media,
  title,
  badge,
  subtitle,
  meta,
  actions,
  className,
  ...props
}: DetailHeaderProps) {
  return (
    <header
      data-slot="detail-header"
      className={cn(
        "flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between sm:pb-6",
        className,
      )}
      {...props}
    >
      <div
        data-slot="detail-header-identity"
        className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4"
      >
        {media ? (
          <div data-slot="detail-header-media" className="shrink-0">
            {media}
          </div>
        ) : null}

        <div data-slot="detail-header-content" className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="font-heading text-xl leading-tight font-semibold tracking-tight wrap-break-word text-foreground sm:text-2xl">
              {title}
            </h1>
            {badge}
          </div>

          {subtitle ? (
            <div
              data-slot="detail-header-subtitle"
              className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground"
            >
              {subtitle}
            </div>
          ) : null}

          {meta ? (
            <div
              data-slot="detail-header-meta"
              className="flex min-w-0 flex-wrap items-center gap-1.5 pt-0.5"
            >
              {meta}
            </div>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div
          data-slot="detail-header-actions"
          className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export type DetailGridProps = React.ComponentProps<"div">;

/**
 * Responsive 3-column detail body grid (`1` col below `lg`, `1:2` or `2:1` at `lg+`).
 * Place `DetailAside` before `DetailMain` when properties should lead on mobile.
 */
export function DetailGrid({ className, ...props }: DetailGridProps) {
  return (
    <div
      data-slot="detail-grid"
      className={cn(
        "grid min-w-0 grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export type DetailMainProps = React.ComponentProps<"div">;

/**
 * Primary 2-column region inside `DetailGrid` for timelines, line items, or tables.
 */
export function DetailMain({ className, ...props }: DetailMainProps) {
  return (
    <div
      data-slot="detail-main"
      className={cn("flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-span-2", className)}
      {...props}
    />
  );
}

export type DetailAsideProps = React.ComponentProps<"aside">;

/**
 * Secondary 1-column rail inside `DetailGrid` for metadata and notes.
 */
export function DetailAside({ className, ...props }: DetailAsideProps) {
  return (
    <aside
      data-slot="detail-aside"
      className={cn("flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-span-1", className)}
      {...props}
    />
  );
}
