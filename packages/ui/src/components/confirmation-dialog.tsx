import { useRef, type ComponentProps } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@monorepo-boilerplate/ui/components/alert-dialog";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmVariant = "default",
  pendingLabel,
  pending = false,
  confirmDisabled = false,
  error,
  onConfirm,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: ComponentProps<typeof AlertDialogAction>["variant"];
  pendingLabel: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  error?: string;
  onConfirm: () => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent
        initialFocus={cancelRef}
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant={confirmVariant}
            disabled={confirmDisabled}
            aria-disabled={pending || confirmDisabled}
            onClick={() => {
              if (!pending && !confirmDisabled) onConfirm();
            }}
          >
            {pending && <Spinner aria-hidden data-icon="inline-start" />}
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
