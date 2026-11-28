import * as React from "react";
import { cn } from "cn";
import { CheckIcon, PlusCircleIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@monorepo-boilerplate/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";

export type FacetedFilterOption = {
  label: string;
  value: string;
  count?: number;
  icon?: React.ReactNode;
  disabled?: boolean;
};

export type FacetedFilterProps = {
  title: string;
  options: readonly FacetedFilterOption[];
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  clearLabel?: string;
  /** Maximum inline badges shown on the trigger before collapsing to a count. */
  maxInlineBadges?: number;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Controlled searchable multi-select filter popover with per-option counts and
 * a compact selected-value summary on the trigger button.
 */
export function FacetedFilter({
  title,
  options,
  value,
  onValueChange,
  searchPlaceholder,
  emptyText = "No results found.",
  clearLabel = "Clear filters",
  maxInlineBadges = 2,
  searchable = true,
  disabled = false,
  className,
}: FacetedFilterProps) {
  const [open, setOpen] = React.useState(false);
  const selectedValues = React.useMemo(() => new Set(value), [value]);

  const selectedOptions = React.useMemo(
    () =>
      value.map((selected) => {
        const match = options.find((option) => option.value === selected);
        return { value: selected, label: match?.label ?? selected };
      }),
    [options, value],
  );

  function toggleOption(optionValue: string) {
    const next = new Set(selectedValues);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    onValueChange([...next]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            data-slot="faceted-filter-trigger"
            className={cn("h-8 border-dashed px-2.5", className)}
          />
        }
      >
        <PlusCircleIcon data-icon="inline-start" aria-hidden="true" />
        <span>{title}</span>
        {selectedValues.size > 0 ? (
          <>
            <Separator orientation="vertical" className="mx-1 h-4" />
            <Badge
              variant="secondary"
              className="border border-border bg-secondary px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-normal normal-case sm:hidden"
            >
              {selectedValues.size} selected
            </Badge>
            <div className="hidden items-center gap-1 sm:flex">
              {selectedValues.size > maxInlineBadges ? (
                <Badge
                  variant="secondary"
                  className="border border-border bg-secondary px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-normal normal-case"
                >
                  {selectedValues.size} selected
                </Badge>
              ) : (
                selectedOptions.map((option) => (
                  <Badge
                    key={option.value}
                    variant="secondary"
                    className="border border-border bg-secondary px-1.5 py-0.5 text-[0.6875rem] font-medium tracking-normal normal-case"
                  >
                    {option.label}
                  </Badge>
                ))
              )}
            </div>
          </>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          {searchable ? <CommandInput placeholder={searchPlaceholder ?? title} /> : null}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    keywords={[option.value]}
                    disabled={option.disabled}
                    data-selected-option={isSelected ? "true" : undefined}
                    onSelect={() => toggleOption(option.value)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center border border-input transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-transparent [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="size-3" />
                    </span>
                    {option.icon ? (
                      <span className="shrink-0 text-muted-foreground" aria-hidden="true">
                        {option.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                      {isSelected ? <span className="sr-only"> (selected)</span> : null}
                    </span>
                    {option.count !== undefined ? (
                      <span
                        data-slot="command-shortcut"
                        className="ml-auto font-mono text-xs text-muted-foreground tabular-nums"
                      >
                        {option.count}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__clear_filters__"
                    onSelect={() => onValueChange([])}
                    className="justify-center text-center"
                  >
                    <span className="w-full text-center">{clearLabel}</span>
                    <span data-slot="command-shortcut" className="hidden" />
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
