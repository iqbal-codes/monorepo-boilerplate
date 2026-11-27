import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";

import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "../src/lib/csv";
import {
  MAX_XLSX_CELLS_EXAMINED,
  MAX_XLSX_ENTRY_BYTES,
  MAX_XLSX_ROWS_EXAMINED,
  MAX_XLSX_SHARED_STRINGS,
  MAX_XLSX_TOTAL_INFLATED_BYTES,
  MAX_XLSX_ZIP_ENTRIES,
  XLSX_MIME_TYPE,
  buildXlsx,
  buildXlsxTemplate,
  parseXlsxTable,
} from "../src/lib/xlsx";
import { parseXlsxInWorker, registerXlsxImportWorker } from "../src/lib/xlsx.worker";

const COLUMNS = [
  "name",
  "email",
  "phone",
  "company",
  "status",
  "balanceMinor",
  "currency",
  "notes",
] as const;

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

type RawZipEntry = {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  declaredUncompressedSize?: number;
  flags?: number;
};

function makeZip(entries: readonly RawZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const method = entry.method ?? 8;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;
    return {
      nameBytes: encoder.encode(entry.name),
      method,
      flags: entry.flags ?? 0x0800,
      crc: crc32(entry.data),
      compressed,
      uncompressedSize: entry.declaredUncompressedSize ?? entry.data.byteLength,
    };
  });

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
    view.setUint16(pos + 6, item.flags, true);
    view.setUint16(pos + 8, item.method, true);
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
    view.setUint16(pos + 8, item.flags, true);
    view.setUint16(pos + 10, item.method, true);
    view.setUint32(pos + 16, item.crc, true);
    view.setUint32(pos + 20, item.compressed.byteLength, true);
    view.setUint32(pos + 24, item.uncompressedSize, true);
    view.setUint16(pos + 28, item.nameBytes.byteLength, true);
    view.setUint32(pos + 42, offsets[i]!, true);
    out.set(item.nameBytes, pos + 46);
    pos += 46 + item.nameBytes.byteLength;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, cdTotal, true);
  view.setUint32(pos + 16, cdStart, true);

  return out;
}

