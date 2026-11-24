import * as React from "react";
import { cn } from "cn";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import { FieldDescription, FieldLegend, FieldSet } from "@monorepo-boilerplate/ui/components/field";

import type { ShowErrorMode } from "./error-utils";
import { FieldErrorMessages, useFieldFeedback, useFieldIds } from "./field-frame";
import { useFieldContext } from "./form-context";

export type FieldArrayItemContext<TItem> = {
  index: number;
  count: number;
  item: TItem;
  remove: () => void;
  moveUp: () => void;
  moveDown: () => void;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type FieldArrayProps<TItem = unknown> = {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  addLabel?: React.ReactNode;
  createItem: () => TItem;
  minItems?: number;
  maxItems?: number;
  /** Show accessible Move Up / Move Down buttons on each row. Defaults to `false`. */
  reorderable?: boolean;
  /** Hide default row action buttons when rendering custom controls inside `renderItem`. */
  hideDefaultControls?: boolean;
  disabled?: boolean;
  showError?: ShowErrorMode;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  className?: string;
  id?: string;
  renderItem: (context: FieldArrayItemContext<TItem>) => React.ReactNode;
};

/**
 * Repeatable Field Array Block. Mount inside `<form.AppField name="items" mode="array">`
 * to render add, remove, and optional accessible move-up / move-down controls
 * with `minItems` / `maxItems` bounds.
 */
export function FieldArray<TItem = unknown>({
  label,
  description,
  required,
  addLabel = "Add item",
  createItem,
  minItems = 0,
  maxItems,
  reorderable = false,
  hideDefaultControls = false,
  disabled = false,
  showError,
  emptyTitle = "No items yet",
  emptyDescription = "Add an entry to get started.",
  className,
  id,
  renderItem,
}: FieldArrayProps<TItem>) {
  const field = useFieldContext<TItem[] | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const items = Array.isArray(field.state.value) ? field.state.value : [];
  const canAdd = !disabled && (maxItems === undefined || items.length < maxItems);
  const canRemoveAny = !disabled && items.length > minItems;

  function handleAdd() {
    if (!canAdd) return;
    field.pushValue(createItem());
  }

  return (
    <FieldSet
      disabled={disabled}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn("gap-3", className)}
    >
      {label ? (
        <FieldLegend
          id={ids.labelId}
          variant="label"
          className={cn("mb-0", invalid && "text-destructive")}
        >
          {label}
          {required ? (
            <span aria-hidden="true" className="ms-1 text-destructive">
              *
            </span>
          ) : null}
        </FieldLegend>
      ) : null}
      {description ? (
        <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
      ) : null}

      {items.length === 0 ? (
        <Empty className="border p-6">
          <EmptyHeader>
            <EmptyTitle className="text-sm">{emptyTitle}</EmptyTitle>
            {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canAdd}
              onClick={handleAdd}
            >
              <PlusIcon data-icon="inline-start" />
              {addLabel}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, index) => {
            const canMoveUp = !disabled && index > 0;
            const canMoveDown = !disabled && index < items.length - 1;
            const remove = () => {
              if (!canRemoveAny) return;
              field.removeValue(index);
              field.handleBlur();
            };
            const moveUp = () => {
              if (!canMoveUp) return;
              field.moveValue(index, index - 1);
            };
            const moveDown = () => {
              if (!canMoveDown) return;
              field.moveValue(index, index + 1);
            };

            return (
              <div
                key={index}
                data-slot="field-array-item"
                className="flex flex-col gap-3 border border-border bg-card/40 p-4 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  {renderItem({
                    index,
                    count: items.length,
                    item,
                    remove,
                    moveUp,
                    moveDown,
                    canRemove: canRemoveAny,
                    canMoveUp,
                    canMoveDown,
                  })}
                </div>
                {!hideDefaultControls ? (
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    {reorderable ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={!canMoveUp}
                          aria-label={`Move item ${index + 1} up`}
                          onClick={moveUp}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={!canMoveDown}
                          aria-label={`Move item ${index + 1} down`}
                          onClick={moveDown}
                        >
                          <ArrowDownIcon />
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={!canRemoveAny}
                      aria-label={`Remove item ${index + 1}`}
                      onClick={remove}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canAdd}
              onClick={handleAdd}
            >
              <PlusIcon data-icon="inline-start" />
              {addLabel}
            </Button>
          </div>
        </div>
      )}

      <FieldErrorMessages id={ids.errorId} messages={messages} />
    </FieldSet>
  );
}
