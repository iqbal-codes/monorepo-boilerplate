import { describe, expect, test } from "bun:test";

import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  PREVIEW_SAMPLE_ROWS,
  parseCsvRecords,
  parseCsvTable,
  serializeCsvTemplate,
} from "../src/lib/csv";

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

const HEADER = COLUMNS.join(",");

function tableOf(input: string | Uint8Array, columns: readonly string[] = COLUMNS) {
  const result = parseCsvTable(input, columns);
  if (!result.ok) throw new Error(`expected a table, got ${result.error.kind}`);
  return result.table;
}

function errorOf(input: string, columns: readonly string[] = COLUMNS) {
  const result = parseCsvTable(input, columns);
  if (result.ok) throw new Error("expected the file to be rejected");
  return result.error;
}

describe("csv limits", () => {
  test("exports the documented import bounds", () => {
    expect(MAX_IMPORT_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_IMPORT_ROWS).toBe(1000);
    expect(PREVIEW_SAMPLE_ROWS).toBe(50);
  });
});

describe("serializeCsvTemplate", () => {
  test("emits the documented header line with a trailing newline and no BOM", () => {
    const bytes = new TextEncoder().encode(serializeCsvTemplate(COLUMNS));
    expect(new TextDecoder().decode(bytes)).toBe(`${HEADER}\n`);
    expect(bytes[0]).toBe(0x6e);
    expect(Array.from(bytes.slice(-1))).toEqual([0x0a]);
  });

  test("quotes only the fields that need it", () => {
    expect(serializeCsvTemplate(["name", "a,b", 'say "hi"', "plain"])).toBe(
      'name,"a,b","say ""hi""",plain\n',
    );
  });

  test("round-trips its own output back to the same headers", () => {
    const table = tableOf(serializeCsvTemplate(COLUMNS));
    expect(table.headers).toEqual([...COLUMNS]);
    expect(table.rows).toEqual([]);
    expect(table.total).toBe(0);
  });
});

describe("parseCsvTable headers", () => {
  test("accepts the eight headers in any order", () => {
    const reordered = [...COLUMNS].reverse();
    const csv = `${reordered.join(",")}\nnotes,USD,0,active,Analytical Engines,42,ada@example.test,Ada\n`;
    const table = tableOf(csv);

    expect(table.headers).toEqual(reordered);
    expect(table.total).toBe(1);
    expect(table.rows[0]?.values).toEqual({
      name: "Ada",
      email: "ada@example.test",
      phone: "42",
      company: "Analytical Engines",
      status: "active",
      balanceMinor: "0",
      currency: "USD",
      notes: "notes",
    });
  });

  test("trims surrounding header whitespace", () => {
    const csv = `  name , email ,phone,company,status,balanceMinor,currency,notes \nAda,ada@example.test,,,,,,\n`;
    expect(tableOf(csv).headers).toEqual([...COLUMNS]);
  });

  test("compares header names exactly and case-sensitively", () => {
    const csv = `Name,email,phone,company,status,balanceMinor,currency,notes\nAda,ada@example.test,,,,,,\n`;
    expect(errorOf(csv)).toEqual({ kind: "unknown-headers", headers: ["Name"] });
  });

  test("rejects unknown headers", () => {
    const csv = `${HEADER},nickname\nAda,ada@example.test,,,,,,,Lovelace\n`;
    expect(errorOf(csv)).toEqual({ kind: "unknown-headers", headers: ["nickname"] });
  });

  test("rejects repeated headers", () => {
    const csv = `${HEADER},email\nAda,ada@example.test,,,,,,,ada@example.test\n`;
    expect(errorOf(csv)).toEqual({ kind: "repeated-headers", headers: ["email"] });
  });

  test("rejects files with missing headers", () => {
    const csv = `name,email,phone,company,status,balanceMinor,currency\nAda,ada@example.test,,,,,\n`;
    expect(errorOf(csv)).toEqual({ kind: "missing-headers", headers: ["notes"] });
  });

  test("rejects a file with no records at all", () => {
    expect(errorOf("")).toEqual({ kind: "empty-file" });
    expect(errorOf("\n\r\n\n")).toEqual({ kind: "empty-file" });
  });

  test("keeps a headers-only file as an empty table", () => {
    expect(tableOf(`${HEADER}\n`)).toMatchObject({ rows: [], total: 0 });
  });
});

describe("parseCsvRecords", () => {
  test("strips one leading UTF-8 BOM", () => {
    expect(parseCsvRecords("\uFEFFname,email")).toEqual([
      { lineNumber: 1, fields: ["name", "email"] },
    ]);
    expect(parseCsvRecords(new TextEncoder().encode("\uFEFFname,email"))).toEqual([
      { lineNumber: 1, fields: ["name", "email"] },
    ]);
  });

  test("splits records on LF, CRLF, and CR", () => {
    expect(parseCsvRecords("a\nb\r\nc\rd")).toEqual([
      { lineNumber: 1, fields: ["a"] },
      { lineNumber: 2, fields: ["b"] },
      { lineNumber: 3, fields: ["c"] },
      { lineNumber: 4, fields: ["d"] },
    ]);
  });

  test("treats an apostrophe as an ordinary character", () => {
    expect(parseCsvRecords("O'Brien,say 'hi'")).toEqual([
      { lineNumber: 1, fields: ["O'Brien", "say 'hi'"] },
    ]);
    expect(parseCsvRecords(`"O'Brien","say 'hi'"`)).toEqual([
      { lineNumber: 1, fields: ["O'Brien", "say 'hi'"] },
    ]);
  });

  test("collapses doubled quotes inside a quoted field into one quote", () => {
    expect(parseCsvRecords('"say ""hi""",plain')).toEqual([
      { lineNumber: 1, fields: ['say "hi"', "plain"] },
    ]);
  });

  test("keeps commas and newlines that live inside a quoted field", () => {
    expect(parseCsvRecords('"a,b","c\nd"')).toEqual([{ lineNumber: 1, fields: ["a,b", "c\nd"] }]);
  });

  test("keeps an empty trailing field", () => {
    expect(parseCsvRecords("a,b,")).toEqual([{ lineNumber: 1, fields: ["a", "b", ""] }]);
  });
});

