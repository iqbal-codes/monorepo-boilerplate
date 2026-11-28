import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import {
  useExportAction,
  type ExportFeedback,
} from "@monorepo-boilerplate/ui/components/export-button";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import {
  ChevronDownIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PlusIcon,
  UploadIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CustomerImport } from "@/components/customers/customer-import";
import {
  type CustomerExportScope,
  customerExportFilename,
  customerExportRequest,
  useCustomerExportCancel,
} from "@/lib/customer-export";

const EXPORT_FORMATS = [
  { format: "xlsx", label: "Export Excel (.xlsx)" },
  { format: "csv", label: "Export CSV (.csv)" },
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
 * Header action cluster for Customers: one primary action ("New customer") and
 * a secondary overflow menu for Import and Export formats, keeping the
 * header compact on mobile and desktop.
 */
export const CustomerPageActions = memo(function CustomerPageActions({
  search,
  status,
  statuses,
  tags,
  sortBy,
  sortDir,
  onImported,
  onNewCustomer,
}: CustomerExportScope & {
  onImported: (created: number) => void;
  onNewCustomer: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const exportCancelSignal = useCustomerExportCancel();
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
        statuses,
        tags,
        sortBy,
        sortDir,
      }),
    [search, status, statuses, tags, sortBy, sortDir],
  );

  const exportAction = useExportAction({
    getFilename: customerExportFilename,
    fetchExport,
    cancelSignal: exportCancelSignal,
    onFeedbackChange: handleFeedbackChange,
  });

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                ref={actionsTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                aria-label="More customer actions"
                aria-busy={exportAction.busy || undefined}
              />
            }
          >
            {exportAction.busy ? (
              <Spinner data-icon="inline-start" aria-hidden />
            ) : (
              <MoreHorizontalIcon className="sm:hidden" aria-hidden />
            )}
            <span className="hidden sm:inline">Actions</span>
            <ChevronDownIcon className="hidden sm:inline" data-icon="inline-end" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setImportOpen(true);
                }}
              >
                <UploadIcon aria-hidden />
                Import CSV / Excel
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Export</DropdownMenuLabel>
              {EXPORT_FORMATS.map((option) => (
                <DropdownMenuItem
                  key={option.format}
                  disabled={exportAction.busy}
                  onClick={() => {
                    setMenuOpen(false);
                    void exportAction.start(option.format);
                  }}
                >
                  <DownloadIcon aria-hidden />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <p className="px-3 py-1.5 text-xs leading-snug text-muted-foreground">
              Excel preserves literal text and balances; CSV escaping may change literal text.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={onNewCustomer}>
          <PlusIcon data-icon="inline-start" aria-hidden />
          New customer
        </Button>
      </div>

      <CustomerImport
        open={importOpen}
        onOpenChange={setImportOpen}
        hideTrigger
        returnFocusRef={actionsTriggerRef}
        cancelSignal={exportCancelSignal}
        onImported={onImported}
      />

      <CustomerExportFeedback onBind={bindFeedback} />
    </div>
  );
});