function makeCustomWorkbook({
  sheets = [{ name: "Sheet1", id: 1, rId: "rId1", target: "worksheets/sheet1.xml" }],
  sheetFiles,
  sharedStringsXml,
}: {
  sheets?: Array<{ name: string; id: number; rId: string; target: string; state?: string }>;
  sheetFiles: Record<string, string>;
  sharedStringsXml?: string;
}): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const sheetXmlEntries = sheets
    .map(
      (s) =>
        `<sheet name="${s.name}" sheetId="${s.id}"${s.state ? ` state="${s.state}"` : ""} r:id="${s.rId}"/>`,
    )
    .join("");
  const relEntries = sheets
    .map(
      (s) =>
        `<Relationship Id="${s.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${s.target}"/>`,
    )
    .join("");
  const sstRel = sharedStringsXml
    ? '<Relationship Id="rIdSst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
    : "";

  const entries: RawZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXmlEntries}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relEntries}${sstRel}</Relationships>`,
      ),
    },
  ];

  for (const [path, xml] of Object.entries(sheetFiles)) {
    entries.push({ name: path, data: enc.encode(xml) });
  }
  if (sharedStringsXml) {
    entries.push({ name: "xl/sharedStrings.xml", data: enc.encode(sharedStringsXml) });
  }
  return makeZip(entries);
}

async function tableOf(bytes: Uint8Array, columns: readonly string[] = COLUMNS) {
  const result = await parseXlsxTable(bytes, columns);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.table;
}

async function errorOf(bytes: Uint8Array, columns: readonly string[] = COLUMNS) {
  const result = await parseXlsxTable(bytes, columns);
  if (result.ok) throw new Error("expected error, got ok");
  return result.error;
}

describe("buildXlsxTemplate & round-trip", () => {
  test("creates a single-worksheet workbook with the exact 8 columns and round-trips", async () => {
    const bytes = await buildXlsxTemplate(COLUMNS);
    const table = await tableOf(bytes);
    expect(table.headers).toEqual([...COLUMNS]);
    expect(table.rows).toEqual([]);
    expect(table.total).toBe(0);
  });
});

describe("parseXlsxTable worksheet and header rules", () => {
  test("accepts reordered headers, shared strings, inline strings, and trimmed headers", async () => {
    const bytes = makeCustomWorkbook({
      sharedStringsXml:
        '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4"><si><t>  email </t></si><si><t>name</t></si><si><r><t>Ada </t></r><r><t>Lovelace</t></r><rPh sb="0" eb="3"><t>ignored</t></rPh></si><si><t>ada@example.test</t></si></sst>',
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1">' +
          '<c r="A1" t="s"><v>0</v></c>' +
          '<c r="B1" t="s"><v>1</v></c>' +
          '<c r="C1" t="inlineStr"><is><t>notes</t></is></c>' +
          '<c r="D1" t="inlineStr"><is><t>currency</t></is></c>' +
          '<c r="E1" t="inlineStr"><is><t>balanceMinor</t></is></c>' +
          '<c r="F1" t="inlineStr"><is><t>status</t></is></c>' +
          '<c r="G1" t="inlineStr"><is><t>company</t></is></c>' +
          '<c r="H1" t="inlineStr"><is><t>phone</t></is></c>' +
          "</row>" +
          '<row r="2">' +
          '<c r="A2" t="s"><v>3</v></c>' +
          '<c r="B2" t="s"><v>2</v></c>' +
          '<c r="E2"><v>1250</v></c>' +
          '<c r="H2" t="inlineStr"><is><t>+15550100</t></is></c>' +
          "</row>" +
          "</sheetData></worksheet>",
      },
    });

    const table = await tableOf(bytes);
    expect(table.total).toBe(1);
    expect(table.rows[0]).toEqual({
      lineNumber: 2,
      values: {
        name: "Ada Lovelace",
        email: "ada@example.test",
        phone: "+15550100",
        company: "",
        status: "",
        balanceMinor: "1250",
        currency: "",
        notes: "",
      },
    });
  });

  test("rejects 0-sheet and multisheet workbooks (including hidden sheets)", async () => {
    const zeroSheets = makeCustomWorkbook({
      sheets: [],
      sheetFiles: {},
    });
    expect(await errorOf(zeroSheets)).toEqual({ kind: "no-sheets" });

    const twoSheets = makeCustomWorkbook({
      sheets: [
        { name: "Sheet1", id: 1, rId: "rId1", target: "worksheets/sheet1.xml" },
        { name: "Hidden", id: 2, rId: "rId2", target: "worksheets/sheet2.xml", state: "hidden" },
      ],
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
        "xl/worksheets/sheet2.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
      },
    });
    expect(await errorOf(twoSheets)).toEqual({ kind: "multiple-sheets", count: 2 });
  });

  test("rejects missing, unknown, duplicated, and empty-sheet headers", async () => {
    const missing = await buildXlsx({ headers: COLUMNS.slice(0, 7), rows: [["Ada"]] });
    expect(await errorOf(missing)).toEqual({ kind: "missing-headers", headers: ["notes"] });

    const unknown = await buildXlsx({ headers: [...COLUMNS, "nickname"], rows: [] });
    expect(await errorOf(unknown)).toEqual({ kind: "unknown-headers", headers: ["nickname"] });

    const repeated = await buildXlsx({ headers: [...COLUMNS, "email"], rows: [] });
    expect(await errorOf(repeated)).toEqual({ kind: "repeated-headers", headers: ["email"] });

    const emptySheet = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
      },
    });
    expect(await errorOf(emptySheet)).toEqual({ kind: "empty-file" });
  });

  test("ignores fully blank rows and preserves original 1-based worksheet row numbers", async () => {
    const bytes = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>   </t></is></c></row>' +
          '<row r="3">' +
          COLUMNS.map(
            (c, idx) =>
              `<c r="${String.fromCharCode(65 + idx)}3" t="inlineStr"><is><t>${c}</t></is></c>`,
          ).join("") +
          "</row>" +
          '<row r="4"/>' +
          '<row r="5"><c r="A5" t="inlineStr"><is><t>Ada</t></is></c><c r="B5" t="inlineStr"><is><t>ada@example.test</t></is></c></row>' +
          '<row r="6"><c r="A6" t="inlineStr"><is><t>   </t></is></c></row>' +
          '<row r="9"><c r="A9" t="inlineStr"><is><t>Grace</t></is></c><c r="B9" t="inlineStr"><is><t>grace@example.test</t></is></c></row>' +
          "</sheetData></worksheet>",
      },
    });

    const table = await tableOf(bytes);
    expect(table.rows.map((r) => r.lineNumber)).toEqual([5, 9]);
    expect(table.rows.map((r) => r.values.name)).toEqual(["Ada", "Grace"]);
  });

  test("rejects unmapped nonblank data cells outside header columns", async () => {
    const bytes = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1">' +
          COLUMNS.map(
            (c, idx) =>
              `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
          ).join("") +
          "</row>" +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c><c r="I2" t="inlineStr"><is><t>extra</t></is></c></row>' +
          "</sheetData></worksheet>",
      },
    });

    expect(await errorOf(bytes)).toEqual({
      kind: "unmapped-cell",
      lineNumber: 2,
      cellRef: "I2",
    });
  });
});

