import { useState, type ReactNode, type Ref } from "react";
import { cn } from "cn";
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react";

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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@monorepo-boilerplate/ui/components/input-group";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export type ListToolbarFilterSheet = {
  /** Number of active non-default filters, shown as a badge on the mobile Filter button. */
  activeCount?: number;
  title?: string;
  description?: string;
  /** Filter controls inside the mobile bottom sheet. Falls back to `filters` if omitted. */
  content?: ReactNode;
  onReset?: () => void;
  resetDisabled?: boolean;
};

export function ListToolbar({
  search,
  filters,
  filterSheet,
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
  /** Trailing controls, rendered after the result label. */
  actions?: ReactNode;
  resultLabel?: string;
  isFetching?: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const sheetContent = filterSheet?.content ?? filters;
  const hasMobileSheet = Boolean(filterSheet && sheetContent);
  const activeCount = filterSheet?.activeCount ?? 0;

  return (
    <div data-slot="list-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
      <InputGroup className="min-w-0 flex-1 sm:max-w-xs">
        <InputGroupInput
          ref={search.inputRef}
          type="search"
          aria-label={search.label}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
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
            size="sm"
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontalIcon data-icon="inline-start" aria-hidden />
            Filters
            {activeCount > 0 ? (
              <Badge className="ms-0.5 bg-primary px-1.5 py-0 text-[10px] text-primary-foreground">
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
                    Reset
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

      {(resultLabel || isFetching) && (
        <span className="flex w-full items-center gap-1.5 text-xs text-muted-foreground tabular-nums sm:ms-auto sm:w-auto">
          {isFetching && <Spinner aria-hidden />}
          {resultLabel}
        </span>
      )}

      {actions && (
        <div data-slot="list-toolbar-actions" className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
