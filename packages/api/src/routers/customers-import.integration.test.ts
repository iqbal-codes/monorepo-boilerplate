import { afterAll, describe, expect, test } from "bun:test";
import { customerQueries } from "@monorepo-boilerplate/db/queries/customer";

import { customersRouter } from "./customers";
import {
  createCustomerTestContext,
  customersTestDatabaseUrl,
  uniqueTestEmail,
} from "./customers-test-context";

describe.skipIf(!customersTestDatabaseUrl)("Customers import with disposable Postgres", () => {
  if (!customersTestDatabaseUrl) return;
  const { db, session, staff, fixtureIds, cleanup } =
    createCustomerTestContext(customersTestDatabaseUrl);
  afterAll(cleanup);

  const create = async () => {
    const fixture = await staff.create({
      name: "Import fixture",
      email: uniqueTestEmail(),
      balanceMinor: 3800,
      avatarUrl: "/uploads/fixture.png",
    });
    fixtureIds.push(fixture.id);
    return fixture;
  };

  function row(lineNumber: number, values: Partial<Record<string, string>> = {}) {
    return {
      lineNumber,
      values: {
        name: `Import ${lineNumber}`,
        email: uniqueTestEmail(),
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
    const emails = [uniqueTestEmail(), uniqueTestEmail()];
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
    const email = uniqueTestEmail();
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
    const local = uniqueTestEmail();
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
    const survivors = [uniqueTestEmail(), uniqueTestEmail()];

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
    const emails = [uniqueTestEmail(), uniqueTestEmail()];

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
    const racedEmail = uniqueTestEmail();
    const survivor = uniqueTestEmail();
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
    const repeated = uniqueTestEmail();
    const survivor = uniqueTestEmail();

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

    await expect(staff.importPreview({ rows: tooMany })).rejects.toMatchObject({
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
    expect(await otherCaller.importStatus({ importId, emails: [inputRow.values.email] })).toEqual({
      status: "ambiguous",
      existingEmails: [inputRow.values.email],
    });
  });
});
