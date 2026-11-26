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
 * `DataTable`, so any Screen can reuse it. No object URL or worker outlives a
 * run: both are released on the first worker response, on failure, and on
 * unmount.
 */
import * as React from "react";
import { cn } from "cn";
import { DownloadIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

type ExportWorkerResponse =
  | { type: "done"; file: File; rowCount: number }
  | { type: "error"; message: string };

type ExportWorker = {
  postMessage(message: { payload: string; filename: string }): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<ExportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export function ExportButton({
  label,
  getFilename,
  fetchExport,
  hint,
  disabled = false,
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
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = React.useRef(true);

  const releaseWorker = React.useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }, []);

  const settle = React.useCallback(() => {
    inFlight.current = false;
    if (mounted.current) setBusy(false);
  }, []);

  const teardown = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseWorker();
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    inFlight.current = false;
  }, [releaseWorker]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      teardown();
    };
  }, [teardown]);

  async function start() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage("Preparing the export.");

    const filename = getFilename(new Date());
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = await fetchExport(controller.signal);
      if (controller.signal.aborted || !mounted.current) return;

      setMessage("Generating the CSV file.");
      const worker: ExportWorker = new Worker(new URL("./export/worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;

      worker.onmessage = (event) => {
        if (workerRef.current !== worker) return;
        releaseWorker();
        settle();
        if (!mounted.current) return;
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
      worker.onerror = (event) => {
        if (workerRef.current !== worker) return;
        releaseWorker();
        settle();
        if (!mounted.current) return;
        setMessage("");
        setError(
          event.message ? `Could not prepare the CSV file. ${event.message}` : FALLBACK_ERROR,
        );
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

  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // `URL.createObjectURL` only serves the click; releasing it on the next task
    // gives the browser a turn to start the download first.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      URL.revokeObjectURL(url);
    }, 0);
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
        disabled={disabled || busy}
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

const FALLBACK_ERROR = "Could not prepare the export. Check your connection and try again.";