describe("parseXlsxTable formulas, literal strings, and numeric precision", () => {
  test("rejects formula cells even when cached values are present", async () => {
    const bytes = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1">' +
          COLUMNS.map(
            (c, idx) =>
              `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
          ).join("") +
          "</row>" +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c><c r="F2"><f>100+250</f><v>350</v></c></row>' +
          "</sheetData></worksheet>",
      },
    });

    expect(await errorOf(bytes)).toEqual({
      kind: "formula-cell",
      lineNumber: 2,
      cellRef: "F2",
    });
  });

  test("preserves literal formula-like strings without stripping apostrophes and preserves exact safe integer text", async () => {
    const bytes = await buildXlsx({
      headers: [...COLUMNS],
      rows: [
        [
          "=SUM(A1:A2)",
          "ada@example.test",
          "+15550100",
          "'quoted-prefix",
          "active",
          9_007_199_254_740_991,
          "USD",
          "=cmd|' /C calc'!A0",
        ],
        [
          "  leading-space",
          "grace@example.test",
          null,
          null,
          "inactive",
          -9_007_199_254_740_991,
          "EUR",
          "\r\nline1\nline2",
        ],
      ],
    });

    const table = await tableOf(bytes);
    expect(table.rows[0]?.values).toEqual({
      name: "=SUM(A1:A2)",
      email: "ada@example.test",
      phone: "+15550100",
      company: "'quoted-prefix",
      status: "active",
      balanceMinor: "9007199254740991",
      currency: "USD",
      notes: "=cmd|' /C calc'!A0",
    });
    expect(table.rows[1]?.values).toEqual({
      name: "  leading-space",
      email: "grace@example.test",
      phone: "",
      company: "",
      status: "inactive",
      balanceMinor: "-9007199254740991",
      currency: "EUR",
      notes: "\r\nline1\nline2",
    });
  });

  test("accepts <=15-digit exact numeric cells and rejects >15-digit or precision-losing numeric cells", async () => {
    const okBytes = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1">' +
          COLUMNS.map(
            (c, idx) =>
              `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
          ).join("") +
          "</row>" +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c><c r="F2"><v>999999999999999</v></c></row>' +
          '<row r="3"><c r="A3" t="inlineStr"><is><t>Grace</t></is></c><c r="F3" t="n"><v>-999999999999999</v></c></row>' +
          "</sheetData></worksheet>",
      },
    });
    const table = await tableOf(okBytes);
    expect(table.rows[0]?.values.balanceMinor).toBe("999999999999999");
    expect(table.rows[1]?.values.balanceMinor).toBe("-999999999999999");

    for (const badNum of [
      "1000000000000000",
      "-1000000000000000",
      "9007199254740991",
      "0.30000000000000004",
      "1.2345678901234567",
      "1e16",
    ]) {
      const badBytes = makeCustomWorkbook({
        sheetFiles: {
          "xl/worksheets/sheet1.xml":
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
            '<row r="1">' +
            COLUMNS.map(
              (c, idx) =>
                `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
            ).join("") +
            "</row>" +
            `<row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c><c r="F2"><v>${badNum}</v></c></row>` +
            "</sheetData></worksheet>",
        },
      });
      expect(await errorOf(badBytes)).toEqual({
        kind: "imprecise-number",
        lineNumber: 2,
        cellRef: "F2",
      });
    }
  });

  test("preserves non-integer <=15-digit floats without rounding so validation rejects them", async () => {
    const bytes = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1">' +
          COLUMNS.map(
            (c, idx) =>
              `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
          ).join("") +
          "</row>" +
          '<row r="2"><c r="A2" t="inlineStr"><is><t>Ada</t></is></c><c r="F2"><v>12.5</v></c></row>' +
          "</sheetData></worksheet>",
      },
    });
    const table = await tableOf(bytes);
    expect(table.rows[0]?.values.balanceMinor).toBe("12.5");
  });
});

