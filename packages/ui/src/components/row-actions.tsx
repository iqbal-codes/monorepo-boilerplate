import * as React from "react";
import { cn } from "cn";
import { MoreHorizontalIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";

export type RowActionConfirmConfig = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
};

export type RowActionItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void | Promise<void>;
  variant?: "default" | "destructive";
  disabled?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
  confirm?: RowActionConfirmConfig;
};

export type RowActionsProps = {
  items: readonly RowActionItem[];
  label?: string;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  className?: string;
};

/**
 * Standardized trailing row-actions dropdown menu block. Isolates pointer and
 * keyboard interactions from parent row click handlers and supports optional
 * destructive confirmation dialogs.
 */
export function RowActions({
  items,
  label = "Row actions",
  align = "end",
  disabled = false,
  className,
}: RowActionsProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pendingConfirmItem, setPendingConfirmItem] = React.useState<RowActionItem | null>(null);
  const [confirmPending, setConfirmPending] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string>();
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const visibleItems = items.filter((item) => !item.hidden);
  if (visibleItems.length === 0) return null;

  return (
    <div
      data-slot="row-actions"
      className={cn("inline-flex items-center justify-end", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={label}
              data-slot="row-actions-trigger"
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-44">
          <DropdownMenuGroup>
            {visibleItems.map((item, index) => (
              <React.Fragment key={item.id}>
                {item.separatorBefore && index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  variant={item.variant}
                  disabled={item.disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    if (item.confirm) {
                      setConfirmError(undefined);
                      setPendingConfirmItem(item);
                    } else {
                      void item.onSelect();
                    }
                  }}
                >
                  {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                  {item.label}
                </DropdownMenuItem>
              </React.Fragment>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingConfirmItem?.confirm ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => {
            if (!next && !confirmPending) {
              setPendingConfirmItem(null);
              setConfirmError(undefined);
            }
          }}
          title={pendingConfirmItem.confirm.title}
          description={pendingConfirmItem.confirm.description}
          cancelLabel={pendingConfirmItem.confirm.cancelLabel}
          confirmLabel={pendingConfirmItem.confirm.confirmLabel}
          confirmVariant={pendingConfirmItem.variant === "destructive" ? "destructive" : "default"}
          pendingLabel={pendingConfirmItem.confirm.pendingLabel ?? "Working…"}
          pending={confirmPending}
          error={confirmError}
          finalFocus={() => triggerRef.current}
          onConfirm={() => {
            if (confirmPending) return;
            setConfirmError(undefined);
            setConfirmPending(true);
            void Promise.resolve(pendingConfirmItem.onSelect())
              .then(() => {
                setConfirmPending(false);
                setPendingConfirmItem(null);
              })
              .catch((error: unknown) => {
                setConfirmPending(false);
                setConfirmError(
                  error instanceof Error ? error.message : "Action failed. Please try again.",
                );
              });
          }}
        />
      ) : null}
    </div>
  );
}
