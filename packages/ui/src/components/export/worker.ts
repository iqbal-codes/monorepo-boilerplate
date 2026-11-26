/**
 * On-demand CSV export worker.
 *
 * Spawned by `ExportButton` only when a run starts, so decoding and generating
 * the file never blocks the main thread and the payload never lands in React
 * state or the query cache. Accepts one request, posts exactly one response,
 * and produces no partial output: a malformed payload returns
 * `{ type: "error" }` and no file.
 */
import { runCsvExport, type CsvExportRequest, type CsvExportResponse } from "./csv";

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
  message: CsvExportRequest,
): CsvExportResponse {
  const response = runCsvExport(message);
  scope.postMessage(response);
  return response;
}

/**
 * Registers the worker entry. Separated from the module body so tests can drive
 * the handler with a fake scope instead of a real worker global.
 */
export function registerCsvExportWorker(scope: CsvExportWorkerScope): void {
  let handled = false;
  scope.addEventListener("message", (event: MessageEvent<CsvExportRequest>) => {
    if (handled) return;
    handled = true;
    handleCsvExportRequest(scope, event.data);
  });
}

registerCsvExportWorker(self);
