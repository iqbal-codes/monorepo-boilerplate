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
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { RadioGroup, RadioGroupItem } from "@monorepo-boilerplate/ui/components/radio-group";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export function CustomerArchiveDialog({
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Archive customer?"
      description="Archived customers are hidden from the default list. Their record, notes, and avatar are preserved, and you can restore them anytime."
      confirmLabel="Archive customer"
      pendingLabel="Archiving…"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    />
  );
}

export function CustomerRestoreDialog({
  open,
  onOpenChange,
  choice,
  onChoiceChange,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choice: "active" | "inactive" | null;
  onChoiceChange: (choice: "active" | "inactive") => void;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>Restore customer</DialogTitle>
          <DialogDescription>
            Choose the status this customer should have when restored to the active list.
          </DialogDescription>
        </DialogHeader>

        <FieldSet>
          <FieldLegend variant="label">Restored status</FieldLegend>
          <RadioGroup
            value={choice ?? ""}
            onValueChange={(value) => {
              if (value === "active" || value === "inactive") {
                onChoiceChange(value);
              }
            }}
            className="grid gap-2"
          >
            <FieldLabel htmlFor="restore-status-active" className="cursor-pointer">
              <Field orientation="horizontal">
                <RadioGroupItem id="restore-status-active" value="active" />
                <FieldContent>
                  <FieldTitle>Active</FieldTitle>
                  <FieldDescription>
                    Customer returns as an active account in the default list.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>

            <FieldLabel htmlFor="restore-status-inactive" className="cursor-pointer">
              <Field orientation="horizontal">
                <RadioGroupItem id="restore-status-inactive" value="inactive" />
                <FieldContent>
                  <FieldTitle>Inactive</FieldTitle>
                  <FieldDescription>
                    Customer returns to the default list marked as inactive.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          </RadioGroup>
        </FieldSet>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!choice || pending} onClick={onConfirm}>
            {pending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            {pending ? "Restoring…" : "Restore customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerDeleteDialog({
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Delete customer permanently?"
      description="This permanently deletes the customer record and all associated activity history. This action cannot be undone."
      confirmLabel="Delete customer"
      confirmVariant="destructive"
      pendingLabel="Deleting…"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    />
  );
}