describe("parseXlsxTable resource budgets & malformed workbooks", () => {
  test("rejects files over 5 MiB before parsing", async () => {
    const oversized = new Uint8Array(MAX_IMPORT_BYTES + 1);
    expect(await errorOf(oversized)).toEqual({
      kind: "file-too-large",
      bytes: MAX_IMPORT_BYTES + 1,
      limit: MAX_IMPORT_BYTES,
    });
  });

  test("rejects malformed non-zip bytes and missing workbook parts", async () => {
    expect(await errorOf(new TextEncoder().encode("not a zip"))).toMatchObject({
      kind: "malformed-workbook",
    });
  });

  test("rejects workbooks exceeding ZIP entry count before inflating", async () => {
    const enc = new TextEncoder();
    const entries = Array.from({ length: MAX_XLSX_ZIP_ENTRIES + 1 }, (_, i) => ({
      name: `extra/${i}.xml`,
      data: enc.encode("<x/>"),
    }));
    const bytes = makeZip(entries);
    expect(await errorOf(bytes)).toEqual({ kind: "over-budget", reason: "entries" });
  });

  test("rejects declared and spoofed ZIP bombs before materializing inflated buffers", async () => {
    const bigData = new Uint8Array(MAX_XLSX_ENTRY_BYTES + 1024);
    const declaredBig = makeZip([
      {
        name: "xl/worksheets/sheet1.xml",
        data: new TextEncoder().encode("<worksheet/>"),
        declaredUncompressedSize: MAX_XLSX_ENTRY_BYTES + 1,
      },
    ]);
    expect(await errorOf(declaredBig)).toEqual({ kind: "over-budget", reason: "entry-size" });

    // Spoofed small declared size in central directory while compressed stream inflates past budget
    const spoofed = makeZip([
      {
        name: "[Content_Types].xml",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        ),
      },
      {
        name: "_rels/.rels",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        ),
      },
      {
        name: "xl/workbook.xml",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        ),
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        data: new TextEncoder().encode(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: bigData,
        declaredUncompressedSize: 100,
      },
    ]);
    expect(await errorOf(spoofed)).toEqual({ kind: "over-budget", reason: "entry-size" });
    expect(MAX_XLSX_TOTAL_INFLATED_BYTES).toBeGreaterThan(MAX_XLSX_ENTRY_BYTES);
  });

  test("rejects >1,000 nonblank data rows and enforces row/cell/sharedString budgets without dense allocation", async () => {
    // Sparse extreme range dimension A1:XFD1048576 must NOT crash or OOM
    const sparseSheet = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml":
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          '<dimension ref="A1:XFD1048576"/>' +
          "<sheetData>" +
          '<row r="1">' +
          COLUMNS.map(
            (c, idx) =>
              `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
          ).join("") +
          "</row>" +
          '<row r="1048576"><c r="A1048576" t="inlineStr"><is><t>Ada</t></is></c><c r="B1048576" t="inlineStr"><is><t>ada@example.test</t></is></c></row>' +
          "</sheetData></worksheet>",
      },
    });
    const sparseTable = await tableOf(sparseSheet);
    expect(sparseTable.rows[0]?.lineNumber).toBe(1048576);

    // > MAX_IMPORT_ROWS nonblank data rows
    const headerXml =
      '<row r="1">' +
      COLUMNS.map(
        (c, idx) =>
          `<c r="${String.fromCharCode(65 + idx)}1" t="inlineStr"><is><t>${c}</t></is></c>`,
      ).join("") +
      "</row>";
    const dataRowsXml = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, i) =>
        `<row r="${i + 2}"><c r="A${i + 2}" t="inlineStr"><is><t>Row ${i}</t></is></c></row>`,
    ).join("");
    const tooManyRows = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${headerXml}${dataRowsXml}</sheetData></worksheet>`,
      },
    });
    expect(await errorOf(tooManyRows)).toMatchObject({
      kind: "too-many-rows",
      limit: MAX_IMPORT_ROWS,
    });

    // Empty rows exceeding MAX_XLSX_ROWS_EXAMINED
    const manyEmptyRows = Array.from(
      { length: MAX_XLSX_ROWS_EXAMINED + 1 },
      (_, i) => `<row r="${i + 2}"/>`,
    ).join("");
    const overRowsBudget = makeCustomWorkbook({
      sheetFiles: {
        "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${headerXml}${manyEmptyRows}</sheetData></worksheet>`,
      },
    });
    expect(await errorOf(overRowsBudget)).toEqual({
      kind: "over-budget",
      reason: "rows-examined",
    });

    expect(MAX_XLSX_CELLS_EXAMINED).toBeGreaterThan(0);
    expect(MAX_XLSX_SHARED_STRINGS).toBeGreaterThan(0);
  });
});

