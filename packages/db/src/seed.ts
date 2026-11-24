/**
 * Deterministic seed for the reference flow. Same 53 customers on every run, so
 * screenshots and pagination boundaries (1 page / N pages / 0 rows) are reproducible.
 *
 * Run from the db package: `bun run db:seed` (repository root: `bun run db:seed`).
 */
import { sql } from "drizzle-orm";
import "varlock/auto-load";

import { createDb } from "../src/index";
import { customer } from "../src/schema/customer";

const FIRST_NAMES = [
  "Ada",
  "Grace",
  "Alan",
  "Katherine",
  "Linus",
  "Margaret",
  "Dennis",
  "Barbara",
  "Ken",
  "Frances",
  "Donald",
  "Jean",
  "Edsger",
  "Radia",
  "Tim",
  "Anita",
  "Guido",
  "Carol",
  "Bjarne",
  "Sophie",
];

const LAST_NAMES = [
  "Lovelace",
  "Hopper",
  "Turing",
  "Johnson",
  "Torvalds",
  "Hamilton",
  "Ritchie",
  "Liskov",
  "Thompson",
  "Allen",
  "Knuth",
  "Sammet",
  "Dijkstra",
  "Perlman",
  "Berners-Lee",
  "Borg",
  "Rossum",
  "Shaw",
  "Stroustrup",
  "Wilson",
];

const COMPANIES = [
  "Northwind Supply",
  "Contoso Ltd",
  "Fabrikam Inc",
  "Tailspin Toys",
  "Adventure Works",
  "Blue Yonder Airlines",
  "Proseware",
  "Litware",
  "Wide World Importers",
  "Alpine Ski House",
];

const STATUSES = ["active", "active", "active", "inactive", "archived"] as const;

/** Deterministic pseudo-random in [0, 1): index-shuffled, no clock, no Math.random. */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function buildCustomer(index: number) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]!;
  const name = `${first} ${last}`;
  const status = STATUSES[Math.floor(noise(index, 1) * STATUSES.length)]!;
  const balanceMinor = Math.round(noise(index, 2) * 5_000_000) - 250_000;

  return {
    id: `seed-customer-${String(index + 1).padStart(3, "0")}`,
    name,
    email: `${first}.${last}.${index + 1}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, ""),
    phone: `+1 (555) ${String(100 + (index % 900)).padStart(3, "0")}-${String(
      1000 + Math.floor(noise(index, 3) * 9000),
    ).padStart(4, "0")}`,
    company: COMPANIES[index % COMPANIES.length]!,
    status,
    balanceMinor,
    currency: "USD",
    avatarUrl: null,
    notes: index % 5 === 0 ? "Onboarded through the reference flow seed." : null,
    // Spread creation dates backwards so default sort has a meaningful order.
    createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
    updatedAt: new Date(Date.UTC(2026, 0, 1 + index)),
  };
}

const SEED_COUNT = 53;

async function main() {
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL ?? "" });
  const rows = Array.from({ length: SEED_COUNT }, (_, index) => buildCustomer(index));

  await db
    .insert(customer)
    .values(rows)
    .onConflictDoUpdate({
      target: customer.id,
      set: {
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        phone: sql`excluded.phone`,
        company: sql`excluded.company`,
        status: sql`excluded.status`,
        balanceMinor: sql`excluded.balance_minor`,
        currency: sql`excluded.currency`,
        notes: sql`excluded.notes`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  console.log(`seeded ${rows.length} customers`);
  await db.$client.end();
}

await main();
