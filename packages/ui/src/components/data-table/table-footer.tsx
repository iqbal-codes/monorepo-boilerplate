import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { PaginationState } from "@tanstack/react-table";
import { cn } from "cn";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";

export function TableFooter({
  pageCount,
  currentIndex,
  currentSize,
  total,
  pageSizeOptions,
  canPreviousPage,
  canNextPage,
  onPaginationChange,
  bypassPagination,
  desktopOnly,
}: {
  pageCount: number;
  currentIndex: number;
  currentSize: number;
  total: number;
  pageSizeOptions: readonly number[];
  canPreviousPage: boolean;
  canNextPage: boolean;
  onPaginationChange?: (pagination: PaginationState) => void;
  bypassPagination: boolean;
  desktopOnly: boolean;
}) {
  const firstRow = total === 0 ? 0 : currentIndex * currentSize + 1;
  const lastRow = Math.min((currentIndex + 1) * currentSize, total);
  return !bypassPagination ? (
    <div
      className={cn(
        "flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground sm:gap-3 sm:text-sm",
        desktopOnly ? "hidden @lg:flex" : "flex",
      )}
    >
      <p aria-live="polite" className="tabular-nums">
        {total === 0 ? "No rows" : `${firstRow}–${lastRow} of ${total}`}
      </p>
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className="hidden sm:inline">Rows per page</span>
        <Select
          value={String(currentSize)}
          onValueChange={(value) => {
            const pageSize = Number(value);
            onPaginationChange?.({ pageIndex: 0, pageSize });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-16 border border-input px-2.5"
            aria-label="Rows per page"
          >
            <SelectValue>{(value) => String(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="px-2 sm:px-3"
          aria-label="Previous page"
          onClick={() =>
            onPaginationChange?.({ pageIndex: currentIndex - 1, pageSize: currentSize })
          }
          disabled={!canPreviousPage}
        >
          <ChevronLeftIcon className="sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <span className="px-1 tabular-nums">
          <span className="sm:hidden">
            {pageCount === 0 ? 0 : currentIndex + 1}/{pageCount}
          </span>
          <span className="hidden sm:inline">
            Page {pageCount === 0 ? 0 : currentIndex + 1} of {pageCount}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="px-2 sm:px-3"
          aria-label="Next page"
          onClick={() =>
            onPaginationChange?.({ pageIndex: currentIndex + 1, pageSize: currentSize })
          }
          disabled={!canNextPage}
        >
          <ChevronRightIcon className="sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Next</span>
        </Button>
      </div>
    </div>
  ) : (
    <div
      className={cn(
        "items-center justify-between px-1 text-xs text-muted-foreground sm:text-sm",
        desktopOnly ? "hidden @lg:flex" : "flex",
      )}
    >
      <p aria-live="polite" className="tabular-nums">
        {total === 0 ? "No rows" : `${total} virtualized rows`}
      </p>
    </div>
  );
}
