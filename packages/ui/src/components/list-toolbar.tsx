import { useCallback, useId, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "cn";
import { ArrowUpDownIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

import {
  ActiveFilterChips,
  type ActiveFilterChip,
} from "@monorepo-boilerplate/ui/components/active-filter-chips";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@monorepo-boilerplate/ui/components/drawer";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@monorepo-boilerplate/ui/components/input-group";
import { RadioGroup, RadioGroupItem } from "@monorepo-boilerplate/ui/components/radio-group";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

function assignInputRef(ref: Ref<HTMLInputElement> | undefined, node: HTMLInputElement | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref && typeof ref === "object") {
    ref.current = node;
  }
}

export type ListToolbarFilterSheet = {
  /** Number of active non-default filters, shown as a badge on the mobile Filter button. */
  activeCount?: number;
  title?: string;
  description?: string;
  /** Filter controls inside the mobile bottom sheet. Falls back to `filters` if omitted. */
  content?: ReactNode;
  onReset?: () => void;
  resetDisabled?: boolean;
  resetLabel?: string;
};

export type ListToolbarSortOption = {
  id: string;
  label: string;
};

export type ListToolbarSortValue = {
  id: string;
  desc: boolean;
};

export type ListToolbarSortSheet = {
  options: readonly ListToolbarSortOption[];
  value?: ListToolbarSortValue;
  defaultValue?: ListToolbarSortValue;
  onChange: (next: ListToolbarSortValue) => void;
  title?: string;
  description?: string;
};

export function ListToolbar({
  search,
  filters,
  filterSheet,
  sortSheet,
  activeFilters,
  onClearFilters,
  hasActiveFilters,
  clearFiltersLabel = "Clear filters",
  actions,
  resultLabel,
  isFetching,
}: {
  search: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    inputRef?: Ref<HTMLInputElement>;
  };
  filters?: ReactNode;
  /** Enables a mobile Filter button that opens a bottom-sheet Drawer instead of rendering filters inline. */
  filterSheet?: ListToolbarFilterSheet;
  /** Enables a mobile Sort button that opens a bottom-sheet Drawer beside Filters. */
  sortSheet?: ListToolbarSortSheet;
  /**
   * Enables two-tier toolbar mode: when non-empty, renders `ActiveFilterChips`
   * + Clear filters + `resultLabel` on Row 2. When empty, Row 2 stays hidden.
   */
  activeFilters?: readonly ActiveFilterChip[];
  /** Clears all active filters (e.g. search and filter controls). */
  onClearFilters?: () => void;
  /** Controls visibility of the Clear filters button. Defaults to active search or `filterSheet.activeCount > 0`. */
  hasActiveFilters?: boolean;
  /** Text for the Clear filters button. Defaults to `"Clear filters"`. */
  clearFiltersLabel?: string;
  /** Trailing controls, rendered after the result label. */
  actions?: ReactNode;
  /** Result count or summary; renders the fetching spinner beside it. */
  resultLabel?: string;
  /**
   * Shows a spinner beside `resultLabel` while a request is in flight. Without
   * a label there is no text to pair it with, so nothing is rendered: a lone
   * spinner used to add a wrapped line to this flex row and push the content
   * below it down on every fetch.
   */
  isFetching?: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortFieldIdPrefix = useId();
  const internalSearchRef = useRef<HTMLInputElement | null>(null);
  const externalSearchRef = search.inputRef;
  const setSearchInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      internalSearchRef.current = node;
      assignInputRef(externalSearchRef, node);
    },
    [externalSearchRef],
  );

  const sheetContent = filterSheet?.content ?? filters;
  const hasMobileSheet = Boolean(filterSheet && sheetContent);
  const hasMobileSort = Boolean(sortSheet && sortSheet.options.length > 0);
  const activeCount = filterSheet?.activeCount ?? 0;
  const showClearSearch = search.value.length > 0;
  const isFilterActive = hasActiveFilters ?? (showClearSearch || activeCount > 0);
  const twoTierMode = activeFilters !== undefined;
  const hasRow2Chips = twoTierMode && activeFilters.length > 0;
  const activeSortId =
    sortSheet?.value?.id ?? sortSheet?.defaultValue?.id ?? sortSheet?.options[0]?.id ?? "";
  const activeSortDesc = sortSheet?.value?.desc ?? sortSheet?.defaultValue?.desc ?? false;
  const isCustomSort = Boolean(
    sortSheet?.value &&
    sortSheet.defaultValue &&
    (sortSheet.value.id !== sortSheet.defaultValue.id ||
      sortSheet.value.desc !== sortSheet.defaultValue.desc),
  );

  return (
    <div data-slot="list-toolbar" className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <InputGroup className="min-w-0 flex-1 sm:max-w-xs">
          <InputGroupInput
            ref={setSearchInputRef}
            type="search"
            aria-label={search.label}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            className="[&::-webkit-search-cancel-button]:hidden"
          />
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          {showClearSearch ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                data-slot="list-toolbar-search-clear"
                aria-label={`Clear ${search.label}`}
                onClick={() => {
                  search.onChange("");
                  internalSearchRef.current?.focus();
                }}
              >
                <XIcon aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        {filters && (
          <div
            className={cn(
              "items-center gap-2",
              hasMobileSheet ? "hidden sm:flex sm:flex-wrap" : "flex flex-wrap",
            )}
          >
            {filters}
          </div>
        )}

        {hasMobileSheet && (
          <div className="sm:hidden">
            <Button
              type="button"
              variant="outline"
              size="lg"
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"}
              className={cn("px-3", activeCount > 0 && "border-primary/40")}
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontalIcon aria-hidden />
              <span className="sr-only">Filters</span>
              {activeCount > 0 ? (
                <Badge className="bg-primary px-1.5 py-0 text-[10px] text-primary-foreground">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>

            <Drawer
              open={filterOpen}
              onOpenChange={setFilterOpen}
              swipeDirection="down"
              showSwipeHandle
            >
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>{filterSheet?.title ?? "Filters"}</DrawerTitle>
                  {filterSheet?.description ? (
                    <DrawerDescription>{filterSheet.description}</DrawerDescription>
                  ) : null}
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
                  {sheetContent}
                </div>
                <DrawerFooter className="flex-row gap-2 border-t pt-3">
                  {filterSheet?.onReset ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={filterSheet.resetDisabled}
                      onClick={filterSheet.onReset}
                    >
                      {filterSheet.resetLabel ?? "Clear filters"}
                    </Button>
                  ) : null}
                  <Button type="button" className="flex-1" onClick={() => setFilterOpen(false)}>
                    Done
                  </Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>
        )}

        {hasMobileSort && sortSheet && (
          <div className="sm:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-haspopup="dialog"
              aria-expanded={sortOpen}
              aria-label="Sort"
              data-slot="list-toolbar-sort-trigger"
              className={cn("relative", isCustomSort && "border-primary/40")}
              onClick={() => setSortOpen(true)}
            >
              <ArrowUpDownIcon aria-hidden />
              {isCustomSort ? (
                <span
                  aria-hidden
                  className="absolute top-1 end-1 size-1.5 rounded-full bg-primary"
                />
              ) : null}
            </Button>

            <Drawer
              open={sortOpen}
              onOpenChange={setSortOpen}
              swipeDirection="down"
              showSwipeHandle
            >
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>{sortSheet.title ?? "Sort by"}</DrawerTitle>
                  {sortSheet.description ? (
                    <DrawerDescription>{sortSheet.description}</DrawerDescription>
                  ) : null}
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-3">
                  <FieldSet>
                    <FieldLegend variant="label">Field</FieldLegend>
                    <RadioGroup
                      value={activeSortId}
                      onValueChange={(value) => {
                        if (typeof value === "string" && value) {
                          sortSheet.onChange({ id: value, desc: activeSortDesc });
                        }
                      }}
                      className="grid gap-2"
                    >
                      {sortSheet.options.map((option) => {
                        const optionId = `${sortFieldIdPrefix}-field-${option.id}`;
                        return (
                          <FieldLabel key={option.id} htmlFor={optionId}>
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>{option.label}</FieldTitle>
                              </FieldContent>
                              <RadioGroupItem id={optionId} value={option.id} />
                            </Field>
                          </FieldLabel>
                        );
                      })}
                    </RadioGroup>
                  </FieldSet>

                  <FieldSet>
                    <FieldLegend variant="label">Order</FieldLegend>
                    <RadioGroup
                      value={activeSortDesc ? "desc" : "asc"}
                      onValueChange={(value) => {
                        if (value === "asc" || value === "desc") {
                          sortSheet.onChange({ id: activeSortId, desc: value === "desc" });
                        }
                      }}
                      className="grid gap-2"
                    >
                      {[
                        { value: "asc", label: "Ascending (A–Z, low–high, oldest)" },
                        { value: "desc", label: "Descending (Z–A, high–low, newest)" },
                      ].map((dirOption) => {
                        const optionId = `${sortFieldIdPrefix}-dir-${dirOption.value}`;
                        return (
                          <FieldLabel key={dirOption.value} htmlFor={optionId}>
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>{dirOption.label}</FieldTitle>
                              </FieldContent>
                              <RadioGroupItem id={optionId} value={dirOption.value} />
                            </Field>
                          </FieldLabel>
                        );
                      })}
                    </RadioGroup>
                  </FieldSet>
                </div>
                <DrawerFooter className="flex-row gap-2 border-t pt-3">
                  {sortSheet.defaultValue ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={!isCustomSort}
                      onClick={() => sortSheet.onChange(sortSheet.defaultValue!)}
                    >
                      Reset
                    </Button>
                  ) : null}
                  <Button type="button" className="flex-1" onClick={() => setSortOpen(false)}>
                    Done
                  </Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>
        )}

        {!twoTierMode && onClearFilters && isFilterActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-slot="list-toolbar-clear-filters"
            onClick={onClearFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon data-icon="inline-start" aria-hidden />
            {clearFiltersLabel}
          </Button>
        ) : null}

        {!hasRow2Chips && resultLabel ? (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground tabular-nums sm:ms-auto sm:flex">
            {isFetching && <Spinner aria-hidden />}
            {resultLabel}
          </span>
        ) : null}

        {actions && (
          <div
            data-slot="list-toolbar-actions"
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-2",
              (hasRow2Chips || !resultLabel) && "ms-auto",
            )}
          >
            {actions}
          </div>
        )}
      </div>

      {hasRow2Chips ? (
        <ActiveFilterChips
          chips={activeFilters}
          onClearAll={onClearFilters}
          clearAllLabel={clearFiltersLabel}
          resultLabel={resultLabel}
          isFetching={isFetching}
        />
      ) : null}
    </div>
  );
}
