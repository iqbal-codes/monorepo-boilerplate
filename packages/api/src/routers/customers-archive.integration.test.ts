import { afterAll, describe, expect, test } from "bun:test";

import { customersRouter } from "./customers";
import {
  createCustomerTestContext,
  customersTestDatabaseUrl,
  uniqueTestEmail,
} from "./customers-test-context";

describe.skipIf(!customersTestDatabaseUrl)("Customers archive with disposable Postgres", () => {
  if (!customersTestDatabaseUrl) return;
  const { db, staff, fixtureIds, cleanup } = createCustomerTestContext(customersTestDatabaseUrl);
  afterAll(cleanup);

  const create = async () => {
    const fixture = await staff.create({
      name: "Archive fixture",
      email: uniqueTestEmail(),
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

    expect(await staff.list({ search })).toMatchObject({ rows: [], rowCount: 0 });
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
