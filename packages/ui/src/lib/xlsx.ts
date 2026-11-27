/**
 * Pure, DOM-free and network-free OOXML `.xlsx` template builder and bounded
 * strict parser for the Import and Export blocks.
 *
 * Pre-materialization resource budgets bound ZIP entry count, per-entry and
 * total inflated bytes (checked both from ZIP Central Directory metadata and via
 * bounded streaming decompression), shared strings, and worksheet rows/cells
 * examined without dense grid allocation over sparse cell ranges.
 *
 * Strict value rules:
 * - Rejects 0-sheet and multisheet workbooks (including hidden sheets).
 * - Rejects formula cells (even when cached `<v>` results are present).
 * - Preserves literal string values without coercion or apostrophe stripping.
 * - Accepts numeric cells only within Excel's 15-significant-digit precision
 *   (`|n| <= 999,999,999,999,999` and <= 15 significant digits) and rejects
 *   imprecise numeric cells; safe integers outside 15 digits must be text.
 */
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, type CsvTable, type CsvTableRow } from "./csv";

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const MAX_XLSX_ZIP_ENTRIES = 128;
export const MAX_XLSX_ENTRY_BYTES = 8 * 1024 * 1024;
export const MAX_XLSX_TOTAL_INFLATED_BYTES = 20 * 1024 * 1024;
export const MAX_XLSX_SHARED_STRINGS = 100_000;
export const MAX_XLSX_SHARED_STRING_CHARS = 8_000_000;
export const MAX_XLSX_ROWS_EXAMINED = 10_000;
export const MAX_XLSX_CELLS_EXAMINED = 50_000;
const MAX_XLSX_CELL_CHARS = 65_536;
const MAX_EXCEL_RELIABLE_INTEGER = 999_999_999_999_999;

export type XlsxCell = string | number | null;

export type XlsxWorkbookPayload = {
  headers: readonly string[];
  rows: readonly (readonly XlsxCell[])[];
};

export type XlsxBudgetReason =
  | "entries"
  | "entry-size"
  | "total-size"
  | "shared-strings"
  | "rows-examined"
  | "cells-examined";

export type XlsxParseError =
  | { kind: "file-too-large"; bytes: number; limit: number }
  | { kind: "malformed-workbook"; detail?: string }
  | { kind: "over-budget"; reason: XlsxBudgetReason }
  | { kind: "no-sheets" }
  | { kind: "multiple-sheets"; count: number }
  | { kind: "empty-file" }
  | { kind: "missing-headers"; headers: string[] }
  | { kind: "unknown-headers"; headers: string[] }
  | { kind: "repeated-headers"; headers: string[] }
  | { kind: "too-many-rows"; total: number; limit: number; truncated?: boolean }
  | { kind: "unmapped-cell"; lineNumber: number; cellRef: string }
  | { kind: "formula-cell"; lineNumber: number; cellRef: string }
  | { kind: "imprecise-number"; lineNumber: number; cellRef: string }
  | { kind: "error-cell"; lineNumber: number; cellRef: string; value: string };

export type XlsxParseOutcome = { ok: true; table: CsvTable } | { ok: false; error: XlsxParseError };

export type XlsxParseRequest = {
  file: File;
  columns: readonly string[];
  signal?: AbortSignal | undefined;
};

export type XlsxParser = (request: XlsxParseRequest) => Promise<XlsxParseOutcome>;

const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;
const STORED_METHOD = 0;

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>' +
  "</workbook>";

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

// `numFmtId="49"` is the built-in Text (`@`) format so spreadsheets keep
// cells as text even if later edited in place.
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
  "</styleSheet>";

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(input: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const [, compressed] = await Promise.all([
    writer.write(input).then(() => writer.close()),
    new Response(stream.readable).arrayBuffer(),
  ]);
  return new Uint8Array(compressed);
}

type ZipEntryInput = {
  name: string;
  data: Uint8Array<ArrayBuffer>;
};