describe("xlsx worker seam", () => {
  test("parses a File off-thread through the worker scope and rejects on abort", async () => {
    const listeners: Array<(event: { data: unknown }) => void> = [];
    const posted: unknown[] = [];
    const scope = {
      addEventListener: (_type: "message", listener: (event: { data: unknown }) => void) => {
        listeners.push(listener);
      },
      postMessage: (message: unknown) => {
        posted.push(message);
      },
    };
    registerXlsxImportWorker(scope);

    const bytes = await buildXlsx({
      headers: [...COLUMNS],
      rows: [["Ada", "ada@example.test", null, null, "active", 42, "USD", null]],
    });
    const file = new File([bytes], "customers.xlsx", { type: XLSX_MIME_TYPE });

    for (const listener of listeners) {
      listener({ data: { type: "parse", token: 1, file, columns: [...COLUMNS] } });
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      type: "parsed",
      token: 1,
      table: {
        total: 1,
        rows: [{ lineNumber: 2, values: { name: "Ada", balanceMinor: "42" } }],
      },
    });

    // Abort rejects before spawning worker
    const controller = new AbortController();
    controller.abort();
    await expect(
      parseXlsxInWorker({ file, columns: COLUMNS, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });

    // Terminates worker on abort mid-flight and resolves on matching token
    const originalWorker = (globalThis as { Worker?: typeof Worker }).Worker;
    let terminated = 0;
    const activeListeners: Array<(event: { data: unknown }) => void> = [];
    class FakeWorker {
      addEventListener(type: string, cb: (event: { data: unknown }) => void) {
        if (type === "message") activeListeners.push(cb);
      }
      postMessage() {}
      terminate() {
        terminated += 1;
      }
    }
    (globalThis as { Worker?: typeof Worker }).Worker = FakeWorker as unknown as typeof Worker;
    try {
      const inflight = new AbortController();
      const promise = parseXlsxInWorker({ file, columns: COLUMNS, signal: inflight.signal });
      inflight.abort();
      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
      expect(terminated).toBe(1);
    } finally {
      (globalThis as { Worker?: typeof Worker }).Worker = originalWorker;
    }
  });
});
