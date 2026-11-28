import * as React from "react";
import { cn } from "cn";
import { PanelLeftIcon, PanelRightIcon, RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import type {
  ColumnPinningState,
  ColumnVisibilityState,
  DataTableDensity,
} from "@monorepo-boilerplate/ui/components/data-table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";

export type DataTableViewColumn = {
  id: string;
  label: string;
  canHide?: boolean;
  canPin?: boolean;
};

export type { DataTableDensity };
export type DataTableColumnVisibility = ColumnVisibilityState;
export type DataTableColumnPinning = ColumnPinningState;

export type DataTableViewOptionsProps = {
  columns: readonly DataTableViewColumn[];
  columnVisibility: DataTableColumnVisibility;
  onColumnVisibilityChange: (next: DataTableColumnVisibility) => void;
  columnPinning?: DataTableColumnPinning;
  onColumnPinningChange?: (next: DataTableColumnPinning) => void;
  density?: DataTableDensity;
  onDensityChange?: (density: DataTableDensity) => void;
  onReset?: () => void;
  label?: string;
  className?: string;
};

/**
 * Controlled DataTable view-options popover: column visibility toggles (with an
 * at-least-one-visible guard), left/right column pinning, and density switch.
 */
export function DataTableViewOptions({
  columns,
  columnVisibility,
  onColumnVisibilityChange,
  columnPinning,
  onColumnPinningChange,
  density,
  onDensityChange,
  onReset,
  label = "View",
  className,
}: DataTableViewOptionsProps) {
  const [open, setOpen] = React.useState(false);

  const visibleCount = columns.filter((col) => columnVisibility[col.id] !== false).length;

  function toggleVisibility(column: DataTableViewColumn) {
    const isVisible = columnVisibility[column.id] !== false;
    if (isVisible && (column.canHide === false || visibleCount <= 1)) {
      return;
    }
    onColumnVisibilityChange({
      ...columnVisibility,
      [column.id]: !isVisible,
    });
  }

  function getPinSide(columnId: string): "start" | "end" | false {
    if (columnPinning?.start.includes(columnId)) return "start";
    if (columnPinning?.end.includes(columnId)) return "end";
    return false;
  }

  function togglePin(columnId: string, side: "start" | "end") {
    if (!columnPinning || !onColumnPinningChange) return;
    const current = getPinSide(columnId);
    const nextStart = columnPinning.start.filter((id) => id !== columnId);
    const nextEnd = columnPinning.end.filter((id) => id !== columnId);
    if (current !== side) {
      if (side === "start") nextStart.push(columnId);
      else nextEnd.push(columnId);
    }
    onColumnPinningChange({ start: nextStart, end: nextEnd });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={label}
            data-slot="data-table-view-options-trigger"
            className={cn("h-8", className)}
          />
        }
      >
        <SlidersHorizontalIcon data-icon="inline-start" aria-hidden="true" />
        <span className="hidden sm:inline">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        {density && onDensityChange ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Density
            </span>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[density]}
              onValueChange={(next) => {
                const selected = next.at(-1);
                if (selected === "comfortable" || selected === "compact") {
                  onDensityChange(selected);
                }
              }}
              className="w-full"
              aria-label="Row density"
            >
              <ToggleGroupItem value="comfortable" className="h-8 flex-1 px-3 text-xs">
                Comfortable
              </ToggleGroupItem>
              <ToggleGroupItem value="compact" className="h-8 flex-1 px-3 text-xs">
                Compact
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}

        {density && onDensityChange && columns.length > 0 ? <Separator /> : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Columns
            </span>
            {onReset ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onReset}
                className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                Reset
              </Button>
            ) : null}
          </div>

          <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
            {columns.map((column) => {
              const isVisible = columnVisibility[column.id] !== false;
              const isLockedVisible = column.canHide === false || (isVisible && visibleCount <= 1);
              const pinSide = getPinSide(column.id);
              const showPinControls = Boolean(
                columnPinning && onColumnPinningChange && column.canPin !== false,
              );

              return (
                <div
                  key={column.id}
                  data-slot="data-table-view-column"
                  className="flex items-center justify-between gap-2 px-1 py-1"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      aria-label={`Toggle ${column.label} column`}
                      aria-disabled={isLockedVisible || undefined}
                      checked={isVisible}
                      disabled={isLockedVisible}
                      onCheckedChange={() => toggleVisibility(column)}
                    />
                    <span className="truncate">{column.label}</span>
                  </label>

                  {showPinControls ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant={pinSide === "start" ? "secondary" : "ghost"}
                        size="icon-xs"
                        aria-label={`Pin ${column.label} left`}
                        aria-pressed={pinSide === "start"}
                        disabled={!isVisible && pinSide !== "start"}
                        onClick={() => togglePin(column.id, "start")}
                      >
                        <PanelLeftIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant={pinSide === "end" ? "secondary" : "ghost"}
                        size="icon-xs"
                        aria-label={`Pin ${column.label} right`}
                        aria-pressed={pinSide === "end"}
                        disabled={!isVisible && pinSide !== "end"}
                        onClick={() => togglePin(column.id, "end")}
                      >
                        <PanelRightIcon aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
