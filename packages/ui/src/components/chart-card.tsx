import type * as React from "react";
import { cn } from "cn";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import { ChartContainer, type ChartConfig } from "@monorepo-boilerplate/ui/components/chart";

type ChartCardProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Chart configuration: series labels and colors, passed through to ChartContainer. */
  config: ChartConfig;
  /** The Recharts tree, e.g. `<AreaChart ...>`; receives the container's height. */
  children: React.ComponentProps<typeof ChartContainer>["children"];
  actions?: React.ReactNode;
  className?: string;
  /** CSS height for the plot area. Defaults to 260px. */
  height?: string;
};

/**
 * Chart framed in a card with a title and legend slot. Colors come from the
 * `--chart-*` design tokens, so it follows the theme in light and dark mode.
 */
export function ChartCard({
  title,
  description,
  config,
  children,
  actions,
  className,
  height = "260px",
}: ChartCardProps) {
  return (
    <Card className={cn("gap-4", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="w-full" style={{ height }}>
          {children}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
