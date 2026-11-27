import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  ExportButton,
  type ExportFeedback,
} from "@monorepo-boilerplate/ui/components/export-button";
import { PlusIcon } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { CustomerImport } from "@/components/customers/customer-import";
import {
  type CustomerExportScope,
  customerExportFilename,
  customerExportRequest,
  useCustomerExportCancel,
} from "@/lib/customer-export";

const EXPORT_FORMATS = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV (.csv)" },
] as const;

const INITIAL_FEEDBACK: ExportFeedback = {
  busy: false,
  message: "",
  error: null,
};

/**
 * Isolated live region for export status/errors so progress updates never
 * re-render the surrounding action row or the Customers table.
 */
function CustomerExportFeedback({
  onBind,
}: {
  onBind: (listener: ((feedback: ExportFeedback) => void) | null) => void;
}) {
  const [feedback, setFeedback] = useState<ExportFeedback>(INITIAL_FEEDBACK);

  useEffect(() => {
    onBind(setFeedback);
    return () => onBind(null);
  }, [onBind]);

  return (
    <>
      <p
        role="status"
        className={
          feedback.busy || feedback.message
            ? "text-xs text-muted-foreground sm:text-end"
            : "sr-only"
        }
      >
        {feedback.message}
      </p>
      <p
        role="alert"
        className={feedback.error ? "text-xs text-destructive sm:text-end" : "sr-only"}
      >
        {feedback.error ?? ""}
      </p>
    </>
  );
}

/**
 * Header action cluster for Customers. Owns export cancellation and live-region
 * state locally so starting or updating an export never re-renders the list.
 */
export const CustomerPageActions = memo(function CustomerPageActions({
  search,
  status,
  sortBy,
  sortDir,
  onImported,
  onNewCustomer,
}: CustomerExportScope & {
  onImported: (created: number) => void;
  onNewCustomer: () => void;
}) {
  const exportCancelSignal = useCustomerExportCancel();
  const exportHintId = useId();
  const feedbackListenerRef = useRef<((feedback: ExportFeedback) => void) | null>(null);

  const handleFeedbackChange = useCallback((next: ExportFeedback) => {
    feedbackListenerRef.current?.(next);
  }, []);

  const bindFeedback = useCallback((listener: ((feedback: ExportFeedback) => void) | null) => {
    feedbackListenerRef.current = listener;
  }, []);

  const fetchExport = useMemo(
    () =>
      customerExportRequest({
        search,
        status,
        sortBy,
        sortDir,
      }),
    [search, status, sortBy, sortDir],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:items-end">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <CustomerImport size="sm" className="flex-1 sm:flex-none" onImported={onImported} />
        <ExportButton
          label="Export"
          formats={EXPORT_FORMATS}
          buttonClassName="flex-1 sm:flex-none"
          describedById={exportHintId}
          onFeedbackChange={handleFeedbackChange}
          getFilename={customerExportFilename}
          cancelSignal={exportCancelSignal}
          fetchExport={fetchExport}
        />
        <Button size="sm" className="w-full sm:w-auto" onClick={onNewCustomer}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          New customer
        </Button>
      </div>
      <p id={exportHintId} className="text-xs text-muted-foreground sm:text-end">
        Excel preserves literal text and balances; CSV escaping may change literal text.
      </p>
      <CustomerExportFeedback onBind={bindFeedback} />
    </div>
  );
});