async function buildZip(entries: readonly ZipEntryInput[]): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const prepared = await Promise.all(
    entries.map(async (entry) => {
      const nameBytes = encoder.encode(entry.name);
      const compressed = await deflateRaw(entry.data);
      return {
        nameBytes,
        uncompressedSize: entry.data.byteLength,
        compressed,
        crc: crc32(entry.data),
      };
    }),
  );

  let localTotal = 0;
  let cdTotal = 0;
  for (const item of prepared) {
    localTotal += 30 + item.nameBytes.byteLength + item.compressed.byteLength;
    cdTotal += 46 + item.nameBytes.byteLength;
  }

  const out = new Uint8Array(localTotal + cdTotal + 22);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let pos = 0;

  for (const item of prepared) {
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, UTF8_FLAG, true);
    view.setUint16(pos + 8, DEFLATE_METHOD, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint32(pos + 14, item.crc, true);
    view.setUint32(pos + 18, item.compressed.byteLength, true);
    view.setUint32(pos + 22, item.uncompressedSize, true);
    view.setUint16(pos + 26, item.nameBytes.byteLength, true);
    view.setUint16(pos + 28, 0, true);
    out.set(item.nameBytes, pos + 30);
    out.set(item.compressed, pos + 30 + item.nameBytes.byteLength);
    pos += 30 + item.nameBytes.byteLength + item.compressed.byteLength;
  }

  const cdStart = pos;
  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i]!;
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, UTF8_FLAG, true);
    view.setUint16(pos + 10, DEFLATE_METHOD, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0, true);
    view.setUint32(pos + 16, item.crc, true);
    view.setUint32(pos + 20, item.compressed.byteLength, true);
    view.setUint32(pos + 24, item.uncompressedSize, true);
    view.setUint16(pos + 28, item.nameBytes.byteLength, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, offsets[i]!, true);
    out.set(item.nameBytes, pos + 46);
    pos += 46 + item.nameBytes.byteLength;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, cdTotal, true);
  view.setUint32(pos + 16, cdStart, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}

function columnName(index: number): string {
  let n = index;
  let name = "";
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

// Preserve literal spreadsheet escape tokens before encoding characters that
// XML 1.0 cannot represent. Keep carriage returns out of XML line normalization.
function escapeXmlText(text: string): string {
  const literal = text.replace(/_(?=x[\da-f]{4}_)/gi, "_x005F_");
  let result = "";
  for (let i = 0; i < literal.length; i += 1) {
    const code = literal.charCodeAt(i);
    if (code === 0x26) result += "&amp;";
    else if (code === 0x3c) result += "&lt;";
    else if (code === 0x3e) result += "&gt;";
    else if (code === 0x22) result += "&quot;";
    else if (code === 0x27) result += "&apos;";
    else if (code === 0x0d) result += "&#13;";
    else if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || code >= 0xfffe) {
      result += `_x${code.toString(16).toUpperCase().padStart(4, "0")}_`;
    } else {
      result += literal[i]!;
    }
  }
  return result;
}

