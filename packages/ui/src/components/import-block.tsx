/**
 * ImportBlock — template download, file selection, write-free preview, and one
 * all-or-nothing confirmation for a CSV or Excel (.xlsx) import.
 *
 * Domain-free by construction: the Screen supplies the column contract, the
 * blank-cell defaults, and the `validate` / `confirm` callbacks. The block never
 * touches routing, URL state, a query client, or a domain type, and it never
 * writes anything except through `confirm`.
 *
 * Parsing runs through the injected `parse` / `parseXlsx` seams (the module
 * workers by default), and every request carries a monotonically increasing
 * token so a stale response cannot repopulate a preview the user already
 * cancelled or replaced.
 */
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@monorepo-boilerplate/ui/components/alert";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import { ScrollArea } from "@monorepo-boilerplate/ui/components/scroll-area";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@monorepo-boilerplate/ui/components/table";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  PREVIEW_SAMPLE_ROWS,
  serializeCsvTemplate,
  type CsvParseError,
  type CsvParseOutcome,
  type CsvParser,
} from "@monorepo-boilerplate/ui/lib/csv";
import { parseInWorker } from "@monorepo-boilerplate/ui/lib/csv.worker";
import { formatNumber } from "@monorepo-boilerplate/ui/lib/format";
import {
  XLSX_MIME_TYPE,
  buildXlsxTemplate,
  type XlsxParseError,
  type XlsxParseOutcome,
  type XlsxParser,
} from "@monorepo-boilerplate/ui/lib/xlsx";
import { parseXlsxInWorker } from "@monorepo-boilerplate/ui/lib/xlsx.worker";
import { FileDownIcon, UploadIcon } from "lucide-react";

export type ImportContract = {
  /** Column names in template order. Headers may arrive in any order. */
  columns: readonly string[];
  /** Download filename for the blank CSV template. */
  filename: string;
  /** Optional download filename for the blank Excel (.xlsx) template. */
  xlsxFilename?: string;
};

export type ImportRecord = {
  /** 1-based physical line where the record starts in the chosen file. */
  lineNumber: number;
  /** Cell text keyed by column name, with `defaults` already applied. */
  values: Record<string, string>;
};

export type ImportIssue = {
  lineNumber: number;
  field: string;
  message: string;
};

export type ImportConfirmContext = {
  attemptId: string;
};

export type ImportConfirmResult =
  | { ok: true; created: number }
  | { ok: false; conflictLineNumbers: number[] }
  | { ok: false; outcome: "unsaved" | "unknown"; message?: string };

