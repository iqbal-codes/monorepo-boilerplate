/**
 * Pure, DOM-free and network-free OOXML `.xlsx` generator for the Export block.
 *
 * Writes a single-worksheet workbook inside a DEFLATE-compressed PKZIP archive.
 * Every header and non-null data cell (including `balanceMinor`, `+`-prefixed
 * phones, and formula-like text) is emitted as a literal `inlineStr` cell with
 * no CSV leading-apostrophe escaping, so spreadsheets preserve exact text and
 * integers beyond 15 digits without reinterpreting or rounding them.
 */
import {
  decodeCsvExportPayload,
  type CsvExportPayload,
  type CsvExportPayloadRequest,
  type CsvExportResponse,
} from "./csv";

export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const UTF8_FLAG = 0x0800;
const DEFLATE_METHOD = 8;

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

// Escape XML entities, preserve `\r` with `&#13;` so XML parsers do not fold
// CR to LF, and encode disallowed XML 1.0 control characters per OOXML §22.4.2.4.
function escapeXmlText(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x26) result += "&amp;";
    else if (code === 0x3c) result += "&lt;";
    else if (code === 0x3e) result += "&gt;";
    else if (code === 0x22) result += "&quot;";
    else if (code === 0x27) result += "&apos;";
    else if (code === 0x0d) result += "&#13;";
    else if (code < 0x20 && code !== 0x09 && code !== 0x0a) {
      result += `_x${code.toString(16).toUpperCase().padStart(4, "0")}_`;
    } else {
      result += text[i]!;
    }
  }
  return result;
}

function inlineStringCell(ref: string, text: string): string {
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${escapeXmlText(text)}</t></is></c>`;
}

function buildWorksheetXml({ headers, rows }: CsvExportPayload): string {
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
export async function buildXlsx(payload: CsvExportPayload): Promise<Uint8Array<ArrayBuffer>> {
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

/** Worker body: decode, validate, and generate a single compressed `.xlsx` File response. */
export async function runXlsxExport({
  payload,
  filename,
}: Omit<CsvExportPayloadRequest, "format">): Promise<CsvExportResponse> {
  try {
    const decoded = decodeCsvExportPayload(payload);
    const bytes = await buildXlsx(decoded);
    const file = new File([bytes], filename, { type: XLSX_MIME_TYPE });
    return { type: "done", file, rowCount: decoded.rows.length };
  } catch (cause) {
    return {
      type: "error",
      message: cause instanceof Error ? cause.message : "Could not build the Excel file.",
    };
  }
}
