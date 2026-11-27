import type { AppRouter } from "@monorepo-boilerplate/api/routers/index";
import type { ActivityTimelineItem } from "@monorepo-boilerplate/ui/components/activity-timeline";
import type { StatusBadgeTone } from "@monorepo-boilerplate/ui/components/status-badge";
import type { TRPCClient } from "@trpc/client";
import {
  ArchiveIcon,
  ImageIcon,
  MessageSquareIcon,
  PencilIcon,
  PlusCircleIcon,
  RotateCcwIcon,
} from "lucide-react";
import type * as React from "react";

import { assetUrl } from "@/lib/asset-url";

type ApiCustomerDetail = NonNullable<
  Awaited<ReturnType<TRPCClient<AppRouter>["customers"]["byId"]["query"]>>
>;
type ApiCustomerEvent = Awaited<
  ReturnType<TRPCClient<AppRouter>["customers"]["events"]["list"]["query"]>
>[number];

export type CustomerDetailRecord = Omit<ApiCustomerDetail, "tags" | "createdAt" | "updatedAt"> & {
  tags: readonly string[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type CustomerEventType = ApiCustomerEvent["type"];

export type CustomerEventRecord = Omit<ApiCustomerEvent, "createdAt"> & {
  createdAt: Date | string;
};

export const CUSTOMER_STATUS_META: Record<
  CustomerDetailRecord["status"],
  { label: string; tone: StatusBadgeTone }
> = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  archived: { label: "Archived", tone: "warning" },
};

/**
 * Exhaustive icon/badge map over the API-inferred `CustomerEventType`. Adding a
 * new DB event kind fails `tsc --noEmit` until its icon and tone are mapped.
 */
const CUSTOMER_EVENT_META: Record<
  CustomerEventType,
  { icon: React.ReactNode; iconClassName: string }
> = {
  created: {
    icon: <PlusCircleIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-success/25 bg-success-subtle text-success-subtle-foreground",
  },
  updated: {
    icon: <PencilIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-info/25 bg-info-subtle text-info-subtle-foreground",
  },
  archived: {
    icon: <ArchiveIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-warning/25 bg-warning-subtle text-warning-subtle-foreground",
  },
  restored: {
    icon: <RotateCcwIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-success/25 bg-success-subtle text-success-subtle-foreground",
  },
  avatar_updated: {
    icon: <ImageIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-border bg-muted text-muted-foreground",
  },
  avatar_removed: {
    icon: <ImageIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-border bg-muted text-muted-foreground",
  },
  note: {
    icon: <MessageSquareIcon className="size-3.5" aria-hidden="true" />,
    iconClassName: "border-info/25 bg-info-subtle text-info-subtle-foreground",
  },
};

export function toTimelineItems(events: readonly CustomerEventRecord[]): ActivityTimelineItem[] {
  return events.map((event) => {
    const meta = CUSTOMER_EVENT_META[event.type];
    return {
      id: event.id,
      type: event.type,
      icon: meta.icon,
      iconClassName: meta.iconClassName,
      title: event.summary,
      description: event.body ?? undefined,
      actor: event.actorName
        ? {
            name: event.actorName,
            avatarUrl: assetUrl(event.actorAvatarUrl),
          }
        : undefined,
      timestamp: event.createdAt,
      metadata: event.metadata ?? undefined,
    };
  });
}
