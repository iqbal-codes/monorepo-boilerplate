import type * as React from "react";
import { cn } from "cn";
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";

export type KpiTrend = {
  /** Fraction: 0.12 renders as +12%. Negative renders as a decline. */
  value: number;
  /** What the change is measured against, e.g. "vs last month". */
  label?: string;
};

type KpiCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  trend?: KpiTrend;
  /** Small context line under the value, e.g. "of 53 customers". */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

/**
 * Single metric card. Purely presentational: computation and formatting belong
 * to the screen, so the same block serves percentages, counts, and Money.
 */
export function KpiCard({ label, value, trend, hint, icon, className }: KpiCardProps) {
  const direction = trend ? Math.sign(trend.value) : 0;

  return (
    <Card className={cn("gap-0", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardDescription className="text-xs font-medium tracking-wide uppercase">
          {label}
        </CardDescription>
        {icon ? <span className="text-muted-foreground [&>svg]:size-4">{icon}</span> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {trend ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendIcon direction={direction} />
            <span
              className={cn(
                "font-medium tabular-nums",
                direction > 0 && "text-emerald-600 dark:text-emerald-400",
                direction < 0 && "text-destructive",
              )}
            >
              {formatTrend(trend.value)}
            </span>
            {trend.label ? <span>{trend.label}</span> : null}
          </p>
        ) : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatTrend(value: number): string {
  const percent = new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);
  return percent;
}

function TrendIcon({ direction }: { direction: number }) {
  const className = "size-3";
  if (direction > 0) return <ArrowUpRightIcon className={className} aria-hidden />;
  if (direction < 0) return <ArrowDownRightIcon className={className} aria-hidden />;
  return <ArrowRightIcon className={className} aria-hidden />;
}

type KpiGridProps = {
  children: React.ReactNode;
  className?: string;
};

/** Responsive KPI row: one column on phones, up to four on wide screens. */
export function KpiGrid({ children, className }: KpiGridProps) {
  return (
    <div
      data-slot="kpi-grid"
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {children}
    </div>
  );
}
