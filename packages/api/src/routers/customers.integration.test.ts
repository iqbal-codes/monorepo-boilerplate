import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@monorepo-boilerplate/db";
import { customerQueries } from "@monorepo-boilerplate/db/queries/customer";
import { customersRouter } from "./customers";

const databaseUrl = process.env.CUSTOMERS_TEST_DATABASE_URL;

function createCustomerTestContext(url: string) {
  const db = createDb({ DATABASE_URL: url });
  const now = new Date();
  const session = {
    session: {
      id: "staff-session",
      userId: "staff",
      token: "test-session",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    user: {
      id: "staff",
      name: "Staff",
      email: "staff@example.test",
      role: "user",
      emailVerified: true,
      createdAt: now,
      banned: false,
      updatedAt: now,
    },
  };
  const adminSession = { ...session, user: { ...session.user, role: "admin" } };
  const staff = customersRouter.createCaller({ db, session });
  return { db, session, adminSession, staff };
}

describe.skipIf(!databaseUrl)("Customers archive with disposable Postgres", () => {
  if (!databaseUrl) return;
  const { db, session, adminSession, staff } = createCustomerTestContext(databaseUrl);
  const fixtureIds: string[] = [];
  afterAll(async () => {
    try {
      const admin = customersRouter.createCaller({ db, session: adminSession });
      for (const id of fixtureIds) await admin.remove({ id });
    } finally {
      await db.$client.end();
    }
  });

  const create = async () => {
    const fixture = await staff.create({
      name: "Archive fixture",
      email: `${crypto.randomUUID()}@example.test`,
      balanceMinor: 3800,
      avatarUrl: "/uploads/fixture.png",
    });
    fixtureIds.push(fixture.id);
    return fixture;
  };

  test("a missing Customer leaves the other selected Customer unchanged", async () => {
    const existing = await create();
    const ids = [existing.id, crypto.randomUUID()];
    await expect(staff.archiveMany({ ids })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Some selected customers no longer exist.",
    });
    expect(await staff.byId({ id: existing.id })).toMatchObject({ status: "active" });
  });

  test("staff can repeat an archive without changing the attachment or counting duplicates", async () => {
    const first = await create();
    const second = await create();
    await staff.archiveMany({ ids: [first.id] });
    const alreadyArchived = await staff.byId({ id: first.id });

    expect(await staff.archiveMany({ ids: [first.id, second.id, second.id] })).toEqual({
      count: 2,
    });
    expect(await staff.byId({ id: first.id })).toEqual(alreadyArchived);
    expect(await staff.byId({ id: second.id })).toMatchObject({
      status: "archived",
      avatarUrl: "/uploads/fixture.png",
    });
  });

  test("the default list hides archived Customers until they are restored", async () => {
    const customer = await create();
    const search = customer.email;
    await staff.archiveMany({ ids: [customer.id] });

    expect(await staff.list({ search })).toEqual({ rows: [], rowCount: 0 });
    expect(await staff.list({ search, status: "archived" })).toMatchObject({
      rows: [{ id: customer.id }],
      rowCount: 1,
    });

    await staff.update({ id: customer.id, status: "inactive" });
    expect(await staff.list({ search })).toMatchObject({
      rows: [{ id: customer.id, status: "inactive" }],
      rowCount: 1,
    });
  });

  test("a signed-out caller cannot archive a Customer", async () => {
    const customer = await create();
    const signedOut = customersRouter.createCaller({ db, session: null });
    await expect(signedOut.archiveMany({ ids: [customer.id] })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(await staff.byId({ id: customer.id })).toMatchObject({ status: "active" });
  });

  const unique = () => `${crypto.randomUUID()}@example.test`;

  function row(lineNumber: number, values: Partial<Record<string, string>> = {}) {
    return {
      lineNumber,
      values: {
        name: `Import ${lineNumber}`,
        email: unique(),
        phone: "",
        company: "",
        status: "",
        balanceMinor: "",
        currency: "",
        notes: "",
        ...values,
      },
    };
  }

  async function countCustomers() {
    const { rows } = await staff.list({ status: "all", pageSize: 100 });
    return rows.length;
  }

  describe("customers import", () => {
    test("preview never writes and reports defaults for a clean file", async () => {
      const before = await countCustomers();
      const input = { rows: [row(2), row(3, { status: "inactive", balanceMinor: "1250" })] };

      const preview = await staff.importPreview(input);

      expect(preview.total).toBe(2);
      expect(preview.issues).toEqual([]);
      expect(preview.sample).toHaveLength(2);
      expect(preview.sample[0]).toMatchObject({
        status: "active",
        balanceMinor: 0,
        currency: "USD",
      });
      expect(preview.sample[1]).toMatchObject({
        status: "inactive",
        balanceMinor: 1250,
        currency: "USD",
        lineNumber: 3,
      });
      expect(await countCustomers()).toBe(before);
    });

    test("confirm stores every row and announces the created count", async () => {
      const emails = [unique(), unique()];
      const result = await staff.importConfirm({
        rows: [row(2, { email: emails[0]! }), row(5, { email: emails[1]! })],
      });

      expect(result).toEqual({ ok: true, created: 2 });
      expect(await staff.list({ search: emails[0]! })).toMatchObject({ rowCount: 1 });
      expect(await staff.list({ search: emails[1]! })).toMatchObject({ rowCount: 1 });
      for (const found of [
        (await staff.list({ search: emails[0]! })).rows[0],
        (await staff.list({ search: emails[1]! })).rows[0],
      ]) {
        if (found) fixtureIds.push(found.id);
      }
    });

    test("reports within-file duplicates by the later line number", async () => {
      const email = unique();
      const preview = await staff.importPreview({
        rows: [row(2, { email }), row(4, { email })],
      });

      expect(preview.issues).toMatchObject([
        { lineNumber: 4, field: "email", message: expect.stringContaining("line 2") },
      ]);

      const confirm = await staff.importConfirm({ rows: [row(2, { email }), row(4, { email })] });
      expect(confirm).toEqual({ ok: false, conflictLineNumbers: [4] });
    });

    test("rejects invalid fields arriving directly, with the row's line number", async () => {
      const preview = await staff.importPreview({
        rows: [
          row(2, { name: "   ", email: "not-an-email" }),
          row(3, { status: "archived" }),
          row(4, { balanceMinor: "1.5" }),
          row(5, { balanceMinor: "1e3" }),
          row(6, { balanceMinor: "1,000" }),
          row(7, { balanceMinor: `${9_007_199_254_740_992}` }),
          row(8, { currency: "US" }),
        ],
      });

      expect(preview.issues.map((issue) => `${issue.lineNumber}:${issue.field}`)).toEqual([
        "2:name",
        "2:email",
        "3:status",
        "4:balanceMinor",
        "5:balanceMinor",
        "6:balanceMinor",
        "7:balanceMinor",
        "8:currency",
      ]);
      expect(preview.sample).toEqual([]);
    });

    test("accepts the exact balance bounds and preserves a negative minor amount", async () => {
      const result = await staff.importConfirm({
        rows: [
          row(2, { balanceMinor: "-9007199254740991" }),
          row(3, { balanceMinor: "9007199254740991" }),
        ],
      });
      expect(result).toEqual({ ok: true, created: 2 });

      const { rows } = await staff.list({ search: "Import 2", status: "all" });
      expect(rows[0]?.balanceMinor).toBe(-9_007_199_254_740_991);
      fixtureIds.push(...rows.map((found) => found.id));
    });

    test("detects an existing Customer case-sensitively and counts archived rows", async () => {
      const local = unique();
      const saved = await staff.create({
        name: "Import saved fixture",
        email: local,
        balanceMinor: 0,
      });
      fixtureIds.push(saved.id);
      await staff.archiveMany({ ids: [saved.id] });

      const preview = await staff.importPreview({
        rows: [row(2, { email: local }), row(3, { email: local.toUpperCase() })],
      });

      expect(preview.issues).toMatchObject([
        { lineNumber: 2, field: "email", message: expect.stringContaining("existing Customer") },
      ]);

      const confirm = await staff.importConfirm({
        rows: [row(2, { email: local }), row(3, { email: local.toUpperCase() })],
      });
      expect(confirm).toEqual({ ok: false, conflictLineNumbers: [2] });

      // All-or-nothing: the case variant is a distinct Customer, but it must not
      // slip in beside a conflicting row.
      expect(await staff.list({ search: local.toUpperCase(), status: "all" })).toMatchObject({
        rowCount: 0,
      });

      const created = await staff.importConfirm({ rows: [row(3, { email: local.toUpperCase() })] });
      expect(created).toEqual({ ok: true, created: 1 });

      const stored = await staff.list({ search: local.toUpperCase(), status: "all" });
      expect(stored).toMatchObject({
        rowCount: 1,
        rows: [{ email: local.toUpperCase() }],
      });
      fixtureIds.push(...stored.rows.map((found) => found.id));
      expect(await staff.byId({ id: saved.id })).toMatchObject({ status: "archived" });
    });

    test("a Customer saved between preview and confirm leaves the whole batch unsaved", async () => {
      const rows = [row(2), row(3), row(4)];
      const preview = await staff.importPreview({ rows });
      expect(preview.issues).toEqual([]);

      const raced = await staff.create({
        name: "Raced in",
        email: rows[1]!.values.email,
        balanceMinor: 0,
      });
      fixtureIds.push(raced.id);

      const confirm = await staff.importConfirm({ rows });
      expect(confirm).toEqual({ ok: false, conflictLineNumbers: [3] });

      for (const attempt of [rows[0]!, rows[2]!]) {
        expect(await staff.list({ search: attempt.values.email, status: "all" })).toMatchObject({
          rowCount: 0,
        });
      }
    });

    test("a conflict only the transaction can see inserts nothing and names the line", async () => {
      // Reproduces the documented race deterministically. `existingEmails` reads
      // through `db`, while `importMany` re-reads inside `db.transaction` through
      // `tx`, so blinding only the top-level read is exactly "a competing writer
      // committed between the pre-check and the batch".
      const rows = [row(2), row(3), row(4)];
      const racedEmail = rows[1]!.values.email;

      const raced = await staff.create({
        name: "Raced in after the pre-check",
        email: racedEmail,
        balanceMinor: 0,
      });
      fixtureIds.push(raced.id);

      const blindDb: typeof db = new Proxy(db, {
        get(target, property, receiver) {
          if (property === "select") {
            return () => ({ from: () => ({ where: async () => [] }) });
          }
          return Reflect.get(target, property, receiver);
        },
      });

      const racing = customersRouter.createCaller({ db: blindDb, session });
      const confirm = await racing.importConfirm({ rows });

      expect(confirm).toEqual({ ok: false, conflictLineNumbers: [3] });

      // "Nothing was saved" must be literally true for the whole batch.
      for (const attempt of [rows[0]!, rows[2]!]) {
        expect(await staff.list({ search: attempt.values.email, status: "all" })).toMatchObject({
          rowCount: 0,
        });
      }
      expect(await staff.list({ search: racedEmail, status: "all" })).toMatchObject({
        rowCount: 1,
      });
    });

    test("importMany is all-or-nothing when one email is already stored", async () => {
      const queries = customerQueries(db);
      const stored = await create();
      const survivors = [unique(), unique()];

      const result = await queries.importMany([
        { id: crypto.randomUUID(), name: "Survivor A", email: survivors[0]!, balanceMinor: 0 },
        { id: crypto.randomUUID(), name: "Survivor B", email: survivors[1]!, balanceMinor: 0 },
        { id: crypto.randomUUID(), name: "Conflicting", email: stored.email, balanceMinor: 0 },
      ]);

      expect(result.created).toEqual([]);
      expect(result.conflictEmails).toEqual([stored.email]);
      // Neither survivor may exist: the whole batch must be a no-op.
      for (const email of survivors) {
        expect(await staff.list({ search: email, status: "all" })).toMatchObject({ rowCount: 0 });
      }
    });

    test("importMany stores every row when nothing conflicts", async () => {
      const queries = customerQueries(db);
      const emails = [unique(), unique()];

      const result = await queries.importMany(
        emails.map((email, index) => ({
          id: crypto.randomUUID(),
          name: `Batch ${index}`,
          email,
          balanceMinor: 0,
        })),
      );

      expect(result.conflictEmails).toEqual([]);
      expect(result.created.map((created) => created.email).sort()).toEqual([...emails].sort());
      fixtureIds.push(...result.created.map((created) => created.id));
    });

    test("a unique violation at the index still reports the conflicting email", async () => {
      // The final race check. The re-read is blinded so the INSERT is what hits
      // `customer_email_unique`, exactly as when a competing writer commits
      // between the re-read and the batch insert. The batch must roll back and
      // still name what conflicted.
      const queries = customerQueries(db);
      const racedEmail = unique();
      const survivor = unique();
      const raced = await staff.create({
        name: "Raced in at the index",
        email: racedEmail,
        balanceMinor: 0,
      });
      fixtureIds.push(raced.id);

      const blindTx = (tx: object) =>
        new Proxy(tx, {
          get(inner, property, receiver) {
            if (property === "select") {
              return () => ({
                from: () => ({ where: () => ({ orderBy: () => ({ for: async () => [] }) }) }),
              });
            }
            return Reflect.get(inner, property, receiver);
          },
        });

      const racingQueries = customerQueries(
        new Proxy(db, {
          get(target, property, receiver) {
            if (property === "transaction") {
              return (run: (tx: object) => Promise<unknown>) =>
                (target.transaction as (fn: (tx: object) => Promise<unknown>) => Promise<unknown>)(
                  (tx) => run(blindTx(tx)),
                );
            }
            return Reflect.get(target, property, receiver);
          },
        }) as typeof db,
      );

      const result = await racingQueries.importMany([
        { id: crypto.randomUUID(), name: "Survivor", email: survivor, balanceMinor: 0 },
        { id: crypto.randomUUID(), name: "Conflicting", email: racedEmail, balanceMinor: 0 },
      ]);

      expect(result.created).toEqual([]);
      expect(result.conflictEmails).toEqual([racedEmail]);
      // Nothing from the failed batch may survive.
      expect(await queries.existingEmails([survivor])).toEqual(new Set());
    });

    test("importMany reports a batch that repeats an email as a conflict", async () => {
      // Within-file duplicates are caught by validation before this seam, but the
      // helper is public: a repeated email must still abort with a named conflict
      // instead of returning ok with an empty conflict list.
      const queries = customerQueries(db);
      const repeated = unique();
      const survivor = unique();

      const result = await queries.importMany([
        { id: crypto.randomUUID(), name: "First", email: repeated, balanceMinor: 0 },
        { id: crypto.randomUUID(), name: "Other", email: survivor, balanceMinor: 0 },
        { id: crypto.randomUUID(), name: "Repeat", email: repeated, balanceMinor: 0 },
      ]);

      expect(result.created).toEqual([]);
      expect(result.conflictEmails).toEqual([repeated]);
      expect(await queries.existingEmails([survivor, repeated])).toEqual(new Set());
    });

    test("accepts at most the documented row count", async () => {
      const tooMany = Array.from({ length: 1001 }, (_, index) => row(index + 2));
      const signedIn = staff;

      await expect(signedIn.importPreview({ rows: tooMany })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("rejects a repeated or unknown field in a row", async () => {
      const bad = { lineNumber: 2, values: { ...row(2).values, statuses: "active" } };
      await expect(staff.importPreview({ rows: [bad] })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("a signed-out caller cannot preview or confirm", async () => {
      const signedOut = customersRouter.createCaller({ db, session: null });
      const rows = [row(2)];
      await expect(signedOut.importPreview({ rows })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(signedOut.importConfirm({ rows })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        signedOut.importStatus({ importId: crypto.randomUUID(), emails: [rows[0]!.values.email] }),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(await staff.list({ search: rows[0]!.values.email, status: "all" })).toMatchObject({
        rowCount: 0,
      });
    });

    test("replays idempotent importConfirm by importId and reconciles importStatus per user", async () => {
      const importId = crypto.randomUUID();
      const inputRow = row(2, { name: "Idempotent User" });

      expect(await staff.importStatus({ importId, emails: [inputRow.values.email] })).toEqual({
        status: "not_found",
      });

      const first = await staff.importConfirm({ rows: [inputRow], importId });
      expect(first).toEqual({ ok: true, created: 1 });
      const created = (await staff.list({ search: inputRow.values.email })).rows[0];
      if (created) fixtureIds.push(created.id);

      // Replaying the same importId returns the original success instead of reporting a duplicate conflict.
      const replay = await staff.importConfirm({ rows: [inputRow], importId });
      expect(replay).toEqual({ ok: true, created: 1 });

      expect(await staff.importStatus({ importId, emails: [inputRow.values.email] })).toEqual({
        status: "completed",
        result: { ok: true, created: 1 },
      });

      // Another authenticated user cannot read this user's importId result, and sees ambiguous emails instead.
      const otherCaller = customersRouter.createCaller({
        db,
        session: { ...session, user: { ...session.user, id: "other-staff" } },
      });
      expect(await otherCaller.importStatus({ importId, emails: [inputRow.values.email] })).toEqual(
        {
          status: "ambiguous",
          existingEmails: [inputRow.values.email],
        },
      );
    });
  });
});

describe.skipIf(!databaseUrl)("Customers export with disposable Postgres", () => {
  if (!databaseUrl) return;
  const { db, adminSession, staff } = createCustomerTestContext(databaseUrl);
  const adminIds: string[] = [];
  const emailPrefixes: string[] = [];
  afterAll(async () => {
    try {
      const admin = customersRouter.createCaller({ db, session: adminSession });
      for (const id of adminIds) await admin.remove({ id });
      for (const prefix of emailPrefixes) {
        await db.$client.query("delete from customer where email like $1", [`${prefix}%`]);
      }
    } finally {
      await db.$client.end();
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
    adminIds.push(fixture.id);
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

describe.skipIf(!databaseUrl)(
  "Customers tags, events, avatar & list deltas with disposable Postgres",
  () => {
    if (!databaseUrl) return;
    const { db, adminSession, staff } = createCustomerTestContext(databaseUrl);
    const fixtureIds: string[] = [];
    afterAll(async () => {
      try {
        const admin = customersRouter.createCaller({ db, session: adminSession });
        for (const id of fixtureIds) await admin.remove({ id });
      } finally {
        await db.$client.end();
      }
    });

    const unique = () => `${crypto.randomUUID()}@example.test`;

    test("stores customer tags, returns avatarUrl and tags in list, and exposes distinct tag suggestions", async () => {
      const tagA = `tag-${crypto.randomUUID().slice(0, 6)}`;
      const tagB = `tag-${crypto.randomUUID().slice(0, 6)}`;
      const first = await staff.create({
        name: "Tagged One",
        email: unique(),
        balanceMinor: 1500,
        avatarUrl: "/uploads/one.png",
        tags: [tagB, tagA, tagB],
      });
      const second = await staff.create({
        name: "Tagged Two",
        email: unique(),
        balanceMinor: 0,
        tags: [tagA],
      });
      fixtureIds.push(first.id, second.id);

      expect(first.tags).toEqual([tagB, tagA]);

      const listed = await staff.list({ search: first.email });
      expect(listed.rows[0]).toMatchObject({
        id: first.id,
        avatarUrl: "/uploads/one.png",
        tags: [tagB, tagA],
      });

      const allTags = await staff.tags();
      expect(allTags).toContain(tagA);
      expect(allTags).toContain(tagB);
      expect(allTags.filter((t: string) => t === tagA)).toHaveLength(1);
    });

    test("records customer_event audit trail across create, update, avatar set/clear, archive, restore, and addNote", async () => {
      const created = await staff.create({
        name: "Lifecycle Customer",
        email: unique(),
        balanceMinor: 500,
        avatarUrl: "/uploads/initial.png",
        tags: ["vip"],
      });
      fixtureIds.push(created.id);

      await staff.update({
        id: created.id,
        company: "Acme Corp",
        avatarUrl: "/uploads/updated.png",
      });

      const cleared = await staff.update({
        id: created.id,
        avatarUrl: null,
      });
      expect(cleared.avatarUrl).toBeNull();

      await staff.archiveMany({ ids: [created.id] });
      // Repeating archive should not duplicate the archived event.
      await staff.archiveMany({ ids: [created.id] });

      await staff.update({
        id: created.id,
        status: "active",
      });

      const note = await staff.events.addNote({
        customerId: created.id,
        body: "Confirmed contract renewal with CFO.",
      });
      expect(note).toMatchObject({
        customerId: created.id,
        type: "note",
        body: "Confirmed contract renewal with CFO.",
        actorId: "staff",
        actorName: "Staff",
      });

      const events = await staff.events.list({ customerId: created.id });
      expect(events.map((event) => event.type)).toEqual([
        "created",
        "avatar_updated",
        "updated",
        "avatar_removed",
        "archived",
        "restored",
        "note",
      ]);
    });

    test("events endpoints enforce auth and validate customer existence", async () => {
      const signedOut = customersRouter.createCaller({ db, session: null });
      await expect(signedOut.events.list({ customerId: "missing" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        signedOut.events.addNote({ customerId: "missing", body: "hi" }),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });

      await expect(
        staff.events.addNote({ customerId: crypto.randomUUID(), body: "Orphan note" }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  },
);
