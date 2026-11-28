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
  const [confirmation, setConfirmation] = React.useState<{
    item: RowActionItem;
    error?: string;
  } | null>(null);
  const [confirmPending, setConfirmPending] = React.useState(false);
  const inFlight = React.useRef(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  if (disabled && (menuOpen || confirmation)) {
    setMenuOpen(false);
    setConfirmation(null);
  }

  const pendingConfirmItem = confirmation?.item;

  const visibleItems = items.filter((item) => !item.hidden);
  if (visibleItems.length === 0) return null;

  return (
    <div
      data-slot="row-actions"
      className={cn("inline-flex items-center justify-end", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <DropdownMenu
        open={menuOpen && !disabled}
        onOpenChange={(next) => {
          if ((!disabled && !confirmPending) || !next) setMenuOpen(next);
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled || confirmPending}
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
                  disabled={disabled || item.disabled}
                  onClick={() => {
                    if (disabled || item.disabled || inFlight.current) return;
                    setMenuOpen(false);
                    if (item.confirm) {
                      setConfirmation({ item });
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

      {!disabled && pendingConfirmItem?.confirm ? (
        <ConfirmationDialog
          open
          onOpenChange={(next) => {
            if (!next && !confirmPending) {
              setConfirmation(null);
            }
          }}
          title={pendingConfirmItem.confirm.title}
          description={pendingConfirmItem.confirm.description}
          cancelLabel={pendingConfirmItem.confirm.cancelLabel}
          confirmLabel={pendingConfirmItem.confirm.confirmLabel}
          confirmVariant={pendingConfirmItem.variant === "destructive" ? "destructive" : "default"}
          pendingLabel={pendingConfirmItem.confirm.pendingLabel ?? "Working…"}
          pending={confirmPending}
          error={confirmation?.error}
          finalFocus={() => triggerRef.current}
          onConfirm={() => {
            if (inFlight.current) return;
            inFlight.current = true;
            setConfirmPending(true);
            if (confirmation?.error) setConfirmation({ item: pendingConfirmItem });
            void Promise.resolve()
              .then(pendingConfirmItem.onSelect)
              .then(() => setConfirmation(null))
              .catch((error: unknown) => {
                setConfirmation((previous) =>
                  previous
                    ? {
                        ...previous,
                        error:
                          error instanceof Error
                            ? error.message
                            : "Action failed. Please try again.",
                      }
                    : null,
                );
              })
              .finally(() => {
                inFlight.current = false;
                setConfirmPending(false);
              });
          }}
        />
      ) : null}
    </div>
  );
}