function inlineStringCell(ref: string, text: string): string {
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${escapeXmlText(text)}</t></is></c>`;
}

function buildWorksheetXml({ headers, rows }: XlsxWorkbookPayload): string {
  const colNames = headers.map((_, index) => columnName(index));
  const chunks: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
    `<row r="1">${headers.map((header, col) => inlineStringCell(`${colNames[col]!}1`, header)).join("")}</row>`,
  ];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const rowNumber = rowIndex + 2;
    const cellXml: string[] = [];
    for (let col = 0; col < row.length; col += 1) {
      const cell = row[col];
      if (cell === null || cell === undefined) continue;
      if (typeof cell === "number") {
        if (!Number.isSafeInteger(cell)) {
          throw new Error(
            `Export row ${rowIndex + 1} has a numeric cell that cannot be written exactly.`,
          );
        }
        cellXml.push(inlineStringCell(`${colNames[col]!}${rowNumber}`, String(cell)));
      } else {
        cellXml.push(inlineStringCell(`${colNames[col]!}${rowNumber}`, cell));
      }
    }
    chunks.push(
      cellXml.length === 0
        ? `<row r="${rowNumber}"/>`
        : `<row r="${rowNumber}">${cellXml.join("")}</row>`,
    );
  }

  chunks.push("</sheetData></worksheet>");
  return chunks.join("");
}

/** Builds a compressed single-sheet `.xlsx` OOXML workbook from a validated payload. */
export async function buildXlsx(payload: XlsxWorkbookPayload): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const sheetXml = buildWorksheetXml(payload);

  return buildZip([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: encoder.encode(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: encoder.encode(WORKBOOK_XML) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(WORKBOOK_RELS_XML) },
    { name: "xl/styles.xml", data: encoder.encode(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml) },
  ]);
}

/** Builds a blank single-worksheet `.xlsx` template with the given header columns. */
export async function buildXlsxTemplate(
  columns: readonly string[],
): Promise<Uint8Array<ArrayBuffer>> {
  return buildXlsx({ headers: columns, rows: [] });
}

class XlsxRejection extends Error {
  constructor(readonly parseError: XlsxParseError) {
    super(parseError.kind);
  }
}

type ZipEntryMeta = {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

type ZipArchive = {
  bytes: Uint8Array;
  view: DataView;
  cdOffset: number;
  entries: Map<string, ZipEntryMeta>;
  totalInflatedBytes: number;
};

function normalizeZipPath(raw: string): string | null {
  const replaced = raw.replaceAll("\\", "/");
  if (replaced === "" || replaced.startsWith("/")) return null;
  const segments = replaced.split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    out.push(segment);
  }
  return out.length === 0 ? null : out.join("/");
}

function resolveRelativeZipPath(baseFile: string, target: string): string | null {
  const cleanTarget = target.replaceAll("\\", "/");
  if (cleanTarget.startsWith("/")) {
    return normalizeZipPath(cleanTarget.slice(1));
  }
  const slash = baseFile.lastIndexOf("/");
  const baseDir = slash === -1 ? "" : baseFile.slice(0, slash + 1);
  return normalizeZipPath(`${baseDir}${cleanTarget}`);
}

function readZipDirectory(bytes: Uint8Array): ZipArchive {
  if (bytes.byteLength < 22) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: "Archive is truncated." });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new XlsxRejection({
      kind: "malformed-workbook",
      detail: "Missing ZIP End of Central Directory.",
    });
  }

  const disk = view.getUint16(eocdOffset + 4, true);
  const cdDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntries = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (
    disk !== 0 ||
    cdDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff
  ) {
    throw new XlsxRejection({
      kind: "malformed-workbook",
      detail: "Multi-disk and ZIP64 archives are not supported.",
    });
  }

  if (totalEntries > MAX_XLSX_ZIP_ENTRIES) {
    throw new XlsxRejection({ kind: "over-budget", reason: "entries" });
  }

  if (cdOffset + cdSize > eocdOffset) {
    throw new XlsxRejection({
      kind: "malformed-workbook",
      detail: "Invalid Central Directory bounds.",
    });
  }

  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, ZipEntryMeta>();
  let declaredTotal = 0;
  let offset = cdOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== 0x02014b50) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "Invalid Central Directory entry.",
      });
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const entryCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    if ((flags & 0x0001) !== 0) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "Encrypted workbooks are not supported.",
      });
    }
    if (method !== STORED_METHOD && method !== DEFLATE_METHOD) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "Unsupported ZIP compression method.",
      });
    }
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "ZIP64 entries are not supported.",
      });
    }
    if (offset + 46 + nameLen + extraLen + commentLen > eocdOffset) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "Truncated Central Directory entry.",
      });
    }

    if (uncompressedSize > MAX_XLSX_ENTRY_BYTES) {
      throw new XlsxRejection({ kind: "over-budget", reason: "entry-size" });
    }
    declaredTotal += uncompressedSize;
    if (declaredTotal > MAX_XLSX_TOTAL_INFLATED_BYTES) {
      throw new XlsxRejection({ kind: "over-budget", reason: "total-size" });
    }

    const rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
    if (rawName.endsWith("/")) continue;

    const name = normalizeZipPath(rawName);
    if (!name || entries.has(name)) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "Invalid or duplicate archive path.",
      });
    }

    entries.set(name, {
      name,
      method,
      crc32: entryCrc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
  }

  return { bytes, view, cdOffset, entries, totalInflatedBytes: 0 };
}

async function inflateBoundedDeflate(
  compressed: Uint8Array,
  maxEntryBytes: number,
  remainingTotalBytes: number,
): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  const chunks: Uint8Array[] = [];
  let total = 0;
  let budgetError: XlsxRejection | null = null;

  const writeAll = (async () => {
    try {
      const CHUNK_SIZE = 65_536;
      for (let pos = 0; pos < compressed.byteLength; pos += CHUNK_SIZE) {
        if (budgetError) break;
        const slice = compressed.slice(pos, Math.min(pos + CHUNK_SIZE, compressed.byteLength));
        await writer.write(slice);
      }
      await writer.close();
    } catch {
      // Ignored if reader cancelled early due to budget enforcement or malformed stream.
    }
  })();

  const readAll = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxEntryBytes) {
        budgetError = new XlsxRejection({ kind: "over-budget", reason: "entry-size" });
        await reader.cancel().catch(() => {});
        await writer.abort().catch(() => {});
        throw budgetError;
      }
      if (total > remainingTotalBytes) {
        budgetError = new XlsxRejection({ kind: "over-budget", reason: "total-size" });
        await reader.cancel().catch(() => {});
        await writer.abort().catch(() => {});
        throw budgetError;
      }
      chunks.push(value);
    }
  })();

  try {
    await Promise.all([writeAll, readAll]);
  } catch (cause) {
    if (cause instanceof XlsxRejection) throw cause;
    throw new XlsxRejection({ kind: "malformed-workbook", detail: "Corrupt compressed entry." });
  }

  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

async function readZipEntryText(archive: ZipArchive, name: string): Promise<string> {
  const entry = archive.entries.get(name);
  if (!entry) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: `Missing ${name}.` });
  }

  const { bytes, view, cdOffset } = archive;
  const lh = entry.localHeaderOffset;
  if (lh + 30 > cdOffset || view.getUint32(lh, true) !== 0x04034b50) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: `Corrupt local header.` });
  }
  const localNameLen = view.getUint16(lh + 26, true);
  const localExtraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + localNameLen + localExtraLen;
  if (dataStart + entry.compressedSize > cdOffset) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: `Truncated entry data.` });
  }

  const remainingTotal = MAX_XLSX_TOTAL_INFLATED_BYTES - archive.totalInflatedBytes;
  const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  let data: Uint8Array;

  if (entry.method === STORED_METHOD) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      throw new XlsxRejection({
        kind: "malformed-workbook",
        detail: "Stored entry size mismatch.",
      });
    }
    if (raw.byteLength > MAX_XLSX_ENTRY_BYTES) {
      throw new XlsxRejection({ kind: "over-budget", reason: "entry-size" });
    }
    if (raw.byteLength > remainingTotal) {
      throw new XlsxRejection({ kind: "over-budget", reason: "total-size" });
    }
    data = raw;
  } else {
    data = await inflateBoundedDeflate(raw, MAX_XLSX_ENTRY_BYTES, remainingTotal);
  }

  if (data.byteLength !== entry.uncompressedSize) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: "Uncompressed size mismatch." });
  }
  if (crc32(data) !== entry.crc32) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: "CRC-32 checksum mismatch." });
  }

  archive.totalInflatedBytes += data.byteLength;
  const xml = new TextDecoder("utf-8").decode(data);
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new XlsxRejection({
      kind: "malformed-workbook",
      detail: "DOCTYPE and ENTITY declarations are not allowed.",
    });
  }
  return xml;
}

function decodeXmlText(raw: string): string {
  const normalized = raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (!normalized.includes("&")) return normalized;
  return normalized.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|quot|apos|amp);/g, (full, entity) => {
    switch (entity) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      case "amp":
        return "&";
      default: {
        const code = entity.startsWith("#x")
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
        if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return full;
        return String.fromCodePoint(code);
      }
    }
  });
}

function decodeSpreadsheetText(text: string): string {
  return text.replace(/_x([\da-f]{4})_/gi, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function localTagName(tagName: string): string {
  const colon = tagName.indexOf(":");
  return colon === -1 ? tagName : tagName.slice(colon + 1);
}

function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  const len = attrText.length;

  while (pos < len) {
    while (pos < len && attrText.charCodeAt(pos) <= 32) pos += 1;
    if (pos >= len) break;
    const eq = attrText.indexOf("=", pos);
    if (eq === -1) break;
    const rawKey = attrText.slice(pos, eq).trim();
    pos = eq + 1;
    while (pos < len && attrText.charCodeAt(pos) <= 32) pos += 1;
    if (pos >= len) break;
    const quote = attrText[pos];
    if (quote !== '"' && quote !== "'") break;
    pos += 1;
    const endQuote = attrText.indexOf(quote, pos);
    if (endQuote === -1) break;
    const val = decodeXmlText(attrText.slice(pos, endQuote));
    attrs[rawKey] = val;
    const colon = rawKey.indexOf(":");
    if (colon !== -1) {
      const local = rawKey.slice(colon + 1);
      if (!(local in attrs)) attrs[local] = val;
    }
    pos = endQuote + 1;
  }

  return attrs;
}

type XmlVisitor = {
  onStartElement?: (localName: string, attrs: Record<string, string>, selfClosing: boolean) => void;
  onEndElement?: (localName: string) => void;
  onText?: (text: string) => void;
};

function scanXml(xml: string, visitor: XmlVisitor): void {
  let pos = 0;
  const len = xml.length;

  while (pos < len) {
    const lt = xml.indexOf("<", pos);
    if (lt === -1) {
      if (pos < len) visitor.onText?.(decodeXmlText(xml.slice(pos)));
      break;
    }
    if (lt > pos) {
      visitor.onText?.(decodeXmlText(xml.slice(pos, lt)));
    }

    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end === -1) {
        throw new XlsxRejection({
          kind: "malformed-workbook",
          detail: "Unterminated XML comment.",
        });
      }
      pos = end + 3;
      continue;
    }

    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end === -1) {
        throw new XlsxRejection({
          kind: "malformed-workbook",
          detail: "Unterminated XML declaration.",
        });
      }
      pos = end + 2;
      continue;
    }

    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) {
        throw new XlsxRejection({
          kind: "malformed-workbook",
          detail: "Unterminated CDATA section.",
        });
      }
      visitor.onText?.(xml.slice(lt + 9, end));
      pos = end + 3;
      continue;
    }

    // Find closing `>` outside attribute quotes.
    let cursor = lt + 1;
    let quote: string | null = null;
    while (cursor < len) {
      const ch = xml[cursor]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      cursor += 1;
    }
    if (cursor >= len) {
      throw new XlsxRejection({ kind: "malformed-workbook", detail: "Unterminated XML tag." });
    }

    const inside = xml.slice(lt + 1, cursor).trim();
    pos = cursor + 1;
    if (inside === "") continue;

    if (inside.startsWith("/")) {
      const name = inside.slice(1).trim();
      visitor.onEndElement?.(localTagName(name));
      continue;
    }

    const selfClosing = inside.endsWith("/");
    const body = selfClosing ? inside.slice(0, -1).trimEnd() : inside;
    let spaceIdx = -1;
    for (let i = 0; i < body.length; i += 1) {
      if (body.charCodeAt(i) <= 32) {
        spaceIdx = i;
        break;
      }
    }
    const rawName = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
    const attrText = spaceIdx === -1 ? "" : body.slice(spaceIdx + 1);
    const name = localTagName(rawName);
    const attrs = attrText ? parseAttributes(attrText) : {};

    visitor.onStartElement?.(name, attrs, selfClosing);
    if (selfClosing) visitor.onEndElement?.(name);
  }
}

type Relationship = {
  id: string;
  type: string;
  target: string;
  external: boolean;
};

function parseRelationships(xml: string): Relationship[] {
  const rels: Relationship[] = [];
  scanXml(xml, {
    onStartElement(name, attrs) {
      if (name !== "Relationship") return;
      if (!attrs.Id || !attrs.Type || !attrs.Target) return;
      rels.push({
        id: attrs.Id,
        type: attrs.Type,
        target: attrs.Target,
        external: attrs.TargetMode?.toLowerCase() === "external",
      });
    },
  });
  return rels;
}

function isRelType(type: string, suffix: string): boolean {
  return type.endsWith(`/${suffix}`);
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  let totalChars = 0;
  let inSi = false;
  let rphDepth = 0;
  let inT = false;
  let current = "";

  scanXml(xml, {
    onStartElement(name) {
      if (name === "si") {
        if (strings.length >= MAX_XLSX_SHARED_STRINGS) {
          throw new XlsxRejection({ kind: "over-budget", reason: "shared-strings" });
        }
        inSi = true;
        rphDepth = 0;
        inT = false;
        current = "";
      } else if (inSi && name === "rPh") {
        rphDepth += 1;
      } else if (inSi && rphDepth === 0 && name === "t") {
        inT = true;
      }
    },
    onText(text) {
      if (!inSi || rphDepth > 0 || !inT) return;
      if (current.length + text.length > MAX_XLSX_CELL_CHARS) {
        throw new XlsxRejection({ kind: "over-budget", reason: "shared-strings" });
      }
      totalChars += text.length;
      if (totalChars > MAX_XLSX_SHARED_STRING_CHARS) {
        throw new XlsxRejection({ kind: "over-budget", reason: "shared-strings" });
      }
      current += decodeSpreadsheetText(text);
    },
    onEndElement(name) {
      if (name === "t") {
        inT = false;
      } else if (name === "rPh" && rphDepth > 0) {
        rphDepth -= 1;
      } else if (name === "si" && inSi) {
        strings.push(current);
        inSi = false;
        current = "";
      }
    },
  });

  return strings;
}

function parseCellReference(ref: string): { colIndex: number; rowNumber: number } | null {
  const match = /^([A-Z]{1,3})(\d+)$/.exec(ref.trim().toUpperCase());
  if (!match) return null;
  const colLetters = match[1]!;
  const rowNumber = Number.parseInt(match[2]!, 10);
  if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1_048_576) return null;

  let colIndex = 0;
  for (let i = 0; i < colLetters.length; i += 1) {
    colIndex = colIndex * 26 + (colLetters.charCodeAt(i) - 64);
  }
  colIndex -= 1;
  if (colIndex < 0 || colIndex > 16_383) return null;
  return { colIndex, rowNumber };
}

/**
 * Parses an OOXML numeric `<v>` string strictly.
 *
 * Rejects numbers exceeding 15 significant digits or `|n| > 999,999,999,999,999`
 * because Excel's numeric storage silently rounds integers and floats beyond
 * 15 significant digits. Safe integers beyond 15 digits must arrive as text.
 */
function parseStrictExcelNumber(rawInput: string): string | null {
  const raw = rawInput.trim();
  const match = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) return null;

  const digits = (match[2] ?? "") + (match[3] ?? "") + (match[4] ?? "");
  let start = 0;
  while (start < digits.length && digits[start] === "0") start += 1;
  let end = digits.length - 1;
  while (end >= start && digits[end] === "0") end -= 1;
  const sigDigits = end >= start ? end - start + 1 : 0;
  if (sigDigits > 15) return null;

  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  if (Math.abs(num) > MAX_EXCEL_RELIABLE_INTEGER) return null;
  return num === 0 ? "0" : String(num);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validateHeaderRow(
  rowCells: Map<number, string>,
  columns: readonly string[],
): { headers: string[]; headerByCol: Map<number, string> } {
  const sortedCols = [...rowCells.keys()].sort((a, b) => a - b);
  const entries: Array<{ colIndex: number; header: string }> = [];
  for (const colIndex of sortedCols) {
    const trimmed = (rowCells.get(colIndex) ?? "").trim();
    if (trimmed === "") continue;
    entries.push({ colIndex, header: trimmed });
  }

  const headers = entries.map((entry) => entry.header);
  const repeated = dedupe(headers.filter((header, index) => headers.indexOf(header) !== index));
  if (repeated.length > 0) {
    throw new XlsxRejection({ kind: "repeated-headers", headers: repeated });
  }

  const known = new Set(columns);
  const unknown = dedupe(headers.filter((header) => !known.has(header)));
  if (unknown.length > 0) {
    throw new XlsxRejection({ kind: "unknown-headers", headers: unknown });
  }

  const present = new Set(headers);
  const missing = columns.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new XlsxRejection({ kind: "missing-headers", headers: missing });
  }

  const headerByCol = new Map<number, string>();
  for (const entry of entries) headerByCol.set(entry.colIndex, entry.header);
  return { headers, headerByCol };
}

function parseWorksheetXml(
  sheetXml: string,
  sharedStrings: readonly string[],
  columns: readonly string[],
): CsvTable {
  let hasSheetData = false;
  let inSheetData = false;
  let rowsExamined = 0;
  let cellsExamined = 0;

  let inRow = false;
  let currentRowNumber = 0;
  let lastRowNumber = 0;
  let lastColIndex = -1;
  let rowCells = new Map<number, string>();

  let inCell = false;
  let cellRef = "";
  let cellColIndex = 0;
  let cellType = "";
  let inV = false;
  let hasV = false;
  let vText = "";
  let inIs = false;
  let inIsT = false;
  let isRphDepth = 0;
  let inlineText = "";

  let headerDone = false;
  let headers: string[] = [];
  let headerByCol = new Map<number, string>();
  let dataRowCount = 0;
  const rows: CsvTableRow[] = [];

  scanXml(sheetXml, {
    onStartElement(name, attrs) {
      if (name === "sheetData") {
        hasSheetData = true;
        inSheetData = true;
        return;
      }
      if (!inSheetData) return;

      if (name === "row") {
        rowsExamined += 1;
        if (rowsExamined > MAX_XLSX_ROWS_EXAMINED) {
          throw new XlsxRejection({ kind: "over-budget", reason: "rows-examined" });
        }
        let rowNum = lastRowNumber + 1;
        if (attrs.r !== undefined) {
          const parsedRow = Number.parseInt(attrs.r, 10);
          if (
            !/^\d+$/.test(attrs.r.trim()) ||
            !Number.isInteger(parsedRow) ||
            parsedRow < 1 ||
            parsedRow > 1_048_576 ||
            parsedRow <= lastRowNumber
          ) {
            throw new XlsxRejection({ kind: "malformed-workbook", detail: "Invalid row index." });
          }
          rowNum = parsedRow;
        }
        inRow = true;
        currentRowNumber = rowNum;
        lastRowNumber = rowNum;
        lastColIndex = -1;
        rowCells = new Map<number, string>();
        return;
      }

      if (!inRow) return;

      if (name === "c") {
        cellsExamined += 1;
        if (cellsExamined > MAX_XLSX_CELLS_EXAMINED) {
          throw new XlsxRejection({ kind: "over-budget", reason: "cells-examined" });
        }
        let colIndex = lastColIndex + 1;
        let ref = `${columnName(colIndex)}${currentRowNumber}`;
        if (attrs.r !== undefined) {
          const parsedRef = parseCellReference(attrs.r);
          if (!parsedRef || parsedRef.rowNumber !== currentRowNumber) {
            throw new XlsxRejection({
              kind: "malformed-workbook",
              detail: "Invalid cell reference.",
            });
          }
          colIndex = parsedRef.colIndex;
          ref = attrs.r.trim().toUpperCase();
        }
        lastColIndex = colIndex;
        inCell = true;
        cellRef = ref;
        cellColIndex = colIndex;
        cellType = attrs.t ?? "";
        inV = false;
        hasV = false;
        vText = "";
        inIs = false;
        inIsT = false;
        isRphDepth = 0;
        inlineText = "";
        return;
      }

      if (!inCell) return;

      if (name === "f") {
        throw new XlsxRejection({
          kind: "formula-cell",
          lineNumber: currentRowNumber,
          cellRef,
        });
      }
      if (name === "v") {
        inV = true;
        hasV = true;
      } else if (name === "is") {
        inIs = true;
      } else if (inIs && name === "rPh") {
        isRphDepth += 1;
      } else if (inIs && isRphDepth === 0 && name === "t") {
        inIsT = true;
      }
    },

    onText(text) {
      if (!inCell) return;
      if (inV) {
        if (vText.length + text.length > MAX_XLSX_CELL_CHARS) {
          throw new XlsxRejection({ kind: "over-budget", reason: "cells-examined" });
        }
        vText += text;
      } else if (inIs && isRphDepth === 0 && inIsT) {
        if (inlineText.length + text.length > MAX_XLSX_CELL_CHARS) {
          throw new XlsxRejection({ kind: "over-budget", reason: "cells-examined" });
        }
        inlineText += decodeSpreadsheetText(text);
      }
    },

    onEndElement(name) {
      if (name === "t") {
        inIsT = false;
        return;
      }
      if (name === "rPh" && isRphDepth > 0) {
        isRphDepth -= 1;
        return;
      }
      if (name === "is") {
        inIs = false;
        return;
      }
      if (name === "v") {
        inV = false;
        return;
      }

      if (name === "c" && inCell) {
        let resolved = "";
        switch (cellType) {
          case "inlineStr":
            resolved = inlineText;
            break;
          case "s": {
            if (!hasV || vText.trim() === "") break;
            if (!/^\d+$/.test(vText.trim())) {
              throw new XlsxRejection({
                kind: "malformed-workbook",
                detail: "Invalid shared string index.",
              });
            }
            const idx = Number.parseInt(vText.trim(), 10);
            const str = sharedStrings[idx];
            if (str === undefined) {
              throw new XlsxRejection({
                kind: "malformed-workbook",
                detail: "Out-of-bounds shared string index.",
              });
            }
            resolved = str;
            break;
          }
          case "str":
            resolved = decodeSpreadsheetText(vText);
            break;
          case "b": {
            if (!hasV || vText.trim() === "") break;
            const norm = vText.trim().toLowerCase();
            if (norm === "1" || norm === "true") resolved = "true";
            else if (norm === "0" || norm === "false") resolved = "false";
            else {
              throw new XlsxRejection({
                kind: "malformed-workbook",
                detail: "Invalid boolean cell value.",
              });
            }
            break;
          }
          case "e":
            throw new XlsxRejection({
              kind: "error-cell",
              lineNumber: currentRowNumber,
              cellRef,
              value: vText.trim() || "#ERROR!",
            });
          case "":
          case "n": {
            if (!hasV || vText.trim() === "") break;
            const strictNum = parseStrictExcelNumber(vText);
            if (strictNum === null) {
              throw new XlsxRejection({
                kind: "imprecise-number",
                lineNumber: currentRowNumber,
                cellRef,
              });
            }
            resolved = strictNum;
            break;
          }
          default:
            throw new XlsxRejection({
              kind: "malformed-workbook",
              detail: `Unsupported cell type "${cellType}".`,
            });
        }

        if (resolved !== "") {
          rowCells.set(cellColIndex, resolved);
        }
        inCell = false;
        return;
      }

      if (name === "row" && inRow) {
        inRow = false;
        let hasNonBlank = false;
        for (const value of rowCells.values()) {
          if (value.trim() !== "") {
            hasNonBlank = true;
            break;
          }
        }
        if (!hasNonBlank) return;

        if (!headerDone) {
          const validated = validateHeaderRow(rowCells, columns);
          headers = validated.headers;
          headerByCol = validated.headerByCol;
          headerDone = true;
          return;
        }

        dataRowCount += 1;
        if (dataRowCount > MAX_IMPORT_ROWS) {
          throw new XlsxRejection({
            kind: "too-many-rows",
            total: dataRowCount,
            limit: MAX_IMPORT_ROWS,
            truncated: true,
          });
        }

        for (const [colIndex, value] of rowCells) {
          if (!headerByCol.has(colIndex) && value.trim() !== "") {
            throw new XlsxRejection({
              kind: "unmapped-cell",
              lineNumber: currentRowNumber,
              cellRef: `${columnName(colIndex)}${currentRowNumber}`,
            });
          }
        }

        const values: Record<string, string> = {};
        for (const column of columns) values[column] = "";
        for (const [colIndex, header] of headerByCol) {
          values[header] = rowCells.get(colIndex) ?? "";
        }
        rows.push({ lineNumber: currentRowNumber, values });
        return;
      }

      if (name === "sheetData") {
        inSheetData = false;
      }
    },
  });

  if (!hasSheetData) {
    throw new XlsxRejection({ kind: "malformed-workbook", detail: "Worksheet missing sheetData." });
  }
  if (!headerDone) {
    throw new XlsxRejection({ kind: "empty-file" });
  }
  return { headers, rows, total: rows.length };
}

/**
 * Parses a compressed `.xlsx` workbook buffer into the same `CsvTable` shape
 * consumed by `ImportBlock` and `validateCustomerImportRows`.
 */
export async function parseXlsxTable(
  bytes: Uint8Array,
  columns: readonly string[],
): Promise<XlsxParseOutcome> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: { kind: "file-too-large", bytes: bytes.byteLength, limit: MAX_IMPORT_BYTES },
    };
  }

  try {
    const archive = readZipDirectory(bytes);

    const rootRelsXml = await readZipEntryText(archive, "_rels/.rels");
    const rootRels = parseRelationships(rootRelsXml);
    const workbookRel = rootRels.find((rel) => isRelType(rel.type, "officeDocument"));
    if (!workbookRel || workbookRel.external) {
      return {
        ok: false,
        error: { kind: "malformed-workbook", detail: "Missing workbook relationship." },
      };
    }

    const workbookPath = resolveRelativeZipPath("", workbookRel.target);
    if (!workbookPath) {
      return {
        ok: false,
        error: { kind: "malformed-workbook", detail: "Invalid workbook path." },
      };
    }

    const workbookXml = await readZipEntryText(archive, workbookPath);
    const sheets: Array<{ rId: string }> = [];
    scanXml(workbookXml, {
      onStartElement(name, attrs) {
        if (name !== "sheet") return;
        sheets.push({ rId: attrs.id ?? "" });
      },
    });

    if (sheets.length === 0) return { ok: false, error: { kind: "no-sheets" } };
    if (sheets.length > 1)
      return { ok: false, error: { kind: "multiple-sheets", count: sheets.length } };

    const sheetRId = sheets[0]!.rId;
    if (!sheetRId) {
      return {
        ok: false,
        error: { kind: "malformed-workbook", detail: "Worksheet relationship ID missing." },
      };
    }

    const wbSlash = workbookPath.lastIndexOf("/");
    const wbDir = wbSlash === -1 ? "" : workbookPath.slice(0, wbSlash + 1);
    const wbName = wbSlash === -1 ? workbookPath : workbookPath.slice(wbSlash + 1);
    const wbRelsPath = `${wbDir}_rels/${wbName}.rels`;
    const wbRelsXml = await readZipEntryText(archive, wbRelsPath);
    const wbRels = parseRelationships(wbRelsXml);

    const sheetRel = wbRels.find((rel) => rel.id === sheetRId);
    if (!sheetRel || sheetRel.external || !isRelType(sheetRel.type, "worksheet")) {
      return {
        ok: false,
        error: { kind: "malformed-workbook", detail: "Missing worksheet relationship." },
      };
    }

    const sheetPath = resolveRelativeZipPath(workbookPath, sheetRel.target);
    if (!sheetPath) {
      return {
        ok: false,
        error: { kind: "malformed-workbook", detail: "Invalid worksheet path." },
      };
    }

    const sstRel = wbRels.find((rel) => isRelType(rel.type, "sharedStrings") && !rel.external);
    let sharedStrings: string[] = [];
    if (sstRel) {
      const sstPath = resolveRelativeZipPath(workbookPath, sstRel.target);
      if (!sstPath) {
        return {
          ok: false,
          error: { kind: "malformed-workbook", detail: "Invalid shared strings path." },
        };
      }
      if (archive.entries.has(sstPath)) {
        const sstXml = await readZipEntryText(archive, sstPath);
        sharedStrings = parseSharedStrings(sstXml);
      }
    }

    const sheetXml = await readZipEntryText(archive, sheetPath);
    const table = parseWorksheetXml(sheetXml, sharedStrings, columns);
    return { ok: true, table };
  } catch (cause) {
    if (cause instanceof XlsxRejection) {
      return { ok: false, error: cause.parseError };
    }
    return {
      ok: false,
      error: {
        kind: "malformed-workbook",
        detail: cause instanceof Error ? cause.message : undefined,
      },
    };
  }
}
