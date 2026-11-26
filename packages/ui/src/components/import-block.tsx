/**
 * ImportBlock — template download, file selection, write-free preview, and one
 * all-or-nothing confirmation for a CSV import.
 *
 * Domain-free by construction: the Screen supplies the column contract, the
 * blank-cell defaults, and the `validate` / `confirm` callbacks. The block never
 * touches routing, URL state, a query client, or a domain type, and it never
 * writes anything except through `confirm`.
 *
 * Parsing runs through the injected `parse` seam (the module worker by default),
 * and every request carries a monotonically increasing token so a stale
 * response cannot repopulate a preview the user already cancelled or replaced.
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
import { FileDownIcon, UploadIcon } from "lucide-react";

export type ImportContract = {
  /** Column names in template order. Headers may arrive in any order. */
  columns: readonly string[];
  /** Download filename for the blank template. */
  filename: string;
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

export type ImportConfirmResult =
  | { ok: true; created: number }
  | { ok: false; conflictLineNumbers: number[] };

export type ImportBlockProps = {
  contract: ImportContract;
  /** Applied to blank cells before validation and confirmation. */
  defaults: Readonly<Record<string, string>>;
  /** Screen-owned rules. Issues are keyed by the record's original line. */
  validate: (records: ImportRecord[]) => ImportIssue[] | Promise<ImportIssue[]>;
  /** Screen-owned write. Returning `ok: false` keeps the preview open. */
  confirm: (records: ImportRecord[]) => ImportConfirmResult | Promise<ImportConfirmResult>;
  parse?: CsvParser;
  sampleLimit?: number;
  triggerLabel?: string;
  disabled?: boolean;
};

const ACCEPTED_TYPES = new Set(["text/csv", "application/csv", "text/plain"]);

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

