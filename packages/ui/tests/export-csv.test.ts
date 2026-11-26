import { describe, expect, test } from "bun:test";

import {
  CSV_MIME_TYPE,
  buildCsv,
  decodeCsvExportPayload,
  escapeCsvCell,
  runCsvExport,
} from "../src/components/export/csv";
import { registerCsvExportWorker } from "../src/components/export/worker";

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

describe("buildCsv", () => {
  test("writes the exact header row followed by CRLF records", () => {
    const csv = buildCsv({ headers: HEADERS, rows: [] });

    expect(csv).toBe("name,email,phone,company,status,balanceMinor,currency,notes\r\n");
    expect(csv.charCodeAt(0)).not.toBe(0xfffe);
    expect(csv.startsWith("\uFEFF")).toBe(false);
  });

  test("keeps minor units as exact integers and leaves nulls blank", () => {
    const csv = buildCsv({
      headers: HEADERS,
      rows: [
        ["Ada Lovelace", "ada@example.test", null, null, "active", 123456789, "USD", null],
        ["Grace Hopper", "grace@example.test", "+15550100", "Navy", "archived", -1250, "EUR", ""],
      ],
    });

    // A leading `+` is formula-like text, so the E.164 phone keeps its value but
    // gains the protective apostrophe the caveat describes.
    expect(csv).toBe(
      [
        "name,email,phone,company,status,balanceMinor,currency,notes",
        "Ada Lovelace,ada@example.test,,,active,123456789,USD,",
        "Grace Hopper,grace@example.test,'+15550100,Navy,archived,-1250,EUR,",
        "",
      ].join("\r\n"),
    );
  });

  test("RFC 4180 quotes commas, quotes, and multiline text", () => {
    const csv = buildCsv({
      headers: HEADERS,
      rows: [
        [
          'Smith, "Jr."\nSecond line',
          "quoted@example.test",
          null,
          "Line one\nLine two",
          "active",
          0,
          "USD",
          'He said "hello", then left',
        ],
      ],
    });

    expect(csv).toContain('"Smith, ""Jr.""\nSecond line"');
    expect(csv).toContain('"Line one\nLine two"');
    expect(csv).toContain('"He said ""hello"", then left"');
  });

  test("preserves UTF-8 text without escaping it", () => {
    const csv = buildCsv({
      headers: HEADERS,
      rows: [
        ["Zoë Ångström", "zoe@example.test", null, "Ünïcode Ltd", "active", 1, "SEK", "naïve café"],
      ],
    });

    expect(csv).toContain("Zoë Ångström");
    expect(csv).toContain("Ünïcode Ltd");
    expect(csv).toContain("naïve café");
  });

  test("prefixes formula-like text after leading whitespace before quoting", () => {
    const csv = buildCsv({
      headers: HEADERS,
      rows: [
        [" =SUM(A1:A2)", "plus@example.test", null, null, "active", 0, "USD", null],
        ["  +1", "plus-two@example.test", null, null, "active", 0, "USD", null],
        ["\t=cmd", "tab@example.test", null, null, "active", 0, "USD", null],
        ["\r@cmd", "carriage@example.test", null, null, "active", 0, "USD", null],
        ["-2+3", "minus@example.test", null, null, "active", 0, "USD", null],
        ["note - not a formula", "plain@example.test", null, null, "active", 0, "USD", null],
      ],
    });

    expect(csv).toContain("' =SUM(A1:A2)");
    expect(csv).toContain("'  +1");
    expect(csv).toContain("'\t=cmd");
    expect(csv).toContain('"\'\r@cmd"');
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("note - not a formula");
  });

  test("quotes prefixed text that also needs RFC 4180 quoting", () => {
    expect(escapeCsvCell("=A1,B1")).toBe('"\'=A1,B1"');
    expect(escapeCsvCell("@SUM(1)")).toBe("'@SUM(1)");
    expect(escapeCsvCell(-42)).toBe("-42");
    expect(escapeCsvCell(-42)).not.toStartWith("'");
  });
});

