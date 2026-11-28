import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@monorepo-boilerplate/ui/components/avatar";
import { columnsFor } from "@monorepo-boilerplate/ui/components/data-table";
import type { DataTableViewColumn } from "@monorepo-boilerplate/ui/components/data-table-view-options";
import { RowActions, type RowActionItem } from "@monorepo-boilerplate/ui/components/row-actions";
import { StatusBadge } from "@monorepo-boilerplate/ui/components/status-badge";
import { formatDate, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { ArchiveIcon, EyeIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { CUSTOMER_STATUS_META } from "@/components/customers/customer-detail-timeline";
import type { CustomerRowAction } from "@/components/customers/customer-list-lifecycle";
import { assetUrl } from "@/lib/asset-url";
import type { CustomerStatusValue } from "@/lib/use-data-table-search-params";

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: CustomerStatusValue;
  balanceMinor: number;
  currency: string;
  avatarUrl: string | null;
  tags: string[];
  createdAt: Date | string;
};

export const CUSTOMER_VIEW_COLUMNS: readonly DataTableViewColumn[] = [
  { id: "name", label: "Customer" },
  { id: "company", label: "Company" },
  { id: "status", label: "Status" },
  { id: "balanceMinor", label: "Balance" },
  { id: "createdAt", label: "Created" },
];

export type CustomerColumnActions = {
  onViewCustomer: (id: string) => void;
  onEditCustomer: (id: string) => void;
  renderCustomerLink: (props: {
    customerId: string;
    className: string;
    children: ReactNode;
  }) => ReactNode;
};

const helper = columnsFor<CustomerRow>();

export function customerListColumns({
  scope,
  disabled,
  canDelete,
  onLifecycle,
  onViewCustomer,
  onEditCustomer,
  renderCustomerLink,
}: CustomerColumnActions & {
  scope: string;
  disabled: boolean;
  canDelete: boolean;
  onLifecycle: (kind: CustomerRowAction, id: string) => void;
}) {
  return helper.columns([
    helper.accessor("name", {
      header: "Customer",
      cell: (info) => {
        const row = info.row.original;
        const resolvedAvatar = assetUrl(row.avatarUrl);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar>
              {resolvedAvatar ? <AvatarImage src={resolvedAvatar} alt={row.name} /> : null}
              <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              {renderCustomerLink({
                customerId: row.id,
                className: "w-fit font-medium hover:underline",
                children: row.name,
              })}
              <span className="truncate text-xs text-muted-foreground">{row.email}</span>
            </div>
          </div>
        );
      },
    }),
    helper.accessor("company", {
      header: "Company",
      cell: (info) => info.getValue() ?? "—",
    }),
    helper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        const meta = CUSTOMER_STATUS_META[status];
        return (
          <StatusBadge tone={meta.tone} dot>
            {meta.label}
          </StatusBadge>
        );
      },
    }),
    helper.accessor("balanceMinor", {
      header: "Balance",
      cell: (info) => (
        <span className={info.getValue() < 0 ? "tabular-nums text-destructive" : "tabular-nums"}>
          {formatMoney({ minor: info.getValue(), currency: info.row.original.currency })}
        </span>
      ),
    }),
    helper.accessor("createdAt", {
      header: "Created",
      cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableHiding: false,
      enablePinning: false,
      cell: ({ row: { original: row } }) => {
        const archived = row.status === "archived";
        const items: RowActionItem[] = [
          { id: "view", label: "View", icon: <EyeIcon />, onSelect: () => onViewCustomer(row.id) },
          {
            id: "edit",
            label: "Edit",
            icon: <PencilIcon />,
            onSelect: () => onEditCustomer(row.id),
          },
          {
            id: archived ? "restore" : "archive",
            label: archived ? "Restore" : "Archive",
            icon: archived ? <RotateCcwIcon /> : <ArchiveIcon />,
            separatorBefore: true,
            onSelect: () => onLifecycle(archived ? "restore" : "archive", row.id),
          },
        ];
        if (canDelete)
          items.push({
            id: "delete",
            label: "Delete",
            icon: <Trash2Icon />,
            variant: "destructive",
            separatorBefore: true,
            onSelect: () => onLifecycle("delete", row.id),
          });
        return (
          <RowActions
            key={JSON.stringify([scope, row.id])}
            label={`Actions for ${row.name}`}
            items={items}
            disabled={disabled}
          />
        );
      },
    }),
  ]);
}
