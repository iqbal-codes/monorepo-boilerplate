"use client";

import * as React from "react";

import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";

import { formContext } from "./form-context";

type DirtyStoreLike = {
  state: { isDirty: boolean };
  subscribe: (listener: () => void) => (() => void) | { unsubscribe: () => void };
};

export type FormWithDirtyStore = {
  store: DirtyStoreLike;
};

export type NavigationBlockerLike =
  | {
      status: "blocked";
      proceed: () => void;
      reset: () => void;
    }
  | {
      status: "idle";
      proceed?: () => void;
      reset?: () => void;
    };

export type UnsavedChangesGuardRenderProps = {
  isDirty: boolean;
  isPromptOpen: boolean;
  /** Request closing the guarded surface; intercepts if dirty, closes immediately if clean. */
  requestClose: () => void;
  /** Drop-in `onOpenChange` handler for controlled Sheet/Dialog overlays. */
  guardOpenChange: (nextOpen: boolean) => void;
};

export type UnsavedChangesGuardProps = {
  /** Optional TanStack Form instance; falls back to `formContext` or `isDirty`. */
  form?: FormWithDirtyStore;
  /** Explicit dirty flag override (combined with form `isDirty` when both are used). */
  isDirty?: boolean;
  /** Enables close/navigation interception. Defaults to `true`. */
  enabled?: boolean;
  /** Rejects close and discard attempts while an async save is in flight. */
  pending?: boolean;
  /** Optional structural router blocker (compatible with TanStack Router `useBlocker`). */
  blocker?: NavigationBlockerLike;
  /** Called immediately on clean close, or after confirming Discard changes on a close prompt. */
  onClose?: () => void;
  /** Optional open-change callback passed through when `guardOpenChange(true)` is called. */
  onOpenChange?: (open: boolean) => void;
  /** Called when the user confirms Discard changes (e.g. to reset form state). */
  onDiscard?: () => void;
  title?: string;
  description?: string;
  keepEditingLabel?: string;
  discardLabel?: string;
  finalFocus?: React.ComponentProps<typeof ConfirmationDialog>["finalFocus"];
  children?: React.ReactNode | ((props: UnsavedChangesGuardRenderProps) => React.ReactNode);
};

function useFormDirty(form?: FormWithDirtyStore): boolean {
  const subscribe = React.useCallback(
    (listener: () => void) => {
      if (!form) return () => {};
      const subscription = form.store.subscribe(listener);
      return typeof subscription === "function" ? subscription : () => subscription.unsubscribe();
    },
    [form],
  );

  const getSnapshot = React.useCallback(
    () => (form ? Boolean(form.store.state.isDirty) : false),
    [form],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Controlled, router-free unsaved-changes guard pairing `ConfirmationDialog`
 * ("Keep editing" vs "Discard changes") with TanStack Form `isDirty` and an
 * optional structural navigation blocker (`useBlocker`).
 */
export function UnsavedChangesGuard({
  form,
  isDirty: explicitDirty,
  enabled = true,
  pending = false,
  blocker,
  onClose,
  onOpenChange,
  onDiscard,
  title = "Discard unsaved changes?",
  description = "You have unsaved changes. Leaving now will discard your edits.",
  keepEditingLabel = "Keep editing",
  discardLabel = "Discard changes",
  finalFocus,
  children,
}: UnsavedChangesGuardProps) {
  const contextForm = React.useContext(formContext) as unknown as FormWithDirtyStore | undefined;
  const resolvedForm = form ?? contextForm;
  const formDirty = useFormDirty(resolvedForm);
  const dirty = explicitDirty ?? formDirty;

  const [closePromptOpen, setClosePromptOpen] = React.useState(false);

  const isNavigationBlocked = enabled && blocker?.status === "blocked";
  const isPromptOpen = closePromptOpen || isNavigationBlocked;

  React.useEffect(() => {
    if (!enabled || (!dirty && !pending)) {
      if (closePromptOpen) {
        setClosePromptOpen(false);
      }
      if (blocker?.status === "blocked") {
        blocker.reset();
      }
    }
  }, [enabled, dirty, pending, closePromptOpen, blocker]);

  const requestClose = React.useCallback(() => {
    if (pending) return;
    const liveDirty =
      explicitDirty ?? (resolvedForm ? Boolean(resolvedForm.store.state.isDirty) : false);
    if (!enabled || !liveDirty) {
      if (onClose) {
        onClose();
      } else {
        onOpenChange?.(false);
      }
      return;
    }
    setClosePromptOpen(true);
  }, [pending, enabled, explicitDirty, resolvedForm, onClose, onOpenChange]);

  const guardOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange?.(true);
        return;
      }
      requestClose();
    },
    [onOpenChange, requestClose],
  );

  function handleKeepEditing() {
    setClosePromptOpen(false);
    if (blocker?.status === "blocked") {
      blocker.reset();
    }
  }

  function handleDiscardChanges() {
    if (pending) return;
    const wasBlockedNavigation = blocker?.status === "blocked";
    setClosePromptOpen(false);
    onDiscard?.();
    if (wasBlockedNavigation) {
      blocker.proceed();
      return;
    }
    if (onClose) {
      onClose();
    } else {
      onOpenChange?.(false);
    }
  }

  const renderedChildren =
    typeof children === "function"
      ? children({
          isDirty: dirty,
          isPromptOpen,
          requestClose,
          guardOpenChange,
        })
      : children;

  return (
    <>
      {renderedChildren}
      <ConfirmationDialog
        open={isPromptOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            handleKeepEditing();
          }
        }}
        title={title}
        description={description}
        cancelLabel={keepEditingLabel}
        confirmLabel={discardLabel}
        confirmVariant="destructive"
        confirmDisabled={pending}
        pendingLabel="Discarding…"
        onConfirm={handleDiscardChanges}
        finalFocus={finalFocus}
      />
    </>
  );
}
