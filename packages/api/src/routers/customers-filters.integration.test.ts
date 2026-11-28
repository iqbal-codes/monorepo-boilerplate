import { afterAll, describe, expect, test } from "bun:test";

import { createCustomerTestContext, customersTestDatabaseUrl } from "./customers-test-context";

describe.skipIf(!customersTestDatabaseUrl)(
  "Customers multi-value filtering and facets with disposable Postgres",
  () => {
    const { staff, fixtureIds, cleanup } = createCustomerTestContext(customersTestDatabaseUrl!);

    afterAll(cleanup);

    test("filters by multi-value statuses[] and tags[] while returning accurate facet counts", async () => {
      const scope = `facet-${crypto.randomUUID().slice(0, 8)}`;
      const vipTag = `${scope}-vip`;
      const entTag = `${scope}-ent`;
      const betaTag = `${scope}-beta`;

      const cActiveVip = await staff.create({
        name: `${scope} Active VIP`,
        email: `${scope}-1@example.test`,
        status: "active",
        balanceMinor: 100,
        tags: [vipTag, entTag],
      });
      const cInactiveEnt = await staff.create({
        name: `${scope} Inactive Ent`,
        email: `${scope}-2@example.test`,
        status: "inactive",
        balanceMinor: 200,
        tags: [entTag],
      });
      const cArchivedBeta = await staff.create({
        name: `${scope} Archived Beta`,
        email: `${scope}-3@example.test`,
        status: "archived",
        balanceMinor: 300,
        tags: [betaTag, vipTag],
      });
      const cActiveNone = await staff.create({
        name: `${scope} Active None`,
        email: `${scope}-4@example.test`,
        status: "active",
        balanceMinor: 400,
        tags: [],
      });
      fixtureIds.push(cActiveVip.id, cInactiveEnt.id, cArchivedBeta.id, cActiveNone.id);

      // Default list excludes archived; status facet counts all 3 statuses for search scope,
      // while tag facet counts tags across the default non-archived scope.
      const defaultRes = await staff.list({ search: scope });
      expect(defaultRes.rows.map((r) => r.id)).toEqual(
        expect.arrayContaining([cActiveVip.id, cInactiveEnt.id, cActiveNone.id]),
      );
      expect(defaultRes.rows.some((r) => r.id === cArchivedBeta.id)).toBe(false);
      expect(defaultRes.rowCount).toBe(3);
      expect(defaultRes.facets.status).toEqual({ active: 2, inactive: 1, archived: 1 });
      expect(defaultRes.facets.tags.filter((t) => t.value.startsWith(scope))).toEqual([
        { value: betaTag, count: 0 },
        { value: entTag, count: 2 },
        { value: vipTag, count: 1 },
      ]);

      // Multi-value statuses[] includes archived when explicitly selected
      const activeAndArchived = await staff.list({
        search: scope,
        statuses: ["active", "archived"],
      });
      expect(activeAndArchived.rowCount).toBe(3);
      expect(activeAndArchived.rows.some((r) => r.id === cArchivedBeta.id)).toBe(true);
      expect(activeAndArchived.rows.some((r) => r.id === cInactiveEnt.id)).toBe(false);
      expect(activeAndArchived.facets.tags.filter((t) => t.value.startsWith(scope))).toEqual([
        { value: betaTag, count: 1 },
        { value: entTag, count: 1 },
        { value: vipTag, count: 2 },
      ]);

      // Multi-value tags[] filters via overlap and updates status facet counts accordingly
      const byTags = await staff.list({
        search: scope,
        tags: [vipTag, entTag],
      });
      expect(byTags.rowCount).toBe(2);
      expect(byTags.rows.map((r) => r.id)).toEqual(
        expect.arrayContaining([cActiveVip.id, cInactiveEnt.id]),
      );
      expect(byTags.facets.status).toEqual({ active: 1, inactive: 1, archived: 1 });

      // Combined statuses[] + tags[]
      const combined = await staff.list({
        search: scope,
        statuses: ["active", "inactive"],
        tags: [vipTag],
      });
      expect(combined.rowCount).toBe(1);
      expect(combined.rows[0]?.id).toBe(cActiveVip.id);
    });
  },
);
