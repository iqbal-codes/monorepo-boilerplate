import type { ReactNode } from "react";

import { Button } from "@monorepo-boilerplate/ui/components/button";

export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="bulk-action-bar"
      className={
        count > 0 ? "flex flex-wrap items-center gap-2 border bg-muted px-3 py-2" : "relative"
      }
    >
      <p
        role="status"
        className={count > 0 ? "me-auto text-sm font-medium tabular-nums" : "sr-only"}
      >
        {count > 0 ? `${count} selected` : ""}
      </p>
      {count > 0 && (
        <>
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Clear selection
          </Button>
          {children}
        </>
      )}
    </div>
  );
}
