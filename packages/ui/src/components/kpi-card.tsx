import * as React from "react";
import { cn } from "cn";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import { formatPercent } from "@monorepo-boilerplate/ui/lib/format";

export type KpiTrend = {
  /** Fraction: 0.12 renders as +12%. Negative renders as a decline. */
  value: number;
  /** What the change is measured against, e.g. "vs last month". */
  label?: string;
};

export type KpiTone = "default" | "info" | "success" | "warning" | "danger";

export type KpiProgress =
  | number
  | {
      value: number;
      max?: number;
      label?: string;
    };

type KpiCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  trend?: KpiTrend;
  /** Small context line under the value, e.g. "of 53 customers". */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** Semantic tint for the framed icon badge, sparkline, and progress bar. */
  tone?: KpiTone;
  /** Optional 0..1 ratio or `{ value, max, label }` rendered as a slim progress bar. */
  progress?: KpiProgress;
  /** Optional numeric series rendered as a compact trailing SVG sparkline. */
  sparkline?: readonly number[];
  /** Card padding density. Defaults to `"sm"` for compact KPI strips. */
  size?: "sm" | "default";
  /** Marks the card as selected (e.g. when acting as a quick filter). */
  active?: boolean;
  /** Makes the card a native `<button type="button">` quick-filter or drill-down trigger. */
  onClick?: () => void;
  className?: string;
};

const SIZE_CLASSES: Record<"sm" | "default", string> = {
  sm: "px-4 py-3.5",
  default: "px-5 py-5",
};

const TONE_ICON_CLASSES: Record<KpiTone, string> = {
  default: "border-border/70 bg-muted/50 text-muted-foreground",
  info: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
};

const TONE_BAR_CLASSES: Record<KpiTone, string> = {
  default: "bg-foreground/70",
  info: "bg-sky-500 dark:bg-sky-400",
  success: "bg-emerald-600 dark:bg-emerald-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  danger: "bg-destructive",
};

const TONE_SPARK_CLASSES: Record<KpiTone, string> = {
  default: "text-muted-foreground",
  info: "text-sky-600 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
};

function resolveProgress(progress: KpiProgress | undefined) {
  if (progress === undefined) return null;
  const rawValue = typeof progress === "number" ? progress : progress.value;
  const max = typeof progress === "number" ? 1 : (progress.max ?? 1);
  if (!Number.isFinite(rawValue) || !Number.isFinite(max) || max <= 0) return null;
  const ratio = Math.min(1, Math.max(0, rawValue / max));
  const percent = Math.round(ratio * 100);
  const label = typeof progress === "number" ? undefined : progress.label;
  return { percent, label };
}

/**
 * Single metric card. Purely presentational: computation and formatting belong
 * to the screen, so the same block serves percentages, counts, and Money.
 */
