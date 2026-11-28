import { ActivityTimeline } from "@monorepo-boilerplate/ui/components/activity-timeline";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";
import { DescriptionList } from "@monorepo-boilerplate/ui/components/description-list";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import {
  StatusScreen,
  type StatusScreenStatus,
} from "@monorepo-boilerplate/ui/components/status-screen";
import { formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { INITIAL_TIMELINE } from "./-blocks-invoice-data";

export function InspectionPreview() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>StatusBadge, CopyButton &amp; DescriptionList</CardTitle>
        <CardDescription>
          Semantic OKLCH status pills, clipboard copy feedback, and structured metadata grid.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="neutral" dot>
            Neutral
          </StatusBadge>
          <StatusBadge tone="info" dot>
            Info
          </StatusBadge>
          <StatusBadge tone="success" dot>
            Success
          </StatusBadge>
          <StatusBadge tone="warning" dot>
            Warning
          </StatusBadge>
          <StatusBadge tone="danger" dot>
            Danger
          </StatusBadge>
          <CopyButton value="cus_01JDEMO9X2" label="Copy customer token" variant="outline">
            cus_01JDEMO9X2
          </CopyButton>
        </div>

        <DescriptionList
          columns={2}
          items={[
            { label: "Organization", value: "Analytical Engines Ltd." },
            { label: "Environment ID", value: "env_prod_04", copyValue: "env_prod_04" },
            {
              label: "Monthly volume",
              value: formatMoney({ minor: 482_500, currency: "USD" }),
              numeric: true,
            },
            { label: "Optional external ref", value: "" },
          ]}
        />

        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            ActivityTimeline
          </p>
          <ActivityTimeline items={INITIAL_TIMELINE} />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatusScreenPreview() {
  const [statusPreview, setStatusPreview] = useState<StatusScreenStatus>("404");
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>StatusScreen Previews</CardTitle>
          <CardDescription>
            Controlled 403 / 404 / 500 error views with recovery actions and collapsible technical
            details.
          </CardDescription>
        </div>
        <div
          className="inline-flex border border-border bg-card p-0.5"
          role="group"
          aria-label="Status screen code"
        >
          {(["403", "404", "500"] as const).map((code) => (
            <Button
              key={code}
              type="button"
              size="xs"
              variant={statusPreview === code ? "secondary" : "ghost"}
              aria-pressed={statusPreview === code}
              onClick={() => setStatusPreview(code)}
            >
              {code}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="border border-border bg-muted/15">
          <StatusScreen
            status={statusPreview}
            layout="embedded"
            headingLevel="h2"
            primaryAction={
              <Button
                type="button"
                size="sm"
                onClick={() => toast.info(`Retry triggered for ${statusPreview}`)}
              >
                Try again
              </Button>
            }
            secondaryAction={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setStatusPreview("404")}
              >
                Reset preview
              </Button>
            }
            details={`Status: ${statusPreview}\nRoute: /demo/blocks\nRequestId: req_demo_019`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
