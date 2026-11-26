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

export type CsvExportRequest = {
  payload: string;
  filename: string;
};

export type CsvExportResponse =
  | { type: "done"; file: File; rowCount: number }
  | { type: "error"; message: string };

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
      if (typeof cell === "number" && Number.isFinite(cell)) return cell;
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
export function runCsvExport({ payload, filename }: CsvExportRequest): CsvExportResponse {
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