describe("parseCsvTable line numbers", () => {
  test("reports the record's own starting line", () => {
    const csv = [HEADER, "Ada,ada@example.test,,,,,,", "Grace,grace@example.test,,,,,,", ""].join(
      "\n",
    );
    const table = tableOf(csv);

    expect(table.rows.map((row) => row.lineNumber)).toEqual([2, 3]);
    expect(table.rows.map((row) => row.values.name)).toEqual(["Ada", "Grace"]);
  });

  test("ignores blank records without shifting later line numbers", () => {
    const csv = [
      HEADER,
      "",
      "Ada,ada@example.test,,,,,,",
      "",
      "",
      "Grace,grace@example.test,,,,,,",
    ].join("\n");
    const table = tableOf(csv);

    expect(table.total).toBe(2);
    expect(table.rows.map((row) => row.lineNumber)).toEqual([3, 6]);
    expect(table.rows.map((row) => row.values.name)).toEqual(["Ada", "Grace"]);
  });

  test("keeps line numbers correct when an earlier record spans several lines", () => {
    const csv = [
      HEADER,
      `"Ada
Lovelace",ada@example.test,,,,,,"line one
line two"`,
      "Grace,grace@example.test,,,,,,",
    ].join("\n");
    const table = tableOf(csv);

    expect(table.total).toBe(2);
    expect(table.rows.map((row) => row.lineNumber)).toEqual([2, 5]);
    expect(table.rows[0]?.values.name).toBe("Ada\nLovelace");
    expect(table.rows[0]?.values.notes).toBe("line one\nline two");
    expect(table.rows[1]?.values.name).toBe("Grace");
  });

  test("counts CRLF inside a quoted field as a single line break", () => {
    const csv = `${HEADER}\r\n"Ada\r\nLovelace",ada@example.test,,,,,,\r\nGrace,grace@example.test,,,,,,\r\n`;
    const table = tableOf(csv);

    expect(table.rows.map((row) => row.lineNumber)).toEqual([2, 4]);
    expect(table.rows[0]?.values.name).toBe("Ada\r\nLovelace");
  });

  test("treats the first non-blank record as the header", () => {
    const csv = `\n\n${HEADER}\nAda,ada@example.test,,,,,,`;
    const table = tableOf(csv);

    expect(table.headers).toEqual([...COLUMNS]);
    expect(table.rows[0]?.lineNumber).toBe(4);
  });

  test("fills missing trailing cells with an empty string", () => {
    const table = tableOf(`${HEADER}\nAda`);
    expect(table.rows[0]?.values).toMatchObject({ name: "Ada", email: "", notes: "" });
  });

  test("rejects a record with more cells than headers instead of truncating a field", () => {
    // An unquoted comma in the last cell looks like a ninth field. Silently
    // dropping it would store `notes = "Called"` and lose the rest of the note.
    const csv = [HEADER, "Ada,ada@example.test,,,,,,Called, will follow up"].join("\n");

    expect(errorOf(csv)).toEqual({ kind: "too-many-cells", lineNumber: 2, cells: 9, headers: 8 });
  });

  test("accepts a record whose comma lives inside a quoted cell", () => {
    const table = tableOf(`${HEADER}\nAda,ada@example.test,,,,,,"Called, will follow up"`);
    expect(table.rows[0]?.values.notes).toBe("Called, will follow up");
  });

  test("reports the first over-wide record's own line, not a line after it", () => {
    const csv = [
      HEADER,
      "Ada,ada@example.test,,,,,,",
      '"Grace\nHopper",grace@example.test,,,,,,one,extra',
      "Katherine,katherine@example.test,,,,,,",
    ].join("\n");

    expect(errorOf(csv)).toEqual({ kind: "too-many-cells", lineNumber: 3, cells: 9, headers: 8 });
  });

  test("rejects more nonblank rows than the limit", () => {
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, index) => `Row ${index},r${index}@example.test,,,,,,`,
    );
    const error = errorOf([HEADER, ...rows].join("\n"));

    expect(error.kind).toBe("too-many-rows");
    if (error.kind === "too-many-rows") {
      expect(error.total).toBe(MAX_IMPORT_ROWS + 1);
      expect(error.limit).toBe(MAX_IMPORT_ROWS);
    }
  });

  test("accepts exactly the row limit and ignores blank rows against it", () => {
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS },
      (_, index) => `Row ${index},r${index}@example.test,,,,,,`,
    );
    const withBlanks = [HEADER, "", ...rows, "", ""].join("\n");

    expect(tableOf(withBlanks).total).toBe(MAX_IMPORT_ROWS);
  });
});
