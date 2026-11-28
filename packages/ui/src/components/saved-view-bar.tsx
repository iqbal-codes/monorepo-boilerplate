"use client";

import * as React from "react";
import { cn } from "cn";
import {
  BookmarkPlusIcon,
  CheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@monorepo-boilerplate/ui/components/field";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export type SavedViewItem = {
  id: string;
  name: string;
  /** Optional record count displayed inside the view button. */
  count?: number;
  isDefault?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
};

export type SavedViewBarProps = {
  views: readonly SavedViewItem[];
  activeViewId: string | null;
  onSelectView: (viewId: string) => void;
  /** True when the active filters/sort/columns diverge from the active view. */
  isDirty?: boolean;
  onSaveChanges?: (viewId: string) => void | Promise<void>;
  onDiscardChanges?: (viewId: string) => void;
  onCreateView?: (name: string) => void | Promise<void>;
  onRenameView?: (viewId: string, nextName: string) => void | Promise<void>;
  onDeleteView?: (viewId: string) => void | Promise<void>;
  label?: string;
  createLabel?: string;
  createPlaceholder?: string;
  isSaving?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Controlled, router-free SavedViewBar Block. Renders named view presets, an
 * accessible unsaved-changes dot, and controlled create/rename/delete/save
 * callbacks; the owning Screen manages persistence.
 */
export function SavedViewBar({
  views,
  activeViewId,
  onSelectView,
  isDirty = false,
  onSaveChanges,
  onDiscardChanges,
  onCreateView,
  onRenameView,
  onDeleteView,
  label = "Saved views",
  createLabel = "Save view",
  createPlaceholder = "e.g. Overdue Q1",
  isSaving = false,
  disabled = false,
  className,
}: SavedViewBarProps) {
  const createInputId = React.useId();
  const renameInputId = React.useId();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createPending, setCreatePending] = React.useState(false);

  const [renameTarget, setRenameTarget] = React.useState<SavedViewItem | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [renamePending, setRenamePending] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<SavedViewItem | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);

  const [savePending, setSavePending] = React.useState(false);

  const activeView = views.find((view) => view.id === activeViewId) ?? null;
  const isBusy = disabled || isSaving || savePending;

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!onCreateView) return;
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError("Enter a name for the view.");
      return;
    }
    setCreateError(null);
    setCreatePending(true);
    try {
      await onCreateView(trimmed);
      setCreateName("");
      setCreateOpen(false);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not save view.");
    } finally {
      setCreatePending(false);
    }
  }

  async function handleRenameSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!onRenameView || !renameTarget) return;
    const trimmed = renameName.trim();
    if (!trimmed) {
      setRenameError("Enter a name for the view.");
      return;
    }
    setRenameError(null);
    setRenamePending(true);
    try {
      await onRenameView(renameTarget.id, trimmed);
      setRenameTarget(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Could not rename view.");
    } finally {
      setRenamePending(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!onDeleteView || !deleteTarget) return;
    setDeleteError(null);
    setDeletePending(true);
    try {
      await onDeleteView(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete view.");
    } finally {
      setDeletePending(false);
    }
  }

  async function handleSaveChanges() {
    if (!onSaveChanges || !activeView) return;
    setSavePending(true);
    try {
      await onSaveChanges(activeView.id);
    } finally {
      setSavePending(false);
    }
  }

  return (
    <div
      data-slot="saved-view-bar"
      className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2", className)}
    >
      <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          const showDirtyDot = isActive && isDirty;
          const canRename = Boolean(onRenameView) && view.canRename !== false;
          const canDelete = Boolean(onDeleteView) && view.canDelete !== false;
          const hasMenu = canRename || canDelete;

          return (
            <div
              key={view.id}
              data-slot="saved-view-item"
              data-active={isActive ? "true" : undefined}
              className="inline-flex items-center"
            >
              <Button
                type="button"
                size="xs"
                variant={isActive ? "secondary" : "outline"}
                aria-pressed={isActive}
                disabled={isBusy}
                onClick={() => onSelectView(view.id)}
                className={cn("gap-1.5", hasMenu && "border-e-0", isActive && "font-semibold")}
              >
                {showDirtyDot ? (
                  <span
                    data-slot="saved-view-dirty-dot"
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-warning"
                  />
                ) : null}
                <span>{view.name}</span>
                {typeof view.count === "number" ? (
                  <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                    {view.count}
                  </span>
                ) : null}
                {showDirtyDot ? <span className="sr-only">(unsaved changes)</span> : null}
              </Button>

              {hasMenu ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={isActive ? "secondary" : "outline"}
                        aria-label={`Actions for ${view.name}`}
                        disabled={isBusy}
                        className="border-s border-border/70"
                      />
                    }
                  >
                    <MoreHorizontalIcon aria-hidden="true" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      {canRename ? (
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget(view);
                            setRenameName(view.name);
                            setRenameError(null);
                          }}
                        >
                          <PencilIcon aria-hidden="true" />
                          Rename
                        </DropdownMenuItem>
                      ) : null}
                      {canRename && canDelete ? <DropdownMenuSeparator /> : null}
                      {canDelete ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            setDeleteTarget(view);
                            setDeleteError(null);
                          }}
                        >
                          <Trash2Icon aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}

        {onCreateView ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={isBusy}
            onClick={() => {
              setCreateName("");
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <BookmarkPlusIcon data-icon="inline-start" aria-hidden="true" />
            {createLabel}
          </Button>
        ) : null}
      </div>

      {isDirty && activeView && (onSaveChanges || onDiscardChanges) ? (
        <div data-slot="saved-view-dirty-actions" className="flex flex-wrap items-center gap-1.5">
          {onDiscardChanges ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={isBusy}
              onClick={() => onDiscardChanges(activeView.id)}
            >
              <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
              Discard
            </Button>
          ) : null}
          {onSaveChanges ? (
            <Button
              type="button"
              size="xs"
              variant="default"
              disabled={isBusy}
              onClick={() => void handleSaveChanges()}
            >
              {savePending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <CheckIcon data-icon="inline-start" aria-hidden="true" />
              )}
              Save changes
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!createPending) setCreateOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Save the current filters, sorting, and column layout as a named preset.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void handleCreateSubmit(event)}
            className="flex flex-col gap-4"
          >
            <Field data-invalid={createError ? "" : undefined}>
              <FieldLabel htmlFor={createInputId}>View name</FieldLabel>
              <Input
                id={createInputId}
                value={createName}
                placeholder={createPlaceholder}
                aria-invalid={createError ? true : undefined}
                disabled={createPending}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  if (createError) setCreateError(null);
                }}
              />
              {createError ? <FieldError>{createError}</FieldError> : null}
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={createPending}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createPending}>
                {createPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
                Create view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(next) => {
          if (!next && !renamePending) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
            <DialogDescription>Update the name of this saved view.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void handleRenameSubmit(event)}
            className="flex flex-col gap-4"
          >
            <Field data-invalid={renameError ? "" : undefined}>
              <FieldLabel htmlFor={renameInputId}>View name</FieldLabel>
              <Input
                id={renameInputId}
                value={renameName}
                aria-invalid={renameError ? true : undefined}
                disabled={renamePending}
                onChange={(event) => {
                  setRenameName(event.target.value);
                  if (renameError) setRenameError(null);
                }}
              />
              {renameError ? <FieldError>{renameError}</FieldError> : null}
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={renamePending}
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={renamePending}>
                {renamePending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next && !deletePending) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete view?"}
        description="This removes the saved view preset. Your underlying records are not affected."
        confirmLabel="Delete view"
        pendingLabel="Deleting…"
        confirmVariant="destructive"
        pending={deletePending}
        error={deleteError ?? undefined}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}
