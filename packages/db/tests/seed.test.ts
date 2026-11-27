import { describe, expect, test } from "bun:test";
import { isValidPhoneNumber } from "../../ui/src/lib/phone";
import { buildCustomer, SEED_COUNT } from "../src/seed";

describe("customer seed fixture", () => {
  test("generates 53 deterministic customers with valid E.164 US fictional phones", () => {
    const customers = Array.from({ length: SEED_COUNT }, (_, index) => buildCustomer(index));

    expect(customers).toHaveLength(53);
    for (const row of customers) {
      expect(row.phone).toMatch(/^\+141555501\d{2}$/);
      expect(isValidPhoneNumber(row.phone)).toBe(true);
    }
  });
});