export type ImportBlockProps = {
  contract: ImportContract;
  /** Applied to blank cells before validation and confirmation. */
  defaults: Readonly<Record<string, string>>;
  /** Screen-owned rules. Issues are keyed by the record's original line. */
  validate: (records: ImportRecord[]) => ImportIssue[] | Promise<ImportIssue[]>;
  /** Screen-owned write. Returning `ok: false` keeps the preview open. */
  confirm: (
    records: ImportRecord[],
    context?: ImportConfirmContext,
  ) => ImportConfirmResult | Promise<ImportConfirmResult>;
  /**
   * Reconciles a confirmation attempt when a transport failure leaves the
   * outcome uncertain. Returning `null` keeps the outcome unverified.
   */
  reconcile?: (
    records: ImportRecord[],
    context: ImportConfirmContext,
  ) => ImportConfirmResult | null | Promise<ImportConfirmResult | null>;
  parse?: CsvParser;
  parseXlsx?: XlsxParser;
  cancelSignal?: AbortSignal;
  sampleLimit?: number;
  triggerLabel?: string;
  size?: "default" | "sm";
  className?: string;
  disabled?: boolean;
  /** Controlled open state when triggered from an external menu or button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Omit the built-in trigger button when opened externally. */
  hideTrigger?: boolean;
  /** Element to return focus to when closing a dialog opened from a transient menu. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

const ACCEPTED_CSV_TYPES = new Set(["text/csv", "application/csv", "text/plain"]);
const CSV_ACCEPT = ".csv,text/csv,application/csv,text/plain";
const CSV_AND_XLSX_ACCEPT = `${CSV_ACCEPT},.xlsx,${XLSX_MIME_TYPE}`;

function applyDefaults(
  values: Record<string, string>,
  defaults: Readonly<Record<string, string>>,
): Record<string, string> {
  const merged: Record<string, string> = { ...values };
  for (const [field, fallback] of Object.entries(defaults)) {
    if ((merged[field] ?? "").trim() === "") merged[field] = fallback;
  }
  return merged;
}

function detectSupportedFormat(file: File, allowXlsx: boolean): "csv" | "xlsx" | null {
  const type = file.type.trim().toLowerCase();
  const name = file.name.trim();
  if (allowXlsx) {
    if (type === XLSX_MIME_TYPE) return "xlsx";
    if ((type === "" || type === "application/octet-stream") && /\.xlsx$/i.test(name)) {
      return "xlsx";
    }
  }
  if (type === "") return /\.csv$/i.test(name) ? "csv" : null;
  if (ACCEPTED_CSV_TYPES.has(type) && !/\.xlsx$/i.test(name)) return "csv";
  return null;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function describeParseError(error: CsvParseError | XlsxParseError): string {
  switch (error.kind) {
    case "file-too-large":
      return `This file is ${formatNumber(Math.ceil(error.bytes / 1024))} KiB, which is over the 5 MiB limit. Split it into smaller files.`;
    case "malformed-workbook":
      return "This Excel workbook is malformed or unsupported. Save it as a standard .xlsx file and try again.";
    case "over-budget":
      return "This Excel workbook exceeds the allowed size or complexity limits before it can be safely read. Remove unused sheets, formatting, or empty rows and try again.";
    case "no-sheets":
      return "This Excel workbook has no worksheets. Use a workbook with a single worksheet.";
    case "multiple-sheets":
      return `This Excel workbook has ${formatNumber(error.count)} worksheets. Only single-worksheet .xlsx files are supported.`;
    case "empty-file":
      return "This file has no records. Download the template and add at least one row.";
    case "missing-headers":
      return `This file is missing required columns: ${error.headers.join(", ")}. Download the template for the exact columns.`;
    case "unknown-headers":
      return `This file has unknown columns: ${error.headers.join(", ")}. Download the template for the exact columns.`;
    case "repeated-headers":
      return `This file repeats columns: ${error.headers.join(", ")}. Keep each column once.`;
    case "too-many-rows":
      return "truncated" in error && error.truncated
        ? `This file has more than ${formatNumber(error.limit)} records. An import is limited to ${formatNumber(error.limit)} nonblank rows.`
        : `This file has ${formatNumber(error.total)} records. An import is limited to ${formatNumber(error.limit)} nonblank rows.`;
    case "too-many-cells":
      return `Line ${error.lineNumber} has ${formatNumber(error.cells)} cells but the file has ${formatNumber(error.headers)} columns. Quote any value that contains a comma, then try again.`;
    case "unmapped-cell":
      return `Line ${error.lineNumber} (${error.cellRef}) has a value outside the header columns. Move every value under a header column and try again.`;
    case "formula-cell":
      return `Line ${error.lineNumber} (${error.cellRef}) contains a formula. Formulas cannot be imported—replace them with literal values and try again.`;
    case "imprecise-number":
      return `Line ${error.lineNumber} (${error.cellRef}) contains a numeric value outside Excel's 15-digit reliable numeric precision. Format that cell as text and try again.`;
    case "error-cell":
      return `Line ${error.lineNumber} (${error.cellRef}) contains a spreadsheet error (${error.value}). Replace it with a valid value and try again.`;
  }
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

type Phase =
  | "choose"
  | "parsing"
  | "validating"
  | "preview"
  | "pending"
  | "reconciling"
  | "unverified";

type ImportState = {
  phase: Phase;
  fileName: string | null;
  records: ImportRecord[];
  issues: ImportIssue[];
  error: string | null;
  conflictLineNumbers: number[] | null;
};

const INITIAL_STATE: ImportState = {
  phase: "choose",
  fileName: null,
  records: [],
  issues: [],
  error: null,
  conflictLineNumbers: null,
};

/**
 * A confirmation that reports failure without naming a line leaves the user with
 * nothing to act on, so it is surfaced as a recoverable error instead of a silent
 * re-enabled preview.
 */
const UNREPORTED_CONFLICT =
  "The import could not be completed and no rows were saved, but the conflicting records could not be identified. Choose the file again to re-check every row.";

const UNKNOWN_OUTCOME_MESSAGE =
  "The confirmation response was lost or the server could not be reached, so it is unclear whether these records were saved. Check the Customers list before importing again, or check the import status once your connection returns.";

export function ImportBlock({
  contract,
  defaults,
  validate,
  confirm,
  reconcile,
  parse = parseInWorker,
  parseXlsx = parseXlsxInWorker,
  cancelSignal,
  sampleLimit = PREVIEW_SAMPLE_ROWS,
  triggerLabel = "Import",
  size = "default",
  className,
  disabled = false,
  open: controlledOpen,
  onOpenChange: onControlledOpenChange,
  hideTrigger = false,
  returnFocusRef,
}: ImportBlockProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const [state, setState] = React.useState<ImportState>(INITIAL_STATE);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const issuesHeadingRef = React.useRef<HTMLDivElement>(null);
  const requestRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const pendingRef = React.useRef(false);
  const wasOpenRef = React.useRef(open);
  const attemptIdRef = React.useRef<string | null>(null);
  const xlsxEnabled = Boolean(contract.xlsxFilename);

  const busy =
    state.phase === "parsing" ||
    state.phase === "validating" ||
    state.phase === "pending" ||
    state.phase === "reconciling";

  const invalidate = React.useCallback(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  React.useEffect(() => () => invalidate(), [invalidate]);

  const reset = React.useCallback(() => {
    invalidate();
    pendingRef.current = false;
    attemptIdRef.current = null;
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [invalidate]);

  React.useEffect(() => {
    if (open && !wasOpenRef.current && isControlled) {
      reset();
    }
    wasOpenRef.current = open;
  }, [isControlled, open, reset]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && pendingRef.current) return;
      if (!next) reset();
      if (!isControlled) setInternalOpen(next);
      onControlledOpenChange?.(next);
    },
    [isControlled, onControlledOpenChange, reset],
  );

  React.useEffect(() => {
    if (!cancelSignal) return;
    const onAbort = () => {
      invalidate();
      if (!pendingRef.current) {
        handleOpenChange(false);
      }
    };
    if (cancelSignal.aborted) {
      onAbort();
      return;
    }
    cancelSignal.addEventListener("abort", onAbort, { once: true });
    return () => cancelSignal.removeEventListener("abort", onAbort);
  }, [cancelSignal, handleOpenChange, invalidate]);

  const handleFile = React.useCallback(
    async (file: File) => {
      invalidate();
      const token = requestRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      // Selecting a new file clears the previous preview immediately.
      setState({
        phase: "choose",
        fileName: file.name,
        records: [],
        issues: [],
        error: null,
        conflictLineNumbers: null,
      });

      const format = detectSupportedFormat(file, xlsxEnabled);
      if (!format) {
        setState((previous) => ({
          ...previous,
          error: xlsxEnabled
            ? "Choose a .csv or .xlsx file. Accepted types are CSV (.csv) and Excel (.xlsx)."
            : "Choose a .csv file. Accepted types are text/csv, application/csv, or text/plain.",
        }));
        return;
      }
      if (file.size > MAX_IMPORT_BYTES) {
        setState((previous) => ({
          ...previous,
          error: `This file is ${formatNumber(Math.ceil(file.size / 1024))} KiB, which is over the 5 MiB limit. Split it into smaller files.`,
        }));
        return;
      }

      setState((previous) => ({ ...previous, phase: "parsing" }));

      let outcome: CsvParseOutcome | XlsxParseOutcome;
      try {
        outcome =
          format === "xlsx"
            ? await parseXlsx({
                file,
                columns: contract.columns,
                signal: controller.signal,
              })
            : await parse({
                text: await file.text(),
                columns: contract.columns,
                signal: controller.signal,
              });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestRef.current !== token) return;
        setState((previous) => ({
          ...previous,
          phase: "choose",
          error:
            format === "xlsx"
              ? "This Excel workbook could not be read. Check that it is a valid .xlsx file and try again."
              : "This file could not be read. Check that it is a plain UTF-8 CSV and try again.",
        }));
        return;
      }

      if (requestRef.current !== token) return;

      if (!outcome.ok) {
        setState((previous) => ({
          ...previous,
          phase: "choose",
          error: describeParseError(outcome.error),
        }));
        return;
      }

      if (outcome.table.rows.length === 0) {
        // A headers-only file is valid CSV but nothing to import, so it is treated
        // as a recoverable rejection rather than a preview that offers "Import 0".
        setState((previous) => ({
          ...previous,
          phase: "choose",
          error:
            "This file has the right columns but no records. Add at least one row below the header.",
        }));
        return;
      }

      const records = outcome.table.rows.map((row) => ({
        lineNumber: row.lineNumber,
        values: applyDefaults(row.values, defaults),
      }));

      setState((previous) => ({
        ...previous,
        phase: "validating",
        records,
        issues: [],
        error: null,
      }));

      let issues: ImportIssue[];
      try {
        issues = await validate(records);
      } catch {
        if (requestRef.current !== token) return;
        setState((previous) => ({
          ...previous,
          phase: "choose",
          error: "The file could not be checked against saved records. Try again.",
        }));
        return;
      }
      if (requestRef.current !== token) return;

      attemptIdRef.current = crypto.randomUUID();
      setState({
        phase: "preview",
        fileName: file.name,
        records,
        issues,
        error: null,
        conflictLineNumbers: null,
      });
    },
    [contract.columns, defaults, invalidate, parse, parseXlsx, validate, xlsxEnabled],
  );

  const applyConfirmResult = React.useCallback(
    (result: ImportConfirmResult) => {
      if (result.ok) {
        handleOpenChange(false);
        return;
      }

      if ("outcome" in result) {
        if (result.outcome === "unknown") {
          setState((previous) => ({
            ...previous,
            phase: "unverified",
            error: result.message ?? UNKNOWN_OUTCOME_MESSAGE,
          }));
          return;
        }
        setState((previous) => ({
          ...previous,
          phase: "preview",
          error:
            result.message ??
            "No records from this import attempt were saved. Check your connection and try again.",
        }));
        return;
      }

      attemptIdRef.current = crypto.randomUUID();
      if (result.conflictLineNumbers.length === 0) {
        setState((previous) => ({
          ...previous,
          phase: "choose",
          records: [],
          issues: [],
          error: UNREPORTED_CONFLICT,
        }));
        return;
      }

      setState((previous) => ({
        ...previous,
        phase: "preview",
        error: null,
        conflictLineNumbers: result.conflictLineNumbers,
      }));
    },
    [handleOpenChange],
  );

  const runReconcile = React.useCallback(
    async (records: ImportRecord[], attemptId: string, token: number) => {
      if (!reconcile) return;
      pendingRef.current = true;
      setState((previous) => ({
        ...previous,
        phase: "reconciling",
        error: null,
        conflictLineNumbers: null,
      }));

      let outcome: ImportConfirmResult | null = null;
      try {
        outcome = await reconcile(records, { attemptId });
      } catch {
        outcome = null;
      }

      pendingRef.current = false;
      if (requestRef.current !== token) return;

      if (!outcome) {
        setState((previous) => ({
          ...previous,
          phase: "unverified",
          error: UNKNOWN_OUTCOME_MESSAGE,
        }));
        return;
      }
      applyConfirmResult(outcome);
    },
    [applyConfirmResult, reconcile],
  );

  const handleConfirm = React.useCallback(async () => {
    if (state.phase !== "preview" || state.issues.length > 0) return;
    const token = requestRef.current;
    const records = state.records;
    const attemptId = attemptIdRef.current ?? crypto.randomUUID();
    attemptIdRef.current = attemptId;

    pendingRef.current = true;
    setState((previous) => ({
      ...previous,
      phase: "pending",
      error: null,
      conflictLineNumbers: null,
    }));

    let result: ImportConfirmResult;
    try {
      result = await confirm(records, { attemptId });
    } catch {
      pendingRef.current = false;
      if (requestRef.current !== token) return;
      if (reconcile) {
        await runReconcile(records, attemptId, token);
        return;
      }
      setState((previous) => ({
        ...previous,
        phase: "choose",
        error:
          "The import could not be completed. Nothing was saved; check your connection and try again.",
      }));
      return;
    }

    pendingRef.current = false;
    if (requestRef.current !== token) return;
    applyConfirmResult(result);
  }, [
    applyConfirmResult,
    confirm,
    reconcile,
    runReconcile,
    state.issues.length,
    state.phase,
    state.records,
  ]);

  const handleManualReconcile = React.useCallback(async () => {
    if (state.phase !== "unverified" || !reconcile) return;
    const attemptId = attemptIdRef.current ?? crypto.randomUUID();
    attemptIdRef.current = attemptId;
    await runReconcile(state.records, attemptId, requestRef.current);
  }, [reconcile, runReconcile, state.phase, state.records]);

  const downloadCsvTemplate = React.useCallback(() => {
    triggerBlobDownload(
      new Blob([serializeCsvTemplate(contract.columns)], { type: "text/csv" }),
      contract.filename,
    );
  }, [contract.columns, contract.filename]);

  const downloadXlsxTemplate = React.useCallback(async () => {
    if (!contract.xlsxFilename) return;
    try {
      const bytes = await buildXlsxTemplate(contract.columns);
      triggerBlobDownload(new Blob([bytes], { type: XLSX_MIME_TYPE }), contract.xlsxFilename);
    } catch {
      setState((previous) => ({
        ...previous,
        error: "Could not generate the Excel template. Try again.",
      }));
    }
  }, [contract.columns, contract.xlsxFilename]);

  const total = state.records.length;
  const sample = state.records.slice(0, sampleLimit);
  const hasPreview =
    state.phase === "preview" || state.phase === "pending" || state.phase === "reconciling";
  const hasIssues = state.issues.length > 0;
  const hasConflicts = Boolean(state.conflictLineNumbers && state.conflictLineNumbers.length > 0);
  const canConfirm = state.phase === "preview" && !hasIssues;

  return (
    <>
      {!hideTrigger && (
        <Button
          type="button"
          variant="outline"
          size={size}
          data-slot="import-trigger"
          aria-haspopup="dialog"
          className={className}
          disabled={disabled || busy}
          onClick={() => {
            reset();
            if (!isControlled) setInternalOpen(true);
            onControlledOpenChange?.(true);
          }}
        >
          <UploadIcon data-icon="inline-start" aria-hidden />
          {triggerLabel}
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          {...(returnFocusRef ? { finalFocus: returnFocusRef } : {})}
          className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>Import customers</DialogTitle>
            <DialogDescription>
              Download the template, fill in one row per new Customer, and review every issue before
              anything is saved. Existing Customers are never changed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto min-h-9 max-w-full whitespace-normal py-1.5"
                onClick={downloadCsvTemplate}
              >
                <FileDownIcon data-icon="inline-start" aria-hidden />
                Download CSV template
              </Button>
              {xlsxEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-9 max-w-full whitespace-normal py-1.5"
                  onClick={() => void downloadXlsxTemplate()}
                >
                  <FileDownIcon data-icon="inline-start" aria-hidden />
                  Download Excel template
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-auto min-h-9 max-w-full whitespace-normal py-1.5"
                disabled={state.phase === "pending" || state.phase === "reconciling"}
                onClick={() => fileInputRef.current?.click()}
              >
                {state.fileName
                  ? "Choose another file"
                  : xlsxEnabled
                    ? "Choose file"
                    : "Choose CSV file"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={xlsxEnabled ? CSV_AND_XLSX_ACCEPT : CSV_ACCEPT}
                aria-label={xlsxEnabled ? "CSV or Excel file" : "CSV file"}
                tabIndex={-1}
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void handleFile(file);
                }}
              />
              <span className="min-w-0 break-words text-xs text-muted-foreground">
                {state.fileName ??
                  `One ${xlsxEnabled ? ".csv or .xlsx" : ".csv"} file, up to 5 MiB and ${formatNumber(MAX_IMPORT_ROWS)} rows`}
              </span>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertTitle>
                  {state.phase === "unverified"
                    ? "Import outcome unknown"
                    : state.phase === "preview"
                      ? "Import was not saved"
                      : "This file cannot be imported"}
                </AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-2">
                  <span>{state.error}</span>
                  {state.phase === "unverified" && reconcile && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleManualReconcile()}
                    >
                      Check import status
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {(state.phase === "parsing" || state.phase === "validating") && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden />
                {state.phase === "parsing"
                  ? "Checking the file…"
                  : "Checking the file against saved Customers…"}
              </p>
            )}

            {hasPreview && total > 0 && (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p role="status" className="text-sm">
                    {hasIssues
                      ? `Import blocked: ${formatNumber(state.issues.length)} ${plural(state.issues.length, "issue", "issues")} to fix across ${formatNumber(total)} ${plural(total, "record", "records")}. Nothing has been saved.`
                      : hasConflicts
                        ? `${formatNumber(total)} ${plural(total, "record", "records")} checked. Review the conflict below before importing.`
                        : `${formatNumber(total)} ${plural(total, "record", "records")} ready to import.`}
                  </p>
                  {hasIssues && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const target = issuesHeadingRef.current;
                        if (!target) return;
                        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        target.focus();
                      }}
                    >
                      Jump to issues
                    </Button>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-2 rounded-none border">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
                    <p className="text-xs font-semibold tracking-widest uppercase">Preview</p>
                    <p className="text-xs text-muted-foreground">
                      Showing {formatNumber(sample.length)} of {formatNumber(total)}
                      {total > sample.length
                        ? " rows. Every issue below is listed by its original line."
                        : " rows."}
                    </p>
                  </div>
                  <Table regionLabel="Import preview" containerClassName="max-h-64 overflow-y-auto">
                    <TableHeader className="sticky top-0 z-10 bg-popover">
                      <TableRow>
                        <TableHead className="w-16">Line</TableHead>
                        {contract.columns.map((column) => (
                          <TableHead key={column}>{column}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sample.map((record) => (
                        <TableRow key={record.lineNumber}>
                          <TableCell className="align-top tabular-nums text-muted-foreground">
                            {record.lineNumber}
                          </TableCell>
                          {contract.columns.map((column) => (
                            <TableCell key={column} className="align-top whitespace-normal">
                              <div className="w-max max-w-60 break-words">
                                {record.values[column] ?? ""}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {hasPreview && state.conflictLineNumbers && hasConflicts && (
              <Alert variant="destructive">
                <AlertTitle>Nothing was saved</AlertTitle>
                <AlertDescription>
                  These records now match a Customer that already exists:{" "}
                  {state.conflictLineNumbers.map((lineNumber) => `Line ${lineNumber}`).join(", ")}.
                  Fix or remove them, then import again.
                </AlertDescription>
              </Alert>
            )}

            {hasPreview && hasIssues && (
              <div className="flex min-w-0 flex-col gap-2">
                <div
                  ref={issuesHeadingRef}
                  tabIndex={-1}
                  className="flex scroll-mt-2 flex-wrap items-center gap-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <p className="text-sm font-medium">
                    {formatNumber(state.issues.length)}{" "}
                    {plural(state.issues.length, "issue", "issues")} to fix
                  </p>
                  <Badge variant="destructive">Blocked</Badge>
                </div>
                <ScrollArea className="max-h-56 rounded-none border">
                  <ul className="flex flex-col divide-y">
                    {state.issues.map((issue, index) => (
                      <li
                        key={`${issue.lineNumber}-${issue.field}-${index}`}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-sm"
                      >
                        <span className="font-medium tabular-nums">Line {issue.lineNumber}</span>
                        <Badge variant="secondary">{issue.field}</Badge>
                        <span className="min-w-0 break-words text-muted-foreground">
                          {issue.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            {hasPreview && !hasIssues && !hasConflicts && !state.error && (
              <p className="text-sm text-muted-foreground">
                Every row passes validation. Nothing has been saved yet.
              </p>
            )}

            {(state.phase === "pending" || state.phase === "reconciling") && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden />
                {state.phase === "reconciling"
                  ? "Checking whether the import completed…"
                  : `Importing ${formatNumber(total)} ${plural(total, "record", "records")}…`}
              </p>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={state.phase === "pending" || state.phase === "reconciling"}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-slot="import-confirm"
              disabled={!canConfirm}
              aria-busy={state.phase === "pending" || state.phase === "reconciling"}
              onClick={() => {
                if (!canConfirm) return;
                void handleConfirm();
              }}
            >
              {(state.phase === "pending" || state.phase === "reconciling") && (
                <Spinner aria-hidden />
              )}
              {state.phase === "reconciling"
                ? "Checking…"
                : state.phase === "pending"
                  ? "Importing…"
                  : canConfirm
                    ? `Import ${formatNumber(total)} ${plural(total, "record", "records")}`
                    : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
