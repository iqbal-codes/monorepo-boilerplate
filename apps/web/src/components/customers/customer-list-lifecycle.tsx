import { ConfirmationDialog } from "@monorepo-boilerplate/ui/components/confirmation-dialog";
import { useCallback, useRef, useState, type RefObject } from "react";

import {
  CustomerArchiveDialog,
  CustomerDeleteDialog,
  CustomerRestoreDialog,
} from "@/components/customers/customer-detail-dialogs";
import type { CustomerRow } from "@/components/customers/customer-list-columns";

type RestoreChoice = "active" | "inactive";
export type CustomerRowAction = "archive" | "restore" | "delete";
type Target = { kind: CustomerRowAction; id: string } | { kind: "bulkArchive"; ids: string[] };
type Draft = { target: Target; scope: string; error?: string; choice?: RestoreChoice };

export type CustomerLifecycleOperations = {
  onArchiveCustomers: (ids: string[]) => Promise<void>;
  archiving: boolean;
  onRestoreCustomer: (id: string, status: RestoreChoice) => Promise<void>;
  restoring: boolean;
  onDeleteCustomer: (id: string) => Promise<void>;
  deleting: boolean;
};

type LifecycleOptions = CustomerLifecycleOperations & {
  scope: string;
  current: boolean;
  busy: boolean;
  rows: readonly CustomerRow[];
  selected: ReadonlySet<string>;
  canDelete: boolean;
  onBulkArchived: () => void;
  archiveRef: RefObject<HTMLButtonElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
};

/** A confirmation belongs to one scope and one snapshot of its target(s). */
export function useCustomerListLifecycle({
  scope,
  current,
  busy,
  rows,
  selected,
  canDelete,
  onBulkArchived,
  archiveRef,
  searchRef,
  onArchiveCustomers,
  archiving,
  onRestoreCustomer,
  restoring,
  onDeleteCustomer,
  deleting,
}: LifecycleOptions) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [submitting, setSubmitting] = useState<Target | null>(null);
  const inFlight = useRef<Target | null>(null);

  function isEligible(target: Target) {
    if (!current) return false;
    if (target.kind === "bulkArchive")
      return target.ids.length > 0 && target.ids.every((id) => selected.has(id));
    const row = rows.find(({ id }) => id === target.id);
    if (!row) return false;
    if (target.kind === "delete") return canDelete;
    return target.kind === "restore" ? row.status === "archived" : row.status !== "archived";
  }

  const active = draft?.scope === scope && isEligible(draft.target) ? draft : null;
  if (draft && !active) setDraft(null);

  const open = useCallback(
    (target: Target) => {
      if (!busy) setDraft({ target, scope });
    },
    [busy, scope],
  );

  if (!active) return { open, dialog: null };

  const { target, choice, error } = active;
  const operationPending =
    target.kind === "delete" ? deleting : target.kind === "restore" ? restoring : archiving;
  const pending = operationPending || submitting === target;
  const close = (next: boolean) => {
    if (!next && !pending) setDraft(null);
  };
  const updateDraft = (changes: Partial<Pick<Draft, "error" | "choice">>) =>
    setDraft((previous) => (previous?.target === target ? { ...previous, ...changes } : previous));

  async function confirm() {
    if (busy || pending || inFlight.current || !isEligible(target)) return;
    if (target.kind === "restore" && !choice) return;
    inFlight.current = target;
    setSubmitting(target);
    updateDraft({ error: undefined });
    try {
      switch (target.kind) {
        case "bulkArchive":
          await onArchiveCustomers(target.ids);
          onBulkArchived();
          break;
        case "archive":
          await onArchiveCustomers([target.id]);
          break;
        case "restore":
          if (choice) await onRestoreCustomer(target.id, choice);
          break;
        case "delete":
          await onDeleteCustomer(target.id);
          break;
      }
      setDraft((previous) => (previous?.target === target ? null : previous));
    } catch (error) {
      const message =
        target.kind === "bulkArchive"
          ? "Could not confirm the archive. Check your connection and try again."
          : `Could not ${target.kind} customer.`;
      updateDraft({ error: error instanceof Error ? error.message : message });
    } finally {
      inFlight.current = null;
      setSubmitting(null);
    }
  }

  const props = {
    open: true,
    onOpenChange: close,
    onConfirm: () => void confirm(),
    error,
    pending,
    confirmDisabled: !pending && (busy || submitting !== null),
  };
  const searchFocus = () => searchRef.current;
  let dialog;
  switch (target.kind) {
    case "bulkArchive": {
      const count = target.ids.length;
      dialog = (
        <ConfirmationDialog
          {...props}
          title={count === 1 ? "Archive 1 customer?" : `Archive ${count} customers?`}
          description="Archived customers are hidden from the default list. Their records and attachments are kept, and you can restore them from the Archived filter."
          confirmLabel={count === 1 ? "Archive customer" : "Archive customers"}
          pendingLabel="Archiving…"
          finalFocus={() => archiveRef.current ?? searchRef.current}
        />
      );
      break;
    }
    case "archive":
      dialog = <CustomerArchiveDialog {...props} finalFocus={searchFocus} />;
      break;
    case "restore":
      dialog = (
        <CustomerRestoreDialog
          {...props}
          finalFocus={searchFocus}
          choice={choice ?? null}
          onChoiceChange={(value) => updateDraft({ choice: value, error: undefined })}
        />
      );
      break;
    case "delete":
      dialog = <CustomerDeleteDialog {...props} finalFocus={searchFocus} />;
      break;
  }

  return { open, dialog };
}