export function KpiCard({
  label,
  value,
  trend,
  hint,
  icon,
  tone = "default",
  progress,
  sparkline,
  size = "sm",
  active = false,
  onClick,
  className,
}: KpiCardProps) {
  const direction = trend ? Math.sign(trend.value) : 0;
  const resolvedProgress = resolveProgress(progress);
  const sparkTone: KpiTone =
    tone !== "default" ? tone : direction > 0 ? "success" : direction < 0 ? "danger" : "default";

  const surfaceClassName = cn(
    "group/kpi-card flex w-full flex-col justify-between gap-2 overflow-hidden border border-transparent bg-card text-start text-sm text-card-foreground shadow-[0_1px_2px_0_oklch(0_0_0/0.04),inset_0_1px_0_0_oklch(1_0_0/0.04)] ring-1 ring-foreground/10 transition-[background-color,box-shadow]",
    "group-data-[variant=strip]/kpi-grid:border-0 group-data-[variant=strip]/kpi-grid:bg-card group-data-[variant=strip]/kpi-grid:shadow-none group-data-[variant=strip]/kpi-grid:ring-0",
    onClick &&
      "cursor-pointer select-none hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring group-data-[variant=cards]/kpi-grid:hover:ring-foreground/20",
    active &&
      "bg-accent/45 shadow-[inset_0_-2px_0_0_var(--primary)] group-data-[variant=cards]/kpi-grid:ring-primary/45 group-data-[variant=strip]/kpi-grid:bg-accent/45 group-data-[variant=strip]/kpi-grid:shadow-[inset_0_-2px_0_0_var(--primary)]",
    SIZE_CLASSES[size],
    className,
  );

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          data-slot="kpi-label"
          className="text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {label}
        </span>
        {icon ? (
          <span
            data-slot="kpi-icon"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center border [&>svg]:size-3.5",
              TONE_ICON_CLASSES[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <div
            data-slot="kpi-value"
            className="font-sans text-2xl leading-none font-semibold tracking-tight text-card-foreground tabular-nums"
          >
            {value}
          </div>
          {trend ? (
            <span
              data-slot="kpi-trend"
              className={cn(
                "inline-flex items-center gap-0.5 border px-1.5 py-0.5 text-[0.6875rem] leading-none font-medium tabular-nums",
                direction > 0 &&
                  "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                direction < 0 && "border-destructive/20 bg-destructive/10 text-destructive",
                direction === 0 && "border-border bg-muted text-muted-foreground",
              )}
            >
              <TrendIcon direction={direction} />
              {formatPercent(trend.value, { signDisplay: "exceptZero" })}
            </span>
          ) : null}
        </div>

        {sparkline && sparkline.length >= 2 ? (
          <KpiSparkline values={sparkline} className={TONE_SPARK_CLASSES[sparkTone]} />
        ) : null}
      </div>

      {resolvedProgress || trend?.label || hint ? (
        <div className="flex flex-col gap-1.5">
          {resolvedProgress ? (
            <div
              role="progressbar"
              aria-valuenow={resolvedProgress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                resolvedProgress.label ?? (typeof label === "string" ? label : "Progress")
              }
              className="h-1 w-full overflow-hidden bg-muted"
            >
              <div
                className={cn("h-full transition-[width] duration-300", TONE_BAR_CLASSES[tone])}
                style={{ width: `${resolvedProgress.percent}%` }}
              />
            </div>
          ) : null}
          {trend?.label || hint ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-snug text-muted-foreground">
              {trend?.label ? <span>{trend.label}</span> : null}
              {hint ? <span>{hint}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-slot="card"
        data-size={size}
        data-active={active || undefined}
        aria-pressed={active}
        onClick={onClick}
        className={surfaceClassName}
      >
        {body}
      </button>
    );
  }

  return (
    <div data-slot="card" data-size={size} className={surfaceClassName}>
      {body}
    </div>
  );
}

function KpiSparkline({ values, className }: { values: readonly number[]; className?: string }) {
  const gradientId = React.useId();
  const clean = values.filter((n) => Number.isFinite(n));
  if (clean.length < 2) return null;

  const width = 56;
  const height = 22;
  const padY = 2.5;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;

  const points = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = height - padY - ((value - min) / span) * (height - padY * 2);
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const last = points[points.length - 1]!;
  const areaPath = `${linePath} L${last.x},${height} L0,${height} Z`;

  return (
    <svg
      data-slot="kpi-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2} fill="currentColor" />
    </svg>
  );
}

function TrendIcon({ direction }: { direction: number }) {
  const className = "size-3";
  if (direction > 0) return <ArrowUpRightIcon className={className} aria-hidden />;
  if (direction < 0) return <ArrowDownRightIcon className={className} aria-hidden />;
  return <ArrowRightIcon className={className} aria-hidden />;
}

type KpiGridProps = {
  children: React.ReactNode;
  /** `"cards"` renders separated tiles; `"strip"` joins them inside one divided bar. */
  variant?: "cards" | "strip";
  className?: string;
};

/** Responsive KPI row: one column on phones, up to four on wide screens. */
export function KpiGrid({ children, variant = "cards", className }: KpiGridProps) {
  return (
    <div
      data-slot="kpi-grid"
      data-variant={variant}
      className={cn(
        "group/kpi-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
        variant === "cards"
          ? "gap-3"
          : "gap-px border border-border/80 bg-border/70 shadow-[0_1px_2px_0_oklch(0_0_0/0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
