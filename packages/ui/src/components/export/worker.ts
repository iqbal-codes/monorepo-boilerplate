/**
 * On-demand CSV export worker.
 *
 * Spawned by `ExportButton` only when a run starts, so receiving a large HTTP
 * response as well as decoding and generating the file never blocks the main
 * thread and the payload never lands in React state or the query cache. Accepts
 * one run request, posts exactly one terminal outcome (`done`, `error`,
 * `http-error`, or `aborted`), and produces no partial output.
 */
import {
  runCsvExport,
  unwrapCsvExportPayload,
  type CsvExportHttpRequest,
  type CsvExportRequest,
  type CsvExportResponse,
  type ExportFormat,
} from "./csv";
import { runXlsxExport } from "./xlsx";

type CsvExportWorkerScope = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<CsvExportRequest>) => void,
  ): void;
  postMessage(message: CsvExportResponse): void;
};

/** One-shot listener: a duplicate message can never produce a second file. */
export function handleCsvExportRequest(
  scope: CsvExportWorkerScope,
  message: { payload: string; filename: string; format?: ExportFormat },
  signal?: AbortSignal,
): CsvExportResponse | Promise<CsvExportResponse> {
  function postResult(response: CsvExportResponse): CsvExportResponse {
    const result: CsvExportResponse = signal?.aborted ? { type: "aborted" } : response;
    scope.postMessage(result);
    return result;
  }

  if (message.format === "xlsx") {
    return runXlsxExport(message).then(postResult);
  }
  return postResult(runCsvExport(message));
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

function isAbortMessage(message: CsvExportRequest): message is { type: "abort" } {
  return typeof message === "object" && message !== null && message.type === "abort";
}

async function handleHttpCsvExport(
  scope: CsvExportWorkerScope,
  request: CsvExportHttpRequest,
  filename: string,
  format: ExportFormat,
  signal: AbortSignal,
  fetchFn: typeof fetch,
): Promise<void> {
  scope.postMessage({ type: "stage", stage: "fetching" });

  let rawText: string;
  try {
    const response = await fetchFn(request.url, {
      method: request.method,
      body: request.body,
      credentials: request.credentials,
      headers: request.headers,
      signal,
    });
    if (signal.aborted) {
      scope.postMessage({ type: "aborted" });
      return;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (signal.aborted) {
        scope.postMessage({ type: "aborted" });
        return;
      }
      scope.postMessage({ type: "http-error", status: response.status, body });
      return;
    }
    rawText = await response.text();
    if (signal.aborted) {
      scope.postMessage({ type: "aborted" });
      return;
    }
  } catch (cause) {
    if (signal.aborted || isAbortError(cause)) {
      scope.postMessage({ type: "aborted" });
      return;
    }
    scope.postMessage({
      type: "http-error",
      message: cause instanceof Error ? cause.message : "Could not export data.",
    });
    return;
  }

  scope.postMessage({ type: "stage", stage: "generating" });
  try {
    const payload = unwrapCsvExportPayload(rawText, request.payloadPath);
    const response =
      format === "xlsx"
        ? await runXlsxExport({ payload, filename })
        : runCsvExport({ payload, filename });
    if (signal.aborted) {
      scope.postMessage({ type: "aborted" });
      return;
    }
    scope.postMessage(response);
  } catch (cause) {
    scope.postMessage({
      type: "error",
      message:
        cause instanceof Error
          ? cause.message
          : format === "xlsx"
            ? "Could not build the Excel file."
            : "Could not build the CSV file.",
    });
  }
}

/**
 * Registers the worker entry. Separated from the module body so tests can drive
 * the handler with a fake scope instead of a real worker global.
 */
export function registerCsvExportWorker(
  scope: CsvExportWorkerScope,
  fetchFn: typeof fetch = globalThis.fetch,
): void {
  let started = false;
  let activeAbort: AbortController | null = null;

  scope.addEventListener("message", (event: MessageEvent<CsvExportRequest>) => {
    const message = event.data;
    if (isAbortMessage(message)) {
      activeAbort?.abort();
      return;
    }
    if (started) return;
    started = true;
    const controller = new AbortController();
    activeAbort = controller;

    if (message.type === "http") {
      void handleHttpCsvExport(
        scope,
        message.request,
        message.filename,
        message.format ?? "csv",
        controller.signal,
        fetchFn,
      );
      return;
    }

    void handleCsvExportRequest(scope, message, controller.signal);
  });
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  registerCsvExportWorker(self);
}