function isSupportedFile(file: File): boolean {
  const type = file.type.trim().toLowerCase();
  if (type === "") return /\.csv$/i.test(file.name);
  return ACCEPTED_TYPES.has(type);
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function describeParseError(error: CsvParseError): string {
  switch (error.kind) {
    case "empty-file":
      return "This file has no records. Download the template and add at least one row.";
    case "missing-headers":
      return `This file is missing required columns: ${error.headers.join(", ")}. Download the template for the exact columns.`;
    case "unknown-headers":
      return `This file has unknown columns: ${error.headers.join(", ")}. Download the template for the exact columns.`;
    case "repeated-headers":
      return `This file repeats columns: ${error.headers.join(", ")}. Keep each column once.`;
    case "too-many-rows":
      return `This file has ${formatNumber(error.total)} records. An import is limited to ${formatNumber(error.limit)} nonblank rows.`;
    case "too-many-cells":
      return `Line ${error.lineNumber} has ${formatNumber(error.cells)} cells but the file has ${formatNumber(error.headers)} columns. Quote any value that contains a comma, then try again.`;
  }
}

type Phase = "choose" | "parsing" | "validating" | "preview" | "pending";

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

export function ImportBlock({
  contract,
  defaults,
  validate,
  confirm,
  parse = parseInWorker,
  sampleLimit = PREVIEW_SAMPLE_ROWS,
  triggerLabel = "Import",
  disabled = false,
}: ImportBlockProps) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<ImportState>(INITIAL_STATE);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const requestRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const pendingRef = React.useRef(false);

  const busy =
    state.phase === "parsing" || state.phase === "validating" || state.phase === "pending";

  const invalidate = React.useCallback(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  React.useEffect(() => () => invalidate(), [invalidate]);

  const reset = React.useCallback(() => {
    invalidate();
    pendingRef.current = false;
    setState(INITIAL_STATE);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [invalidate]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next && pendingRef.current) return;
      if (!next) reset();
      setOpen(next);
    },
    [reset],
  );

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

      if (!isSupportedFile(file)) {
        setState((previous) => ({
          ...previous,
          error: "Choose a .csv file. Accepted types are text/csv, application/csv, or text/plain.",
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

      let outcome: CsvParseOutcome;
      try {
        outcome = await parse({
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
          error: "This file could not be read. Check that it is a plain UTF-8 CSV and try again.",
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

      setState({
        phase: "preview",
        fileName: file.name,
        records,
        issues,
        error: null,
        conflictLineNumbers: null,
      });
    },
    [contract.columns, defaults, invalidate, parse, validate],
  );

  const handleConfirm = React.useCallback(async () => {
    if (state.phase !== "preview" || state.issues.length > 0) return;
    const token = requestRef.current;
    const records = state.records;

    pendingRef.current = true;
    setState((previous) => ({ ...previous, phase: "pending", conflictLineNumbers: null }));

    let result: ImportConfirmResult;
    try {
      result = await confirm(records);
    } catch {
      pendingRef.current = false;
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

    if (result.ok) {
      reset();
      setOpen(false);
      return;
    }

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
      conflictLineNumbers: result.conflictLineNumbers,
    }));
  }, [confirm, reset, state.issues.length, state.phase, state.records]);

  const downloadTemplate = React.useCallback(() => {
    const blob = new Blob([serializeCsvTemplate(contract.columns)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = contract.filename;
    anchor.rel = "noopener";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [contract.columns, contract.filename]);

  const total = state.records.length;
  const sample = state.records.slice(0, sampleLimit);
  const hasPreview = state.phase === "preview" || state.phase === "pending";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-slot="import-trigger"
        aria-haspopup="dialog"
        disabled={disabled || busy}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UploadIcon aria-hidden />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import customers</DialogTitle>
            <DialogDescription>
              Download the template, fill in one row per new Customer, and review every issue before
              anything is saved. Existing Customers are never changed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <FileDownIcon aria-hidden />
                Download CSV template
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={state.phase === "pending"}
                onClick={() => fileInputRef.current?.click()}
              >
                {state.fileName ? "Choose another file" : "Choose CSV file"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,application/csv,text/plain"
                aria-label="CSV file"
                tabIndex={-1}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {state.fileName ??
                  `One .csv file, up to 5 MiB and ${formatNumber(MAX_IMPORT_ROWS)} rows`}
              </span>
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertTitle>This file cannot be imported</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
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
                <p role="status" className="text-sm">
                  {formatNumber(total)} {plural(total, "record", "records")} ready to import.
                </p>
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
                  <Table>
                    <TableHeader>
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
                          <TableCell className="tabular-nums text-muted-foreground">
                            {record.lineNumber}
                          </TableCell>
                          {contract.columns.map((column) => (
                            <TableCell key={column} className="max-w-56 truncate">
                              {record.values[column] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {hasPreview && state.conflictLineNumbers && state.conflictLineNumbers.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Nothing was saved</AlertTitle>
                <AlertDescription>
                  These records now match a Customer that already exists:{" "}
                  {state.conflictLineNumbers.map((lineNumber) => `Line ${lineNumber}`).join(", ")}.
                  Fix or remove them, then import again.
                </AlertDescription>
              </Alert>
            )}

            {hasPreview && state.issues.length > 0 && (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
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

            {hasPreview && state.issues.length === 0 && !state.conflictLineNumbers && (
              <p className="text-sm text-muted-foreground">
                Every row passes validation. Nothing has been saved yet.
              </p>
            )}

            {state.phase === "pending" && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden />
                Importing {formatNumber(total)} {plural(total, "record", "records")}…
              </p>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              disabled={state.phase === "pending"}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-slot="import-confirm"
              disabled={state.phase !== "preview" || state.issues.length > 0}
              aria-busy={state.phase === "pending"}
              onClick={() => {
                if (state.phase !== "preview") return;
                void handleConfirm();
              }}
            >
              {state.phase === "pending" && <Spinner aria-hidden />}
              {state.phase === "pending"
                ? "Importing…"
                : state.phase === "preview"
                  ? `Import ${formatNumber(total)} ${plural(total, "record", "records")}`
                  : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