describe("decodeCsvExportPayload", () => {
  test("accepts the API payload shape and keeps balanceMinor numeric", () => {
    const decoded = decodeCsvExportPayload(
      payloadOf([
        ["Ada", "ada@example.test", null, null, "active", -9007199254740991, "USD", null],
      ]),
    );

    expect(decoded.headers).toEqual(HEADERS);
    expect(decoded.rows).toHaveLength(1);
    expect(decoded.rows[0]).toEqual([
      "Ada",
      "ada@example.test",
      null,
      null,
      "active",
      -9007199254740991,
      "USD",
      null,
    ]);
  });

  test("rejects malformed payloads instead of producing an artifact", () => {
    expect(() => decodeCsvExportPayload("{")).toThrow(/not valid JSON/);
    expect(() => decodeCsvExportPayload(JSON.stringify({ headers: HEADERS }))).toThrow(
      /headers and rows/,
    );
    expect(() => decodeCsvExportPayload(JSON.stringify({ headers: [1], rows: [] }))).toThrow(
      /header must be text/,
    );
    expect(() =>
      decodeCsvExportPayload(JSON.stringify({ headers: HEADERS, rows: [["only one"]] })),
    ).toThrow(/wrong number of cells/);
    expect(() =>
      decodeCsvExportPayload(
        JSON.stringify({
          headers: HEADERS,
          rows: [[{ a: 1 }, null, null, null, null, null, null, null]],
        }),
      ),
    ).toThrow(/unsupported cell/);
  });

  test("rejects an unsafe-integer cell instead of rounding it", () => {
    // JSON.parse yields 9007199254740992 for this literal, so the guard is what
    // stops a rounded balance from reaching the CSV.
    expect(() => decodeCsvExportPayload('{"headers":["a"],"rows":[[9007199254740993]]}')).toThrow(
      /cannot be written exactly/,
    );

    expect(() => decodeCsvExportPayload(JSON.stringify({ headers: ["a"], rows: [[1.5]] }))).toThrow(
      /cannot be written exactly/,
    );

    expect(() =>
      decodeCsvExportPayload(
        JSON.stringify({ headers: ["a"], rows: [[Number.MAX_SAFE_INTEGER + 2]] }),
      ),
    ).toThrow(/cannot be written exactly/);
  });
});

describe("runCsvExport", () => {
  test("returns exactly one utf-8 file response with the row count", async () => {
    const response = runCsvExport({
      payload: payloadOf([
        ["Ada", "ada@example.test", null, null, "active", 100, "USD", null],
        ["Grace", "grace@example.test", null, null, "archived", -100, "USD", "note"],
      ]),
      filename: "customers-2026-11-26.csv",
    });

    expect(response.type).toBe("done");
    if (response.type !== "done") throw new Error("expected a done response");
    expect(response.rowCount).toBe(2);
    expect(response.file).toBeInstanceOf(File);
    expect(response.file.name).toBe("customers-2026-11-26.csv");
    expect(response.file.type).toBe(CSV_MIME_TYPE);
    expect(await response.file.text()).toBe(
      [
        "name,email,phone,company,status,balanceMinor,currency,notes",
        "Ada,ada@example.test,,,active,100,USD,",
        "Grace,grace@example.test,,,archived,-100,USD,note",
        "",
      ].join("\r\n"),
    );
  });

  test("returns an error response with no file for a malformed payload", () => {
    const response = runCsvExport({ payload: "not json", filename: "customers.csv" });

    expect(response.type).toBe("error");
    if (response.type !== "error") throw new Error("expected an error response");
    expect(response.message).toMatch(/not valid JSON/);
    expect(response).not.toHaveProperty("file");
  });

  test("downloads a header-only file for zero matching rows", async () => {
    const response = runCsvExport({ payload: payloadOf([]), filename: "customers-empty.csv" });

    if (response.type !== "done") throw new Error("expected a done response");
    expect(response.rowCount).toBe(0);
    expect(await response.file.text()).toBe(
      "name,email,phone,company,status,balanceMinor,currency,notes\r\n",
    );
  });
});

describe("export worker message seam", () => {
  function fakeScope() {
    const listeners: Array<(event: { data: unknown }) => void> = [];
    const posted: unknown[] = [];
    return {
      posted,
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => {
        listeners.push(listener);
      },
      postMessage: (message: unknown) => posted.push(message),
      emit: (data: unknown) => {
        for (const listener of listeners) listener({ data });
      },
      listenerCount: () => listeners.length,
    };
  }

  test("posts exactly one done response for a valid request, even when repeated", async () => {
    const scope = fakeScope();
    registerCsvExportWorker(scope);

    scope.emit({
      payload: payloadOf([["Ada", "ada@example.test", null, null, "active", 1, "USD", null]]),
      filename: "customers.csv",
    });
    scope.emit({ payload: payloadOf([]), filename: "second.csv" });

    expect(scope.posted).toHaveLength(1);
    const response = scope.posted[0] as { type: string; rowCount: number; file: File };
    expect(response.type).toBe("done");
    expect(response.rowCount).toBe(1);
    expect(response.file.name).toBe("customers.csv");
    expect(await response.file.text()).toContain("Ada,ada@example.test,,,active,1,USD,");
  });

  test("posts exactly one error response and no file for a malformed request", () => {
    const scope = fakeScope();
    registerCsvExportWorker(scope);

    scope.emit({ payload: "{not json", filename: "customers.csv" });

    expect(scope.posted).toHaveLength(1);
    const response = scope.posted[0] as { type: string; message: string; file?: File };
    expect(response.type).toBe("error");
    expect(response.file).toBeUndefined();
    expect(response.message).toMatch(/not valid JSON/);
  });
});
