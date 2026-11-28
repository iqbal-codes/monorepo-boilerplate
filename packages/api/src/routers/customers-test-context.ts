import { createDb } from "@monorepo-boilerplate/db";

import { customersRouter } from "./customers";

export const customersTestDatabaseUrl = process.env.CUSTOMERS_TEST_DATABASE_URL;

export function uniqueTestEmail() {
  return `${crypto.randomUUID()}@example.test`;
}

export function createCustomerTestContext(url: string) {
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
  const fixtureIds: string[] = [];

  async function cleanup() {
    try {
      const admin = customersRouter.createCaller({ db, session: adminSession });
      for (const id of fixtureIds) await admin.remove({ id });
    } finally {
      await db.$client.end();
    }
  }

  return { db, session, adminSession, staff, fixtureIds, cleanup };
}
