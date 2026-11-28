import { cn } from "cn";
import { XIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export type ActiveFilterChip = {
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
};

export type ActiveFilterChipsProps = {
  chips: readonly ActiveFilterChip[];
  onClearAll?: () => void;
  clearAllLabel?: string;
  resultLabel?: string;
  isFetching?: boolean;
  className?: string;
};

/**
 * Row 2 filter strip displaying dismissible active filter pills, a Clear all
 * button, and an optional trailing result count / fetching indicator.
 */
export function ActiveFilterChips({
  chips,
  onClearAll,
  clearAllLabel = "Clear filters",
  resultLabel,
  isFetching = false,
  className,
}: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div
      data-slot="active-filter-chips"
      role="region"
      aria-label="Active filters"
      className={cn("flex min-w-0 items-center gap-2 border-t border-border/60 pt-2", className)}
    >
      <div className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto sm:flex-wrap">
        {chips.map((chip) => (
          <span
            key={chip.id}
            data-slot="active-filter-chip"
            className="inline-flex min-h-6 shrink-0 items-center gap-1 border border-border bg-secondary ps-2 pe-0.5 text-xs whitespace-nowrap text-secondary-foreground"
          >
            <span className="text-muted-foreground">{chip.label}:</span>
            <span className="max-w-44 truncate font-medium sm:max-w-none">{chip.value}</span>
            <button
              type="button"
              aria-label={`Remove ${chip.label}: ${chip.value}`}
              onClick={chip.onRemove}
              className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <XIcon className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {onClearAll ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-slot="active-filter-chips-clear"
            onClick={onClearAll}
            className="hidden shrink-0 whitespace-nowrap text-muted-foreground hover:text-foreground sm:inline-flex"
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            {clearAllLabel}
          </Button>
        ) : null}
      </div>

      {resultLabel ? (
        <span className="ms-auto hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums sm:flex">
          {isFetching ? <Spinner aria-hidden="true" /> : null}
          {resultLabel}
        </span>
      ) : null}
    </div>
  );
}
