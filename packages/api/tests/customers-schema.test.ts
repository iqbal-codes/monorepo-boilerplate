import { describe, expect, test } from "bun:test";
import { customerCreateInput, customerUpdateInput } from "../src/routers/customers";

describe("customer input schemas (SEAM-01)", () => {
  test("customerUpdateInput omits create defaults when given only id", () => {
    const parsed = customerUpdateInput.parse({ id: "customer-1" });
    expect(parsed).toEqual({ id: "customer-1" });
    expect("status" in parsed).toBe(false);
    expect("currency" in parsed).toBe(false);
  });

  test("customerCreateInput still applies status and currency defaults", () => {
    const parsed = customerCreateInput.parse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      balanceMinor: 0,
    });
    expect(parsed.status).toBe("active");
    expect(parsed.currency).toBe("USD");
  });
});
