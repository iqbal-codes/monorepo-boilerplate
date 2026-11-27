"use client";

import * as React from "react";
import { cn } from "cn";

import { CopyButton } from "@monorepo-boilerplate/ui/components/copy-button";

export type DescriptionListItem = {
  /** Stable identifier for the row; defaults to index when omitted. */
  id?: string;
  /** Metadata field label rendered in `<dt>`. */
  label: React.ReactNode;
  /** Metadata value rendered in `<dd>`; falls back to `"—"` when null, undefined, or empty string. */
  value?: React.ReactNode;
  /** Optional raw string copied by a trailing `CopyButton`. */
  copyValue?: string;
  /** Accessible label for the copy button. */
  copyLabel?: string;
  /** Feedback label announced after copying. */
  copiedLabel?: string;
  /** Optional trailing action slot rendered at the end of `<dd>`. */
  action?: React.ReactNode;
  /** Applies `tabular-nums` alignment for currency, counts, or IDs. */
  numeric?: boolean;
  /** Optional column span inside multi-column grids. */
  span?: 1 | 2 | "full";
  /** Per-item fallback override when `value` is empty. */
  emptyFallback?: React.ReactNode;
};

export type DescriptionListProps = {
  items: readonly DescriptionListItem[];
  columns?: 1 | 2 | 3;
  emptyFallback?: React.ReactNode;
  className?: string;
};

const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

const SPAN_CLASSES: Record<1 | 2 | "full", string> = {
  1: "",
  2: "sm:col-span-2",
  full: "col-span-full",
};

function isEmptyValue(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Controlled, router-free `<dl>` metadata grid with `—` empty fallbacks,
 * optional `CopyButton`, `tabular-nums` formatting, and trailing action slots.
 */
export function DescriptionList({
  items,
  columns = 2,
  emptyFallback = "—",
  className,
}: DescriptionListProps) {
  return (
    <dl
      data-slot="description-list"
      className={cn("grid gap-x-6 gap-y-4", COLUMN_CLASSES[columns], className)}
    >
      {items.map((item, index) => {
        const empty = isEmptyValue(item.value);
        const displayValue = empty ? (item.emptyFallback ?? emptyFallback) : item.value;
        const resolvedCopyLabel =
          item.copyLabel ?? (typeof item.label === "string" ? `Copy ${item.label}` : "Copy value");

        return (
          <div
            key={item.id ?? index}
            data-slot="description-list-item"
            className={cn(
              "flex min-w-0 flex-col gap-1",
              item.span ? SPAN_CLASSES[item.span] : undefined,
            )}
          >
            <dt
              data-slot="description-list-term"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {item.label}
            </dt>
            <dd
              data-slot="description-list-details"
              className={cn(
                "flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground",
                item.numeric && "tabular-nums",
              )}
            >
              <span
                data-slot="description-list-value"
                className={cn("min-w-0 wrap-break-word", empty && "text-muted-foreground")}
              >
                {displayValue}
              </span>
              {item.copyValue ? (
                <CopyButton
                  value={item.copyValue}
                  label={resolvedCopyLabel}
                  copiedLabel={item.copiedLabel}
                  className="-my-1 shrink-0"
                />
              ) : null}
              {item.action ? (
                <span data-slot="description-list-action" className="ms-auto shrink-0">
                  {item.action}
                </span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
