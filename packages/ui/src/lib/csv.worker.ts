/**
 * Module-worker entry for CSV parsing, plus the main-thread `parseInWorker`
 * implementation and its message/abort types.
 *
 * The same pure parser runs inside the worker, so the block never blocks the
 * main thread on a large file. Aborting the caller's signal terminates the
 * worker and rejects with a `DOMException` named `AbortError`, which the block
 * ignores: a cancelled or replaced file must leave no preview behind.
 */
import {
  parseCsvTable,
  type CsvParseError,
  type CsvParseOutcome,
  type CsvParser,
  type CsvTable,
} from "./csv";

export type CsvWorkerRequest = {
  type: "parse";
  token: number;
  text: string;
  columns: string[];
};

export type CsvWorkerResponse =
  | { type: "parsed"; token: number; table: CsvTable }
  | { type: "failed"; token: number; error: CsvParseError };

export type { CsvParseOutcome, CsvParser };

type WorkerScope = {
  WorkerGlobalScope?: unknown;
  addEventListener?: (
    type: "message",
    listener: (event: MessageEvent<CsvWorkerRequest>) => void,
  ) => void;
  postMessage?: (message: CsvWorkerResponse) => void;
};

const workerScope = globalThis as WorkerScope;

if (workerScope.WorkerGlobalScope !== undefined) {
  workerScope.addEventListener?.("message", (event) => {
    const message = event.data;
    if (message?.type !== "parse") return;
    const result = parseCsvTable(message.text, message.columns);
    workerScope.postMessage?.(
      result.ok
        ? { type: "parsed", token: message.token, table: result.table }
        : { type: "failed", token: message.token, error: result.error },
    );
  });
}

function aborted(): DOMException {
  return new DOMException("CSV parsing was cancelled", "AbortError");
}

let lastToken = 0;

/**
 * Parses `text` in a module worker. Each call carries a monotonically
 * increasing token, so a response for a superseded request is dropped instead
 * of overwriting a newer preview.
 */
export const parseInWorker: CsvParser = ({ text, columns, signal }) => {
  if (signal?.aborted) return Promise.reject(aborted());

  const WorkerCtor = (globalThis as { Worker?: typeof Worker }).Worker;
  if (!WorkerCtor) return Promise.reject(new Error("Web Workers are not available"));

  lastToken += 1;
  const token = lastToken;
  const worker = new WorkerCtor(new URL("./csv.worker.ts", import.meta.url), { type: "module" });

  return new Promise<CsvParseOutcome>((resolve, reject) => {
    const settle = (outcome: CsvParseOutcome) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      resolve(outcome);
    };
    const onAbort = () => {
      worker.terminate();
      reject(aborted());
    };

    worker.addEventListener("message", (event: MessageEvent<CsvWorkerResponse>) => {
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
      reject(new Error("The CSV worker failed"));
    });

    signal?.addEventListener("abort", onAbort);

    const request: CsvWorkerRequest = { type: "parse", token, text, columns: [...columns] };
    worker.postMessage(request);
  });
};
