import { afterAll, describe, expect, test } from "bun:test";

import { customersRouter } from "./customers";
import { createCustomerTestContext, customersTestDatabaseUrl } from "./customers-test-context";

describe.skipIf(!customersTestDatabaseUrl)("Customers export with disposable Postgres", () => {
  if (!customersTestDatabaseUrl) return;
  const { db, staff, fixtureIds, cleanup } = createCustomerTestContext(customersTestDatabaseUrl);
  const emailPrefixes: string[] = [];
  afterAll(async () => {
    try {
      for (const prefix of emailPrefixes) {
        await db.$client.query("delete from customer where email like $1", [`${prefix}%`]);
      }
    } finally {
      await cleanup();
    }
  });

  const token = () => `export-${crypto.randomUUID()}`;

  const createFixture = async (
    scope: string,
    overrides: Partial<{
      name: string;
      phone: string;
      company: string;
      status: "active" | "inactive" | "archived";
      balanceMinor: number;
      currency: string;
      notes: string;
    }> = {},
  ) => {
    const id = `${scope}-${crypto.randomUUID()}`;
    const fixture = await staff.create({
      name: overrides.name ?? "Export fixture",
      email: `${id}@${scope}.example.test`,
      ...(overrides.phone === undefined ? {} : { phone: overrides.phone }),
      ...(overrides.company === undefined ? {} : { company: overrides.company }),
      ...(overrides.notes === undefined ? {} : { notes: overrides.notes }),
      status: overrides.status ?? "active",
      balanceMinor: overrides.balanceMinor ?? 0,
      currency: overrides.currency ?? "USD",
    });
    fixtureIds.push(fixture.id);
    return fixture;
  };

  /** Raw insert for cases that need a fixed primary key (the id tie-break). */
  const insertWithId = async (id: string, name: string, balanceMinor = "0") => {
    emailPrefixes.push(`${id}@`);
    await db.$client.query(
      `insert into customer (id, name, email, status, balance_minor, currency)
       values ($1, $2, $3, 'active', $4::bigint, 'USD')`,
      [id, name, `${id}@tiebreak.example.test`, balanceMinor],
    );
  };

  const decode = (payload: string) =>
    JSON.parse(payload) as {
      headers: string[];
      rows: (string | number | null)[][];
    };

  test("a signed-out caller cannot export Customers", async () => {
    const scope = token();
    await createFixture(scope);
    const signedOut = customersRouter.createCaller({ db, session: null });

    await expect(signedOut.export({ search: scope })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("the payload has exactly the eight export headers and matching rows", async () => {
    const scope = token();
    const fixture = await createFixture(scope, {
      name: "Ada Export",
      phone: "+15550100",
      company: "Northwind",
      balanceMinor: -1250,
      currency: "EUR",
      notes: "Long\nmultiline, note",
    });

    const decoded = decode(await staff.export({ search: scope }));

    expect(decoded.headers).toEqual([
      "name",
      "email",
      "phone",
      "company",
      "status",
      "balanceMinor",
      "currency",
      "notes",
    ]);
    expect(decoded.rows).toEqual([
      [
        "Ada Export",
        fixture.email,
        "+15550100",
        "Northwind",
        "active",
        -1250,
        "EUR",
        "Long\nmultiline, note",
      ],
    ]);
    expect(typeof decoded.rows[0]?.[5]).toBe("number");
    expect(decoded.rows[0]).toHaveLength(8);
  });

  test("the export uses the list scope, order, and asc(customer.id) tie-break", async () => {
    const scope = token();
    const base = `${scope}-tie`;
    // Same sort key for every row, so only the id tie-break decides the order.
    await insertWithId(`${base}-2`, "Same Name");
    await insertWithId(`${base}-1`, "Same Name");
    await insertWithId(`${base}-3`, "Same Name");

    const ascending = decode(await staff.export({ search: scope, sortBy: "name", sortDir: "asc" }));
    const descending = decode(
      await staff.export({ search: scope, sortBy: "name", sortDir: "desc" }),
    );

    const emails = (payload: { rows: (string | number | null)[][] }) =>
      payload.rows.map((row) => String(row[1]));

    expect(emails(ascending)).toEqual([
      `${base}-1@tiebreak.example.test`,
      `${base}-2@tiebreak.example.test`,
      `${base}-3@tiebreak.example.test`,
    ]);
    expect(emails(descending)).toEqual(emails(ascending));

    // The paginated list orders the same rows identically, so the two paths
    // cannot drift.
    const listed = await staff.list({
      search: scope,
      sortBy: "name",
      sortDir: "asc",
      pageSize: 10,
    });
    expect(listed.rows.map((row) => row.email)).toEqual(emails(ascending));
  });

  test("sort direction changes the export order", async () => {
    const scope = token();
    await createFixture(scope, { name: "Aaa Export" });
    await createFixture(scope, { name: "Bbb Export" });

    const ascending = decode(await staff.export({ search: scope, sortBy: "name", sortDir: "asc" }));
    const descending = decode(
      await staff.export({ search: scope, sortBy: "name", sortDir: "desc" }),
    );

    expect(ascending.rows.map((row) => row[0])).toEqual(["Aaa Export", "Bbb Export"]);
    expect(descending.rows.map((row) => row[0])).toEqual(["Bbb Export", "Aaa Export"]);
  });

  test("archived rows are excluded by default and keep their status in the archived scope", async () => {
    const scope = token();
    await createFixture(scope, { name: "Active Export" });
    const archived = await createFixture(scope, { name: "Archived Export" });
    await staff.archiveMany({ ids: [archived.id] });

    const defaultScope = decode(await staff.export({ search: scope }));
    const archivedScope = decode(await staff.export({ search: scope, status: "archived" }));

    expect(defaultScope.rows.map((row) => row[0])).toEqual(["Active Export"]);
    expect(archivedScope.rows.map((row) => row[0])).toEqual(["Archived Export"]);
    expect(archivedScope.rows[0]?.[4]).toBe("archived");
  });

  test("zero matches produce a payload with headers and no rows", async () => {
    const decoded = decode(await staff.export({ search: token() }));

    expect(decoded.headers).toHaveLength(8);
    expect(decoded.rows).toEqual([]);
  });

  test("the export writes nothing", async () => {
    const scope = token();
    const fixture = await createFixture(scope, { name: "Untouched Export" });
    const before = await staff.byId({ id: fixture.id });

    await staff.export({ search: scope });

    expect(await staff.byId({ id: fixture.id })).toEqual(before);
  });

  test("an exact balance well inside the safe range round-trips unchanged", async () => {
    const scope = token();
    await insertWithId(`${scope}-exact`, "Exact Balance", "9007199254740991");

    const decoded = decode(await staff.export({ search: scope }));

    expect(decoded.rows[0]?.[5]).toBe(9_007_199_254_740_991);
  });

  test("a balance outside the safe integer range fails instead of rounding", async () => {
    const scope = token();
    // 2^53 + 1 cannot be represented as a JS number: the number-mode codec would
    // silently produce 9007199254740992, so the export must refuse instead.
    await insertWithId(`${scope}-unsafe`, "Unsafe Balance", "9007199254740993");

    await expect(staff.export({ search: scope })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "This export includes a balance too large to write exactly. Narrow the search or status filter and try again.",
    });

    // The same row must still be readable through the list, so the guard is
    // scoped to the export rather than breaking the Screen.
    expect(await staff.list({ search: scope })).toMatchObject({ rowCount: 1 });
  });

  test("exactly 10,000 matches export and 10,001 are rejected as too large", async () => {
    const scope = token();
    emailPrefixes.push(`${scope}-`);
    await db.$client.query(
      `insert into customer (id, name, email, phone, company, status, balance_minor, currency, notes)
       select $1 || '-' || g, 'Bulk Export', $1 || '-' || g || '@bulk.example.test', null, null, 'active', g, 'USD', null
       from generate_series(1, 10001) as g`,
      [scope],
    );

    await expect(staff.export({ search: scope })).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      message:
        "This export matches more than 10,000 customers. Narrow the search or status filter and try again.",
    });

    await db.$client.query("delete from customer where email = $1", [
      `${scope}-10001@bulk.example.test`,
    ]);

    const decoded = decode(await staff.export({ search: scope }));
    expect(decoded.rows).toHaveLength(10_000);
    expect(decoded.rows.every((row) => row[0] === "Bulk Export")).toBe(true);
  }, 60_000);
});
