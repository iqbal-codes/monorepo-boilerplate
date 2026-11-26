/**
 * CSV generation for the Export block.
 *
 * Pure and transport-free: the worker (`./worker.ts`) decodes the opaque
 * payload the Screen fetched, builds the whole file here, and posts it back
 * once. Nothing in this module touches React, the network, or the DOM.
 *
 * Format: UTF-8 without a BOM, RFC 4180 records separated by CRLF, every cell
 * quoted only when it contains a comma, a double quote, CR, or LF.
 *
 * Spreadsheet safety: text whose first non-whitespace character is `=`, `+`,
 * `-`, or `@` (or whose leading whitespace is a tab or CR) gets a leading
 * apostrophe before quoting, so a spreadsheet cannot execute it as a formula.
 * Only string cells are checked, so a negative JSON number stays numeric.
 */

export const CSV_MIME_TYPE = "text/csv;charset=utf-8";

const RECORD_SEPARATOR = "\r\n";
const FORMULA_MARKERS = new Set(["=", "+", "-", "@"]);

export type CsvCell = string | number | null;

export type CsvExportPayload = {
  headers: string[];
  rows: CsvCell[][];
};

export type CsvExportHttpRequest = {
  url: string;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  /** Optional JSON key path to unwrap an opaque payload string from an API envelope. */
  payloadPath?: readonly string[];
};

export type CsvExportPayloadRequest = {
  type?: "payload";
  payload: string;
  filename: string;
};

export type CsvExportRequest =
  | CsvExportPayloadRequest
  | { type: "http"; request: CsvExportHttpRequest; filename: string }
  | { type: "abort" };

export type CsvExportResponse =
  | { type: "stage"; stage: "fetching" | "generating" }
  | { type: "done"; file: File; rowCount: number }
  | { type: "error"; message: string }
  | { type: "http-error"; status?: number; body?: string; message?: string }
  | { type: "aborted" };

/**
 * Unwraps a raw response string when the API nests the opaque payload inside an
 * envelope object (for example `["result", "data"]`).
 */
export function unwrapCsvExportPayload(rawText: string, payloadPath?: readonly string[]): string {
  if (!payloadPath || payloadPath.length === 0) return rawText;

  let current: unknown;
  try {
    current = JSON.parse(rawText);
  } catch {
    throw new Error("Export payload is not valid JSON.");
  }

  for (const segment of payloadPath) {
    if (!isRecord(current) || !(segment in current)) {
      throw new Error("Export payload is missing the expected data field.");
    }
    current = current[segment];
  }

  if (typeof current !== "string") {
    throw new Error("Export payload data must be text.");
  }
  return current;
}

/**
 * Validates the opaque payload before any file exists. A payload that does not
 * match the documented shape produces an error response, never a partial file.
 */
export function decodeCsvExportPayload(payload: string): CsvExportPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Export payload is not valid JSON.");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
    throw new Error("Export payload must include headers and rows.");
  }

  const headers: unknown[] = parsed.headers;
  if (!headers.every((header) => typeof header === "string")) {
    throw new Error("Every export header must be text.");
  }
  const typedHeaders: string[] = headers;

  const rows = parsed.rows.map((row: unknown, index: number) => {
    if (!Array.isArray(row) || row.length !== typedHeaders.length) {
      throw new Error(`Export row ${index + 1} has the wrong number of cells.`);
    }
    const cells: unknown[] = row;
    return cells.map((cell) => {
      if (cell === null || typeof cell === "string") return cell;
      if (typeof cell === "number" && Number.isSafeInteger(cell)) return cell;
      if (typeof cell === "number") {
        throw new Error(
          `Export row ${index + 1} has a numeric cell that cannot be written exactly.`,
        );
      }
      throw new Error(`Export row ${index + 1} has an unsupported cell value.`);
    });
  });

  return { headers: typedHeaders, rows };
}

/** True when a spreadsheet would read the text as a formula. */
export function startsFormula(text: string): boolean {
  for (const character of text) {
    if (FORMULA_MARKERS.has(character)) return true;
    if (character === "\t" || character === "\r") return true;
    if (character.trim() === "") continue;
    return false;
  }
  return false;
}

export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null) return "";
  const text = typeof cell === "number" ? String(cell) : startsFormula(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCsv({ headers, rows }: CsvExportPayload): string {
  const records = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) records.push(row.map(escapeCsvCell).join(","));
  return `${records.join(RECORD_SEPARATOR)}${RECORD_SEPARATOR}`;
}

/** Worker body: decode, validate, and generate exactly one response. */
export function runCsvExport({ payload, filename }: CsvExportPayloadRequest): CsvExportResponse {
  try {
    const decoded = decodeCsvExportPayload(payload);
    const file = new File([buildCsv(decoded)], filename, { type: CSV_MIME_TYPE });
    return { type: "done", file, rowCount: decoded.rows.length };
  } catch (cause) {
    return {
      type: "error",
      message: cause instanceof Error ? cause.message : "Could not build the CSV file.",
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
