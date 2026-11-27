/**
 * ExportButton — one-tap CSV export block.
 *
 * The block owns the interaction only: the Screen supplies the captured data
 * access (`fetchExport`) and the filename (`getFilename`), and receives the
 * finished `File` plus its row count. The payload is never sliced, decoded, or
 * stored in React state here: it goes straight to an on-demand module worker
 * (`./export/worker.ts`) — which can also fetch and decode an HTTP export
 * response directly off the main thread — builds the whole file, and posts it
 * back once.
 *
 * Deliberately free of tRPC, nuqs, TanStack Router, domain types, and
 * `DataTable`, so any Screen can reuse it. Nothing outlives a run: the worker is
 * terminated on the first response, on failure, and on unmount; every object URL
 * is revoked on teardown as well as on its own deferred revocation.
 */
import * as React from "react";
import { cn } from "cn";
import { ChevronDownIcon, DownloadIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import type {
  CsvExportHttpRequest,
  CsvExportRequest,
  CsvExportResponse,
  ExportFormat,
} from "./export/csv";

export type { ExportFormat };

export type ExportFormatOption = {
  format: ExportFormat;
  label: React.ReactNode;
  /** Optional per-format filename provider; falls back to `getFilename(activatedAt, format)`. */
  getFilename?: (activatedAt: Date) => string;
};

export type ExportHttpSource = CsvExportHttpRequest & {
  kind: "http";
  /** Screen-owned mapper for non-2xx HTTP responses or transport failures. */
  mapError?: (error: { status?: number; body?: string; cause?: unknown }) => string;
};

export type ExportSource = string | ExportHttpSource;

type ExportWorker = {
  postMessage(message: CsvExportRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<CsvExportResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

type WorkerPhase = "idle" | "loading" | "fetching" | "generating";

export type ExportFeedback = {
  busy: boolean;
  message: string;
  error: string | null;
};

/**
 * A worker script error has no useful technical detail to show staff, so it gets
 * the same actionable retry copy as any other failure.
 */
const FALLBACK_ERROR = "Could not prepare the export. Check your connection and try again.";

function exportFormatLabel(format: ExportFormat): string {
  return format === "xlsx" ? "Excel" : "CSV";
}

export type UseExportActionOptions = {
  /** Called once per activation; the returned name is never recomputed mid-run. */
  getFilename: (activatedAt: Date, format: ExportFormat) => string;
  /**
   * Screen-owned data access. Resolves either with the opaque payload string or
   * with an HTTP descriptor so the worker receives and decodes the response off
   * the main thread.
   */
  fetchExport: (signal: AbortSignal) => Promise<ExportSource>;
  /** External feedback listener when the Screen renders export status/errors outside this block. */
  onFeedbackChange?: (feedback: ExportFeedback) => void;
  disabled?: boolean;
  /**
   * Screen-owned signal for "this view is no longer current".
   *
   * Unmount alone is too late to cancel an export: a route change mounts the new
   * Screen before the old one is detached, so a worker resolving in that window
   * could still download a file for a Screen the user already left. The Screen
   * aborts this signal the moment navigation begins, and the block treats that
   * exactly like teardown: fetch aborted, worker terminated, no download.
   */
  cancelSignal?: AbortSignal;
  onExported?: (file: File, rowCount: number) => void;
};

/**
 * Reusable export runner hook backed by the off-main-thread export worker.
 * Shared by `ExportButton` and custom overflow menus.
 */
export function useExportAction({
  getFilename,
  fetchExport,
  onFeedbackChange,
  disabled = false,
  cancelSignal,
  onExported,
}: UseExportActionOptions) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inFlight = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const workerRef = React.useRef<ExportWorker | null>(null);
  const workerPhaseRef = React.useRef<WorkerPhase>("idle");
  /**
   * Object URLs that have been clicked but not yet revoked. `downloadFile`
   * schedules revocation on the next task so the browser can start the download;
   * teardown may happen before that task runs (for example an `onExported`
   * callback that unmounts the block), so teardown drains this set itself.
   */
  const urlsRef = React.useRef(new Set<string>());
  const mounted = React.useRef(true);
  // Read through a ref so an activation always sees the latest signal even
  // though `start` closes over the render it began in.
  const cancelSignalRef = React.useRef(cancelSignal);
  cancelSignalRef.current = cancelSignal;

  const releaseWorker = React.useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    workerPhaseRef.current = "idle";
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }, []);

  /**
   * Stops any active worker. When the worker has an HTTP fetch in flight, ask it
   * to abort its `AbortController` first so the browser closes the request cleanly
   * with `net::ERR_ABORTED`, then terminate once aborted (or after a short cap).
   */
  const abortWorker = React.useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const phase = workerPhaseRef.current;
    workerRef.current = null;
    workerPhaseRef.current = "idle";
    if (phase === "fetching") {
      const finish = () => {
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };
      const timer = setTimeout(finish, 50);
      worker.onmessage = (event) => {
        if (event.data.type === "aborted") finish();
      };
      worker.onerror = finish;
      worker.postMessage({ type: "abort" });
      return;
    }
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }, []);

  const revokeUrl = React.useCallback((url: string) => {
    if (!urlsRef.current.delete(url)) return;
    URL.revokeObjectURL(url);
  }, []);

  const revokeAllUrls = React.useCallback(() => {
    for (const url of [...urlsRef.current]) revokeUrl(url);
  }, [revokeUrl]);

  const settle = React.useCallback(() => {
    inFlight.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  const cancelRun = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    abortWorker();
    settle();
    if (mounted.current) setMessage("");
  }, [abortWorker, settle]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRun();
      revokeAllUrls();
    };
  }, [cancelRun, revokeAllUrls]);

  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    urlsRef.current.add(url);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Let the browser start the download before the URL disappears. `revokeUrl`
    // is idempotent, so a teardown that wins this race revokes exactly once.
    setTimeout(() => revokeUrl(url), 0);
  }

  async function start(
    format: ExportFormat = "csv",
    optionGetFilename?: (activatedAt: Date) => string,
  ) {
    if (inFlight.current || disabled || cancelSignalRef.current?.aborted) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage("Preparing the export.");

    const formatName = exportFormatLabel(format);
    const controller = new AbortController();
    abortRef.current = controller;
    /** True when this run may still deliver a file for the Screen. */
    const isActive = () =>
      !controller.signal.aborted && mounted.current && !(cancelSignalRef.current?.aborted ?? false);

    try {
      // The Screen owns the filename policy, so a throwing provider is a normal
      // failure: it must settle the control and offer a retry, not strand it.
      const filename = optionGetFilename
        ? optionGetFilename(new Date())
        : getFilename(new Date(), format);
      const source = await fetchExport(controller.signal);
      if (!isActive()) {
        cancelRun();
        return;
      }

      const worker: ExportWorker = new Worker(new URL("./export/worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      workerPhaseRef.current = typeof source === "string" ? "generating" : "loading";
      if (typeof source === "string") {
        setMessage(`Generating the ${formatName} file.`);
      }

      worker.onmessage = (event) => {
        if (workerRef.current !== worker) return;
        const response = event.data;
        if (response.type === "stage") {
          workerPhaseRef.current = response.stage;
          if (response.stage === "generating" && isActive()) {
            setMessage(`Generating the ${formatName} file.`);
          }
          return;
        }
        releaseWorker();
        settle();
        if (!isActive()) return;
        if (response.type === "done") {
          downloadFile(response.file);
          setMessage(`Exported ${response.rowCount} ${response.rowCount === 1 ? "row" : "rows"}.`);
          onExported?.(response.file, response.rowCount);
          return;
        }
        setMessage("");
        if (response.type === "http-error") {
          const mapped =
            typeof source !== "string" && source.mapError
              ? source.mapError({
                  status: response.status,
                  body: response.body,
                  cause: response.message,
                })
              : FALLBACK_ERROR;
          setError(mapped || FALLBACK_ERROR);
          return;
        }
        if (response.type === "aborted") {
          return;
        }
        setError(`Could not prepare the ${formatName} file. ${response.message} Try again.`);
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        releaseWorker();
        settle();
        if (!isActive()) return;
        setMessage("");
        setError(FALLBACK_ERROR);
      };

      const formatField = format === "xlsx" ? { format } : {};
      if (typeof source === "string") {
        worker.postMessage({ payload: source, filename, ...formatField });
      } else {
        const { url, credentials, headers, payloadPath } = source;
        worker.postMessage({
          type: "http",
          request: { url, credentials, headers, payloadPath },
          filename,
          ...formatField,
        });
      }
    } catch (cause) {
      const cancelled = controller.signal.aborted || (cancelSignalRef.current?.aborted ?? false);
      cancelRun();
      if (cancelled || !mounted.current) return;
      setMessage("");
      setError(cause instanceof Error && cause.message !== "" ? cause.message : FALLBACK_ERROR);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  /**
   * A Screen cancel (navigation beginning) ends the run immediately: the fetch is
   * aborted and the worker is terminated, so a generation finishing later can
   * never deliver a download for a view the user has left.
   */
  React.useEffect(() => {
    if (!cancelSignal) return;
    if (cancelSignal.aborted) {
      cancelRun();
      return;
    }
    cancelSignal.addEventListener("abort", cancelRun, { once: true });
    return () => cancelSignal.removeEventListener("abort", cancelRun);
  }, [cancelSignal, cancelRun]);

  const busyLabel = message || "Preparing the export.";
  const onFeedbackChangeRef = React.useRef(onFeedbackChange);
  onFeedbackChangeRef.current = onFeedbackChange;

  React.useEffect(() => {
    onFeedbackChangeRef.current?.({
      busy,
      message: busy ? busyLabel : message,
      error,
    });
  }, [busy, busyLabel, message, error]);

  return {
    busy,
    busyLabel,
    message,
    error,
    start,
  };
}

export function ExportButton({
  label,
  formats,
  getFilename,
  fetchExport,
  hint,
  describedById,
  onFeedbackChange,
  disabled = false,
  cancelSignal,
  onExported,
  className,
  buttonClassName,
}: UseExportActionOptions & {
  label: React.ReactNode;
  /** Optional format choices rendered as a dropdown menu instead of a one-tap button. */
  formats?: readonly ExportFormatOption[];
  /** Visible caveat, associated with the button. */
  hint?: React.ReactNode;
  /** External description element ID when the Screen renders the hint outside this block. */
  describedById?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const hintId = React.useId();
  const { busy, busyLabel, message, error, start } = useExportAction({
    getFilename,
    fetchExport,
    onFeedbackChange,
    disabled,
    cancelSignal,
    onExported,
  });

  const handleStart = (
    format: ExportFormat = "csv",
    optionGetFilename?: (activatedAt: Date) => string,
  ) => {
    setMenuOpen(false);
    void start(format, optionGetFilename);
  };

  const hasFormats = Boolean(formats && formats.length > 0);
  const triggerIcon = busy ? (
    <Spinner data-icon="inline-start" aria-hidden />
  ) : (
    <DownloadIcon data-icon="inline-start" aria-hidden />
  );

  const buttonProps = {
    type: "button" as const,
    size: "sm" as const,
    variant: "outline" as const,
    className: buttonClassName,
    // Busy is a disabled state for assistive tech and for the click handler,
    // but the control stays focusable so a keyboard user lands back on the
    // Export action for an immediate retry. The guarded click handler above
    // is what actually prevents overlapping exports. A Screen-set `disabled`
    // is a real disabled state and does drop out of the tab order.
    disabled: disabled || busy,
    focusableWhenDisabled: busy && !disabled,
    "aria-busy": busy || undefined,
    "aria-describedby": hint ? hintId : describedById,
  };

  const control = hasFormats ? (
    <DropdownMenu
      open={menuOpen && !disabled && !busy}
      onOpenChange={(next) => {
        if (!disabled && !busy) setMenuOpen(next);
      }}
    >
      <DropdownMenuTrigger disabled={disabled} render={<Button {...buttonProps} />}>
        {triggerIcon}
        {label}
        <ChevronDownIcon data-icon="inline-end" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {formats?.map((option) => (
            <DropdownMenuItem
              key={option.format}
              disabled={disabled || busy}
              onClick={() => {
                handleStart(option.format, option.getFilename);
              }}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Button {...buttonProps} onClick={() => handleStart("csv")}>
      {triggerIcon}
      {label}
    </Button>
  );

  if (onFeedbackChange) {
    return control;
  }

  return (
    <div
      data-slot="export-button"
      className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}
    >
      {control}
      {hint ? (
        <p id={hintId} className="min-w-0 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <p
        role="status"
        className={busy || message ? "min-w-0 text-xs text-muted-foreground" : "sr-only"}
      >
        {busy ? busyLabel : message}
      </p>
      <p role="alert" className={error ? "min-w-0 text-xs text-destructive" : "sr-only"}>
        {error ?? ""}
      </p>
    </div>
  );
}
