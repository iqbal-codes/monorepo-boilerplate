import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  NotificationCenter,
  type NotificationItem,
} from "@monorepo-boilerplate/ui/components/notification-center";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { useState } from "react";

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "INV-1021 payment settled",
    description: "ACH transfer cleared for $102.80.",
    timestamp: "4m ago",
    read: false,
    category: "Billing",
  },
  {
    id: "notif-2",
    title: "Saved view updated",
    description: "High value ($500+) threshold adjusted.",
    timestamp: "1h ago",
    read: false,
    category: "Workspace",
  },
  {
    id: "notif-3",
    title: "Weekly export completed",
    description: "23 invoice records archived cleanly.",
    timestamp: "Yesterday",
    read: true,
    category: "Exports",
  },
];

export function WorkspaceHeader({
  kpiVariant,
  setKpiVariant,
}: {
  kpiVariant: "cards" | "strip";
  setKpiVariant: (value: "cards" | "strip") => void;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  return (
    <PageHeader
      title="Blocks"
      description="Controlled DataTable, SavedViewBar, SplitView/DetailSheet, VirtualList, and Phase 1 inspection blocks. Deletable demo."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <NotificationCenter
            items={notifications}
            onMarkRead={(id) =>
              setNotifications((prev) =>
                prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
              )
            }
            onMarkAllRead={() =>
              setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
            }
          />
          <div
            className="inline-flex border border-border bg-card p-0.5"
            role="group"
            aria-label="KPI layout"
          >
            <Button
              type="button"
              size="xs"
              variant={kpiVariant === "cards" ? "secondary" : "ghost"}
              aria-pressed={kpiVariant === "cards"}
              onClick={() => setKpiVariant("cards")}
            >
              Cards
            </Button>
            <Button
              type="button"
              size="xs"
              variant={kpiVariant === "strip" ? "secondary" : "ghost"}
              aria-pressed={kpiVariant === "strip"}
              onClick={() => setKpiVariant("strip")}
            >
              Strip
            </Button>
          </div>
        </div>
      }
    />
  );
}
