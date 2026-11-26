/**
 * Pure, dependency-free CSV parsing for the Import block.
 *
 * RFC 4180 quoting with `"` only: a literal `'` is never a delimiter or a quote,
 * and `""` inside a quoted field is one `"`. Records split on CRLF, LF, or CR,
 * and a leading UTF-8 BOM is dropped. Every record keeps the 1-based physical
 * line it starts on, so a record that spans newlines cannot shift the numbers
 * reported for the records after it.
 */

/** Browser-side ceiling for a single import file. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Nonblank data records (the header does not count). */
export const MAX_IMPORT_ROWS = 1000;

/** Preview rows rendered before the block falls back to the total. */
export const PREVIEW_SAMPLE_ROWS = 50;

export type CsvRecord = {
  /** 1-based physical line where this record starts. */
  lineNumber: number;
  fields: string[];
};

export type CsvTableRow = {
  lineNumber: number;
  values: Record<string, string>;
};

export type CsvParseRequest = {
  text: string;
  columns: readonly string[];
  signal?: AbortSignal | undefined;
};

export type CsvTable = {
  headers: string[];
  rows: CsvTableRow[];
  total: number;
};

export type CsvParseError =
  | { kind: "empty-file" }
  | { kind: "missing-headers"; headers: string[] }
  | { kind: "unknown-headers"; headers: string[] }
  | { kind: "repeated-headers"; headers: string[] }
  | { kind: "too-many-rows"; total: number; limit: number }
  | { kind: "too-many-cells"; lineNumber: number; cells: number; headers: number };

export type CsvParseOutcome = { ok: true; table: CsvTable } | { ok: false; error: CsvParseError };

/** The seam the Import block parses through; defaults to the module worker. */
export type CsvParser = (request: CsvParseRequest) => Promise<CsvParseOutcome>;

function decode(input: string | Uint8Array): string {
  const text = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

/**
 * Splits text into records of fields. The trailing newline of a well-formed
 * file does not produce a final empty record; blank records are kept so their
 * line positions can still be consumed.
 */
export function parseCsvRecords(input: string | Uint8Array): CsvRecord[] {
  const text = decode(input);
  const records: CsvRecord[] = [];

  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(field);
    records.push({ lineNumber: recordLine, fields });
    fields = [];
    field = "";
    atFieldStart = true;
    inQuotes = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);

    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(index + 1) === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else if (char === "\r") {
        field += char;
        if (text.charAt(index + 1) === "\n") {
          field += "\n";
          index += 1;
        }
        line += 1;
      } else if (char === "\n") {
        field += char;
        line += 1;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (char === ",") {
      fields.push(field);
      field = "";
      atFieldStart = true;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text.charAt(index + 1) === "\n") index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      field += char;
      atFieldStart = false;
    }
  }

  const pending = fields.length > 0 || field !== "" || inQuotes || !atFieldStart;
  if (pending) endRecord();

  return records;
}

function isBlankRecord(record: CsvRecord): boolean {
  return record.fields.every((value) => value.trim() === "");
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * Reads the header row, rejects a file whose columns do not match `columns`
 * exactly, and turns the remaining nonblank records into rows keyed by header
 * name. Header names are trimmed and compared case-sensitively.
 */
export function parseCsvTable(
  input: string | Uint8Array,
  columns: readonly string[],
): CsvParseOutcome {
  const records = parseCsvRecords(input).filter((record) => !isBlankRecord(record));
  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) return { ok: false, error: { kind: "empty-file" } };

  const headers = headerRecord.fields.map((value) => value.trim());

  const repeated = dedupe(headers.filter((header, index) => headers.indexOf(header) !== index));
  if (repeated.length > 0)
    return { ok: false, error: { kind: "repeated-headers", headers: repeated } };

  const known = new Set(columns);
  const unknown = dedupe(headers.filter((header) => !known.has(header)));
  if (unknown.length > 0)
    return { ok: false, error: { kind: "unknown-headers", headers: unknown } };

  const present = new Set(headers);
  const missing = columns.filter((column) => !present.has(column));
  if (missing.length > 0)
    return { ok: false, error: { kind: "missing-headers", headers: missing } };

  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: { kind: "too-many-rows", total: dataRecords.length, limit: MAX_IMPORT_ROWS },
    };
  }

  // A record with more cells than headers is rejected rather than truncated: an
  // unquoted comma in the last cell would otherwise silently drop the rest of a
  // stored field. Fewer cells is fine and pads with empty strings.
  const overWide = dataRecords.find((record) => record.fields.length > headers.length);
  if (overWide) {
    return {
      ok: false,
      error: {
        kind: "too-many-cells",
        lineNumber: overWide.lineNumber,
        cells: overWide.fields.length,
        headers: headers.length,
      },
    };
  }

  const rows = dataRecords.map((record) => {
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = record.fields[index] ?? "";
    });
    return { lineNumber: record.lineNumber, values };
  });

  return { ok: true, table: { headers, rows, total: rows.length } };
}

/**
 * Serializes one record of `columns` followed by a newline. Only fields that
 * contain a delimiter, a quote, or a line break are quoted.
 */
export function serializeCsvTemplate(columns: readonly string[]): string {
  const line = columns
    .map((value) =>
      /[",\r\n]/.test(value) || value.trim() !== value ? `"${value.replace(/"/g, '""')}"` : value,
    )
    .join(",");
  return `${line}\n`;
}
