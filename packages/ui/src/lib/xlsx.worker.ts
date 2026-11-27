/**
 * Module-worker entry for `.xlsx` parsing, plus the main-thread `parseXlsxInWorker`
 * implementation and its message/abort types.
 *
 * The `File` reference is posted directly to the worker so reading bytes,
 * inflating ZIP entries, and parsing XML all happen off the main thread.
 * Aborting the caller's signal terminates the worker immediately and rejects
 * with a `DOMException` named `AbortError`.
 */
import { MAX_IMPORT_BYTES, type CsvTable } from "./csv";
import {
  parseXlsxTable,
  type XlsxParseError,
  type XlsxParseOutcome,
  type XlsxParser,
} from "./xlsx";

export type XlsxWorkerRequest = {
  type: "parse";
  token: number;
  file: File;
  columns: string[];
};

export type XlsxWorkerResponse =
  | { type: "parsed"; token: number; table: CsvTable }
  | { type: "failed"; token: number; error: XlsxParseError };

export type { XlsxParseOutcome, XlsxParser };

type WorkerScope = {
  WorkerGlobalScope?: unknown;
  addEventListener?: (
    type: "message",
    listener: (event: MessageEvent<XlsxWorkerRequest>) => void,
  ) => void;
  postMessage?: (message: XlsxWorkerResponse) => void;
};

/**
 * Registers the `.xlsx` worker message handler on `scope`. Exported so tests
 * can exercise the worker boundary without spawning a real browser Worker.
 */
export function registerXlsxImportWorker(scope: WorkerScope): void {
  scope.addEventListener?.("message", (event) => {
    const message = event.data;
    if (message?.type !== "parse") return;

    void (async () => {
      if (message.file.size > MAX_IMPORT_BYTES) {
        scope.postMessage?.({
          type: "failed",
          token: message.token,
          error: {
            kind: "file-too-large",
            bytes: message.file.size,
            limit: MAX_IMPORT_BYTES,
          },
        });
        return;
      }

      try {
        const bytes = new Uint8Array(await message.file.arrayBuffer());
        const result = await parseXlsxTable(bytes, message.columns);
        scope.postMessage?.(
          result.ok
            ? { type: "parsed", token: message.token, table: result.table }
            : { type: "failed", token: message.token, error: result.error },
        );
      } catch (cause) {
        scope.postMessage?.({
          type: "failed",
          token: message.token,
          error: {
            kind: "malformed-workbook",
            detail: cause instanceof Error ? cause.message : undefined,
          },
        });
      }
    })();
  });
}

const workerScope = globalThis as WorkerScope;

if (workerScope.WorkerGlobalScope !== undefined) {
  registerXlsxImportWorker(workerScope);
}

function aborted(): DOMException {
  return new DOMException("Excel parsing was cancelled", "AbortError");
}

let lastToken = 0;

/**
 * Parses `file` in a module worker. Each call carries a monotonically increasing
 * token, and aborting `signal` terminates the worker immediately.
 */
export const parseXlsxInWorker: XlsxParser = ({ file, columns, signal }) => {
  if (signal?.aborted) return Promise.reject(aborted());
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Web Workers are not available"));
  }

  lastToken += 1;
  const token = lastToken;
  const worker = new Worker(new URL("./xlsx.worker.ts", import.meta.url), { type: "module" });

  return new Promise<XlsxParseOutcome>((resolve, reject) => {
    const settle = (outcome: XlsxParseOutcome) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve(outcome);
    };
    const onAbort = () => {
      worker.terminate();
      reject(aborted());
    };

    worker.addEventListener("message", (event: MessageEvent<XlsxWorkerResponse>) => {
      const message = event.data;
      if (message.token !== token) return;
      settle(
        message.type === "parsed"
          ? { ok: true, table: message.table }
          : { ok: false, error: message.error },
      );
    });
    worker.addEventListener("error", () => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      reject(new Error("The Excel import worker failed"));
    });

    signal?.addEventListener("abort", onAbort);

    const request: XlsxWorkerRequest = { type: "parse", token, file, columns: [...columns] };
    worker.postMessage(request);
  });
};
