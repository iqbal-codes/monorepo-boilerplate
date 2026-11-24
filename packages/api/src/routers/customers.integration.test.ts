import { afterAll, describe, expect, test } from "bun:test";
import { createDb } from "@monorepo-boilerplate/db";
import { customersRouter } from "./customers";

const databaseUrl = process.env.CUSTOMERS_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("Customers archive with disposable Postgres", () => {
  if (!databaseUrl) return;
  const db = createDb({ DATABASE_URL: databaseUrl });
  const fixtureIds: string[] = [];
  afterAll(async () => {
    try {
      const admin = customersRouter.createCaller({ db, session: adminSession });
      for (const id of fixtureIds) await admin.remove({ id });
    } finally {
      await db.$client.end();
    }
  });

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
});
