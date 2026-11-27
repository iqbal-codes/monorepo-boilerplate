import { describe, expect, test } from "bun:test";
import { inflateRawSync } from "node:zlib";

import { registerCsvExportWorker } from "../src/components/export/worker";
import { XLSX_MIME_TYPE, buildXlsx, runXlsxExport } from "../src/components/export/xlsx";

const HEADERS = [
  "name",
  "email",
  "phone",
  "company",
  "status",
  "balanceMinor",
  "currency",
  "notes",
];

function payloadOf(rows: (string | number | null)[][]) {
  return JSON.stringify({ headers: HEADERS, rows });
}

type ZipEntry = {
  name: string;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  data: Uint8Array;
};

/** Minimal PKZIP reader for test verification: validates EOCD, central directory, CRC-32, and DEFLATE. */
function readZipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Missing ZIP End of Central Directory record.");

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries = new Map<string, ZipEntry>();

  let offset = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory signature at ${offset}`);
    }
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`Invalid Local File Header signature for ${name}`);
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawCompressed = bytes.subarray(dataStart, dataStart + compressedSize);
    const data =
      method === 8 ? new Uint8Array(inflateRawSync(rawCompressed)) : new Uint8Array(rawCompressed);
    if (data.byteLength !== uncompressedSize) {
      throw new Error(`Size mismatch for ${name}: ${data.byteLength} !== ${uncompressedSize}`);
    }
    entries.set(name, { name, method, crc32, compressedSize, uncompressedSize, data });
  }

  return entries;
}

function unescapeXmlText(xml: string): string {
  return xml
    .replaceAll("&#13;", "\r")
    .replaceAll("&#xD;", "\r")
    .replaceAll("&#10;", "\n")
    .replaceAll("&#xA;", "\n")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseSheetCells(sheetXml: string): Map<string, { type: string | null; value: string }> {
  const cells = new Map<string, { type: string | null; value: string }>();
  const cellRe = /<c\s+([^>]+)>([\s\S]*?)<\/c>/g;
  for (const match of sheetXml.matchAll(cellRe)) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
    if (!ref) continue;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const textMatch = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(inner);
    cells.set(ref, {
      type,
      value: unescapeXmlText(textMatch?.[1] ?? ""),
    });
  }
  return cells;
}

describe("buildXlsx", () => {
  test("creates a valid compressed single-worksheet OOXML workbook with exact headers", async () => {
    const bytes = await buildXlsx({ headers: HEADERS, rows: [] });
    const entries = readZipEntries(bytes);
    const decoder = new TextDecoder("utf-8");

    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.has("_rels/.rels")).toBe(true);
    expect(entries.has("xl/workbook.xml")).toBe(true);
    expect(entries.has("xl/_rels/workbook.xml.rels")).toBe(true);
    expect(entries.has("xl/worksheets/sheet1.xml")).toBe(true);

    // Every entry uses DEFLATE (8) compression.
    for (const entry of entries.values()) {
      expect(entry.method).toBe(8);
    }

    const workbookXml = decoder.decode(entries.get("xl/workbook.xml")!.data);
    const sheetMatches = [...workbookXml.matchAll(/<sheet\b/g)];
    expect(sheetMatches).toHaveLength(1);

    const sheetXml = decoder.decode(entries.get("xl/worksheets/sheet1.xml")!.data);
    const cells = parseSheetCells(sheetXml);
    expect(cells.size).toBe(8);
    expect(cells.get("A1")).toEqual({ type: "inlineStr", value: "name" });
    expect(cells.get("B1")).toEqual({ type: "inlineStr", value: "email" });
    expect(cells.get("C1")).toEqual({ type: "inlineStr", value: "phone" });
    expect(cells.get("D1")).toEqual({ type: "inlineStr", value: "company" });
    expect(cells.get("E1")).toEqual({ type: "inlineStr", value: "status" });
    expect(cells.get("F1")).toEqual({ type: "inlineStr", value: "balanceMinor" });
    expect(cells.get("G1")).toEqual({ type: "inlineStr", value: "currency" });
    expect(cells.get("H1")).toEqual({ type: "inlineStr", value: "notes" });
  });

  test("writes formula-like strings, phones, UTF-8, and >15-digit integers as literal strings without apostrophes", async () => {
    const bytes = await buildXlsx({
      headers: HEADERS,
      rows: [
        [
          " =SUM(A1:A2)",
          "ada@example.test",
          "+15550100",
          'Zoë & <Northwind> "Ltd"',
          "active",
          9_007_199_254_740_991,
          "USD",
          "=cmd|' /C calc'!A0",
        ],
        [
          "\t=cmd",
          "grace@example.test",
          null,
          null,
          "archived",
          -9_007_199_254_740_991,
          "EUR",
          "\r@SUM(1)\n+2-3",
        ],
        [
          "  +1",
          "minus@example.test",
          "+442079460958",
          "Ünïcode café",
          "inactive",
          0,
          "GBP",
          "-2+3",
        ],
      ],
    });

    const entries = readZipEntries(bytes);
    const sheetXml = new TextDecoder("utf-8").decode(entries.get("xl/worksheets/sheet1.xml")!.data);
    const cells = parseSheetCells(sheetXml);

    // Row 2: literal strings, no CSV apostrophe prefix, exact 16-digit positive safe integer.
    expect(cells.get("A2")).toEqual({ type: "inlineStr", value: " =SUM(A1:A2)" });
    expect(cells.get("C2")).toEqual({ type: "inlineStr", value: "+15550100" });
    expect(cells.get("D2")).toEqual({ type: "inlineStr", value: 'Zoë & <Northwind> "Ltd"' });
    expect(cells.get("F2")).toEqual({ type: "inlineStr", value: "9007199254740991" });
    expect(cells.get("H2")).toEqual({ type: "inlineStr", value: "=cmd|' /C calc'!A0" });

    // Row 3: null cells omitted, tab/CR preserved, negative 16-digit safe integer literal.
    expect(cells.get("A3")).toEqual({ type: "inlineStr", value: "\t=cmd" });
    expect(cells.has("C3")).toBe(false);
    expect(cells.has("D3")).toBe(false);
    expect(cells.get("E3")).toEqual({ type: "inlineStr", value: "archived" });
    expect(cells.get("F3")).toEqual({ type: "inlineStr", value: "-9007199254740991" });
    expect(cells.get("H3")).toEqual({ type: "inlineStr", value: "\r@SUM(1)\n+2-3" });

    // Row 4: leading spaces, +, -, UTF-8, zero.
    expect(cells.get("A4")).toEqual({ type: "inlineStr", value: "  +1" });
    expect(cells.get("C4")).toEqual({ type: "inlineStr", value: "+442079460958" });
    expect(cells.get("D4")).toEqual({ type: "inlineStr", value: "Ünïcode café" });
    expect(cells.get("F4")).toEqual({ type: "inlineStr", value: "0" });
    expect(cells.get("H4")).toEqual({ type: "inlineStr", value: "-2+3" });

    // Preserves whitespace attribute on cells with leading/trailing whitespace.
    expect(sheetXml).toContain('xml:space="preserve"');
  });

  test("rejects non-safe integers even when buildXlsx is called directly", async () => {
    await expect(
      buildXlsx({ headers: ["balanceMinor"], rows: [[Number.MAX_SAFE_INTEGER + 1]] }),
    ).rejects.toThrow(/cannot be written exactly/);
    await expect(buildXlsx({ headers: ["balanceMinor"], rows: [[1.5]] })).rejects.toThrow(
      /cannot be written exactly/,
    );
  });
});

describe("runXlsxExport", () => {
  test("returns a compressed .xlsx File with the OOXML MIME type and rowCount", async () => {
    const response = await runXlsxExport({
      payload: payloadOf([
        [
          "Ada",
          "ada@example.test",
          "+15550100",
          null,
          "active",
          9_007_199_254_740_991,
          "USD",
          "=1+1",
        ],
      ]),
      filename: "customers-2026-11-27.xlsx",
    });

    expect(response.type).toBe("done");
    if (response.type !== "done") throw new Error("expected done");
    expect(response.rowCount).toBe(1);
    expect(response.file).toBeInstanceOf(File);
    expect(response.file.name).toBe("customers-2026-11-27.xlsx");
    expect(response.file.type).toBe(XLSX_MIME_TYPE);

    const bytes = new Uint8Array(await response.file.arrayBuffer());
    const entries = readZipEntries(bytes);
    const cells = parseSheetCells(
      new TextDecoder("utf-8").decode(entries.get("xl/worksheets/sheet1.xml")!.data),
    );
    expect(cells.get("C2")).toEqual({ type: "inlineStr", value: "+15550100" });
    expect(cells.get("F2")).toEqual({ type: "inlineStr", value: "9007199254740991" });
    expect(cells.get("H2")).toEqual({ type: "inlineStr", value: "=1+1" });
  });

  test("returns an error response with no file for malformed or unsafe payloads", async () => {
    const malformed = await runXlsxExport({ payload: "{bad", filename: "customers.xlsx" });
    expect(malformed.type).toBe("error");
    expect(malformed).not.toHaveProperty("file");

    const unsafe = await runXlsxExport({
      payload: '{"headers":["a"],"rows":[[9007199254740993]]}',
      filename: "customers.xlsx",
    });
    expect(unsafe.type).toBe("error");
    if (unsafe.type !== "error") throw new Error("expected error");
    expect(unsafe.message).toMatch(/cannot be written exactly/);
    expect(unsafe).not.toHaveProperty("file");
  });

  test("produces a header-only workbook for zero matching rows", async () => {
    const response = await runXlsxExport({
      payload: payloadOf([]),
      filename: "customers-empty.xlsx",
    });
    if (response.type !== "done") throw new Error("expected done");
    expect(response.rowCount).toBe(0);
    const bytes = new Uint8Array(await response.file.arrayBuffer());
    const entries = readZipEntries(bytes);
    const cells = parseSheetCells(
      new TextDecoder("utf-8").decode(entries.get("xl/worksheets/sheet1.xml")!.data),
    );
    expect(cells.size).toBe(8);
  });
});

describe("export worker xlsx seam", () => {
  function fakeScope() {
    const listeners: Array<(event: { data: unknown }) => void> = [];
    const posted: unknown[] = [];
    const waiters: Array<{ count: number; resolve: () => void }> = [];
    return {
      posted,
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => {
        listeners.push(listener);
      },
      postMessage: (message: unknown) => {
        posted.push(message);
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (posted.length >= (waiters[i]?.count ?? 0)) {
            waiters[i]?.resolve();
            waiters.splice(i, 1);
          }
        }
      },
      emit: (data: unknown) => {
        for (const listener of listeners) listener({ data });
      },
      waitForCount: (count: number) =>
        posted.length >= count
          ? Promise.resolve()
          : new Promise<void>((resolve) => waiters.push({ count, resolve })),
    };
  }

  test("posts one compressed .xlsx File for payload requests with format=xlsx", async () => {
    const scope = fakeScope();
    registerCsvExportWorker(scope);

    scope.emit({
      payload: payloadOf([
        [
          "Ada",
          "ada@example.test",
          "+15550100",
          null,
          "active",
          -9_007_199_254_740_991,
          "USD",
          "=A1",
        ],
      ]),
      filename: "customers.xlsx",
      format: "xlsx",
    });
    scope.emit({
      payload: payloadOf([]),
      filename: "ignored.xlsx",
      format: "xlsx",
    });

    await scope.waitForCount(1);
    expect(scope.posted).toHaveLength(1);
    const done = scope.posted[0] as { type: string; file: File; rowCount: number };
    expect(done.type).toBe("done");
    expect(done.rowCount).toBe(1);
    expect(done.file.name).toBe("customers.xlsx");
    expect(done.file.type).toBe(XLSX_MIME_TYPE);
  });

  test("fetches, unwraps, and generates an .xlsx File off-thread in HTTP worker mode", async () => {
    const scope = fakeScope();
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          result: {
            data: payloadOf([
              ["Grace", "grace@example.test", "+15550101", null, "archived", 42, "EUR", "+note"],
            ]),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    registerCsvExportWorker(scope, fakeFetch);
    scope.emit({
      type: "http",
      request: {
        url: "http://localhost:3000/trpc/customers.export",
        credentials: "include",
        payloadPath: ["result", "data"],
      },
      filename: "customers.xlsx",
      format: "xlsx",
    });

    await scope.waitForCount(3);
    expect(scope.posted.map((m) => (m as { type: string }).type)).toEqual([
      "stage",
      "stage",
      "done",
    ]);
    const done = scope.posted[2] as { type: string; file: File; rowCount: number };
    expect(done.file.name).toBe("customers.xlsx");
    expect(done.file.type).toBe(XLSX_MIME_TYPE);
    const entries = readZipEntries(new Uint8Array(await done.file.arrayBuffer()));
    const cells = parseSheetCells(
      new TextDecoder("utf-8").decode(entries.get("xl/worksheets/sheet1.xml")!.data),
    );
    expect(cells.get("E2")).toEqual({ type: "inlineStr", value: "archived" });
    expect(cells.get("H2")).toEqual({ type: "inlineStr", value: "+note" });
  });
});
