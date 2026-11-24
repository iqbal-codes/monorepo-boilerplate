import { ChartCard } from "@monorepo-boilerplate/ui/components/chart-card";
import { KpiCard, KpiGrid } from "@monorepo-boilerplate/ui/components/kpi-card";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import {
  DEFAULT_CURRENCY,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@monorepo-boilerplate/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ActivityIcon, DollarSignIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardScreen,
  staticData: { pageTitle: "Dashboard" },
});

/**
 * Seeded shape for the illustrative chart. A real dashboard replaces this with
 * a query; it is here so the block has something to render on first run.
 */
const ACTIVITY = [
  { month: "Jul", signups: 14, active: 9 },
  { month: "Aug", signups: 21, active: 15 },
  { month: "Sep", signups: 17, active: 14 },
  { month: "Oct", signups: 29, active: 22 },
  { month: "Nov", signups: 33, active: 27 },
  { month: "Dec", signups: 41, active: 35 },
];

const chartConfig = {
  signups: { label: "Signups", color: "var(--chart-2)" },
  active: { label: "Active", color: "var(--chart-1)" },
} as const;

function DashboardScreen() {
  const stats = useQuery(trpc.customers.stats.queryOptions());

  const total = stats.data?.total;
  const active = stats.data?.active;
  const activeShare = total && total > 0 && active !== undefined ? active / total : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="KPI cards and a chart block, fed by the customers reference query."
      />

      <KpiGrid>
        <KpiCard
          label="Customers"
          icon={<UsersIcon />}
          value={total === undefined ? <Skeleton className="h-7 w-16" /> : formatNumber(total)}
          hint="Total rows in the reference table"
        />
        <KpiCard
          label="Active"
          icon={<UserCheckIcon />}
          value={active === undefined ? <Skeleton className="h-7 w-16" /> : formatNumber(active)}
          hint={
            activeShare === undefined ? undefined : `${formatPercent(activeShare)} of customers`
          }
        />
        <KpiCard
          label="Net balance"
          icon={<DollarSignIcon />}
          value={
            stats.data === undefined ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              formatMoney({ minor: stats.data.balanceMinor, currency: DEFAULT_CURRENCY })
            )
          }
          hint="Sum of integer minor units, never floats"
        />
        <KpiCard
          label="Activity"
          icon={<ActivityIcon />}
          value={formatNumber(ACTIVITY.reduce((sum, point) => sum + point.signups, 0))}
          trend={{ value: 0.24, label: "vs previous half" }}
          hint="Illustrative series, replace with a query"
        />
      </KpiGrid>

      <ChartCard title="Signups and activity" description="Last six months" config={chartConfig}>
        <AreaChart data={ACTIVITY} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
          <Area
            dataKey="signups"
            type="monotone"
            fill="var(--color-signups)"
            stroke="var(--color-signups)"
            fillOpacity={0.25}
          />
          <Area
            dataKey="active"
            type="monotone"
            fill="var(--color-active)"
            stroke="var(--color-active)"
            fillOpacity={0.4}
          />
        </AreaChart>
      </ChartCard>
    </div>
  );
}
