import { afterAll, describe, expect, test } from "bun:test";
import { customerQueries } from "@monorepo-boilerplate/db/queries/customer";

import { customersRouter, customerUpdateInput } from "./customers";
import {
  createCustomerTestContext,
  customersTestDatabaseUrl,
  uniqueTestEmail,
} from "./customers-test-context";

describe.skipIf(!customersTestDatabaseUrl)(
  "Customers tags, events, avatar & list deltas with disposable Postgres",
  () => {
    if (!customersTestDatabaseUrl) return;
    const { db, staff, fixtureIds, cleanup } = createCustomerTestContext(customersTestDatabaseUrl);
    afterAll(cleanup);

    test("stores customer tags, returns avatarUrl and tags in list, and exposes distinct tag suggestions", async () => {
      const tagA = `tag-${crypto.randomUUID().slice(0, 6)}`;
      const tagB = `tag-${crypto.randomUUID().slice(0, 6)}`;
      const first = await staff.create({
        name: "Tagged One",
        email: uniqueTestEmail(),
        balanceMinor: 1500,
        avatarUrl: "/uploads/one.png",
        tags: [tagB, tagA, tagB],
      });
      const second = await staff.create({
        name: "Tagged Two",
        email: uniqueTestEmail(),
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
        email: uniqueTestEmail(),
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

    test("SEAM-01: clearing avatar on archived non-USD record does not implicitly restore or reset currency", async () => {
      const parsedPatch = customerUpdateInput.parse({ id: "probe-id", avatarUrl: null });
      expect(parsedPatch).toEqual({ id: "probe-id", avatarUrl: null });
      expect("status" in parsedPatch).toBe(false);
      expect("currency" in parsedPatch).toBe(false);

      const created = await staff.create({
        name: "Archived Euro",
        email: uniqueTestEmail(),
        status: "archived",
        balanceMinor: 2500,
        currency: "EUR",
        avatarUrl: "/uploads/euro-avatar.png",
      });
      fixtureIds.push(created.id);

      const cleared = await staff.update({
        id: created.id,
        avatarUrl: null,
      });

      expect(cleared.status).toBe("archived");
      expect(cleared.currency).toBe("EUR");
      expect(cleared.avatarUrl).toBeNull();

      const events = await staff.events.list({ customerId: created.id });
      expect(events.map((event) => event.type)).toEqual(["created", "avatar_removed"]);
    });

    test("SEAM-03: rejects absolute URLs, protocol-relative paths, and traversal in avatarUrl", async () => {
      const created = await staff.create({
        name: "Avatar Validation",
        email: uniqueTestEmail(),
        balanceMinor: 0,
      });
      fixtureIds.push(created.id);

      for (const badUrl of [
        "https://example.com/avatar.png",
        "http://localhost:3000/uploads/avatar.png",
        "//evil.example/avatar.png",
        "javascript:alert(1)",
        "/uploads/../secret.png",
      ]) {
        await expect(
          staff.create({
            name: "Bad Avatar",
            email: uniqueTestEmail(),
            balanceMinor: 0,
            avatarUrl: badUrl,
          }),
        ).rejects.toThrow();

        await expect(
          staff.update({
            id: created.id,
            avatarUrl: badUrl,
          }),
        ).rejects.toThrow();
      }
    });

    test("SEAM-05: orders concurrent updates by insertion time after row lock rather than transaction start time", async () => {
      const created = await staff.create({
        name: "Concurrent Lock Order",
        email: uniqueTestEmail(),
        balanceMinor: 100,
        company: "Initial",
      });
      fixtureIds.push(created.id);

      let markT2Started!: () => void;
      const t2Started = new Promise<void>((resolve) => {
        markT2Started = resolve;
      });
      let markT1Locked!: () => void;
      const t1Locked = new Promise<void>((resolve) => {
        markT1Locked = resolve;
      });

      // Transaction 2 begins first (earlier transaction_timestamp()), waits for T1
      // to acquire the row lock via update(), blocks on FOR UPDATE, then overwrites T1.
      const t2Promise = db.transaction(async (tx2) => {
        await customerQueries(tx2 as unknown as typeof db).byId(created.id);
        markT2Started();
        await t1Locked;
        await customerQueries(tx2 as unknown as typeof db).update(
          created.id,
          { company: "Second Writer" },
          { id: "staff-2", name: "Staff Two" },
        );
      });

      await t2Started;
      await Bun.sleep(30);

      // Transaction 1 begins later, acquires the row lock first, holds it briefly
      // while T2 blocks on FOR UPDATE, then commits first.
      await db.transaction(async (tx1) => {
        await customerQueries(tx1 as unknown as typeof db).update(
          created.id,
          { company: "First Writer" },
          { id: "staff-1", name: "Staff One" },
        );
        markT1Locked();
        await Bun.sleep(30);
      });

      await t2Promise;

      const latest = await staff.byId({ id: created.id });
      expect(latest?.company).toBe("Second Writer");

      const events = await staff.events.list({ customerId: created.id });
      const updateEvents = events.filter((event) => event.type === "updated");
      expect(updateEvents).toHaveLength(2);
      expect(updateEvents[0]?.actorName).toBe("Staff One");
      expect(updateEvents[1]?.actorName).toBe("Staff Two");
      expect(new Date(updateEvents[0]!.createdAt).getTime()).toBeLessThanOrEqual(
        new Date(updateEvents[1]!.createdAt).getTime(),
      );
    });

    test("preserves concurrent archive when saving an unrelated diff-only field patch", async () => {
      const created = await staff.create({
        name: "Concurrent Archive Guard",
        email: uniqueTestEmail(),
        balanceMinor: 2500,
        currency: "EUR",
        company: "Before",
        status: "active",
      });
      fixtureIds.push(created.id);

      await staff.archiveMany({ ids: [created.id] });

      // Client edits only `company` from its opening snapshot and omits `status`.
      const updated = await staff.update({
        id: created.id,
        company: "After",
      });

      expect(updated.status).toBe("archived");
      expect(updated.currency).toBe("EUR");
      expect(updated.company).toBe("After");

      const events = await staff.events.list({ customerId: created.id });
      expect(events.map((event) => event.type)).toEqual(["created", "archived", "updated"]);
    });
  },
);
