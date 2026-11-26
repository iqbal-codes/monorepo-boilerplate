/**
 * ExportButton — one-tap CSV export block.
 *
 * The block owns the interaction only: the Screen supplies the captured data
 * access (`fetchExport`) and the filename (`getFilename`), and receives the
 * finished `File` plus its row count. The payload is never sliced, decoded, or
 * stored in React state here: it goes straight to an on-demand module worker
 * (`./export/worker.ts`) that builds the whole file and posts it back once.
 *
 * Deliberately free of tRPC, nuqs, TanStack Router, domain types, and
 * `DataTable`, so any Screen can reuse it. Nothing outlives a run: the worker is
 * terminated on the first response, on failure, and on unmount; every object URL
 * is revoked on teardown as well as on its own deferred revocation.
 */
import * as React from "react";
import { cn } from "cn";
import { DownloadIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";
import type { CsvExportRequest, CsvExportResponse } from "./export/csv";

type ExportWorker = {
  postMessage(message: CsvExportRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<CsvExportResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

/**
 * A worker script error has no useful technical detail to show staff, so it gets
 * the same actionable retry copy as any other failure.
 */
const FALLBACK_ERROR = "Could not prepare the export. Check your connection and try again.";

export function ExportButton({
  label,
  getFilename,
  fetchExport,
  hint,
  disabled = false,
  cancelSignal,
  onExported,
  className,
}: {
  label: React.ReactNode;
  /** Called once per activation; the returned name is never recomputed mid-run. */
  getFilename: (activatedAt: Date) => string;
  /** Screen-owned data access. Resolves with the opaque export payload. */
  fetchExport: (signal: AbortSignal) => Promise<string>;
  /** Visible caveat, associated with the button. */
  hint?: React.ReactNode;
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
  className?: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const hintId = React.useId();
  const inFlight = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const workerRef = React.useRef<ExportWorker | null>(null);
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
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
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

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      releaseWorker();
      revokeAllUrls();
      inFlight.current = false;
    };
  }, [releaseWorker, revokeAllUrls]);

  async function start() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage("Preparing the export.");

    const controller = new AbortController();
    abortRef.current = controller;
    /** True when this run may still deliver a file for the Screen. */
    const resumed = () =>
      !controller.signal.aborted && mounted.current && !(cancelSignalRef.current?.aborted ?? false);

    try {
      // The Screen owns the filename policy, so a throwing provider is a normal
      // failure: it must settle the control and offer a retry, not strand it.
      const filename = getFilename(new Date());
      const payload = await fetchExport(controller.signal);
      if (!resumed()) return;

      setMessage("Generating the CSV file.");
      const worker: ExportWorker = new Worker(new URL("./export/worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;

      worker.onmessage = (event) => {
        if (workerRef.current !== worker) return;
        releaseWorker();
        settle();
        if (!resumed()) return;
        const response = event.data;
        if (response.type === "done") {
          downloadFile(response.file);
          setMessage(`Exported ${response.rowCount} ${response.rowCount === 1 ? "row" : "rows"}.`);
          onExported?.(response.file, response.rowCount);
        } else {
          setMessage("");
          setError(`Could not prepare the CSV file. ${response.message} Try again.`);
        }
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        releaseWorker();
        settle();
        if (!resumed()) return;
        setMessage("");
        setError(FALLBACK_ERROR);
      };

      worker.postMessage({ payload, filename });
    } catch (cause) {
      if (controller.signal.aborted) return;
      releaseWorker();
      settle();
      if (!mounted.current) return;
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
    const onCancel = () => {
      abortRef.current?.abort();
      abortRef.current = null;
      releaseWorker();
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    };
    if (cancelSignal.aborted) onCancel();
    else cancelSignal.addEventListener("abort", onCancel, { once: true });
    return () => cancelSignal.removeEventListener("abort", onCancel);
  }, [cancelSignal, releaseWorker]);

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

  const busyLabel = message || "Preparing the export.";

  return (
    <div
      data-slot="export-button"
      className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", className)}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        // Busy is a disabled state for assistive tech and for the click handler,
        // but the control stays focusable so a keyboard user lands back on the
        // Export action for an immediate retry. The guarded click handler above
        // is what actually prevents overlapping exports. A Screen-set `disabled`
        // is a real disabled state and does drop out of the tab order.
        disabled={disabled || busy}
        focusableWhenDisabled={busy && !disabled}
        aria-busy={busy || undefined}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => void start()}
      >
        {busy ? <Spinner aria-hidden /> : <DownloadIcon aria-hidden />}
        {label}
      </Button>
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
