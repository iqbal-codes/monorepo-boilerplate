import { describe, expect, test } from "bun:test";

import { formatMoney } from "../src/lib/format";

describe("formatMoney", () => {
  test("preserves exact minor units at both signed Number.MAX_SAFE_INTEGER limits", () => {
    expect(formatMoney({ minor: 9_007_199_254_740_991, currency: "USD" })).toBe(
      "$90,071,992,547,409.91",
    );
    expect(formatMoney({ minor: -9_007_199_254_740_991, currency: "USD" })).toBe(
      "-$90,071,992,547,409.91",
    );
    expect(
      formatMoney({ minor: 9_007_199_254_740_991, currency: "USD" }, { withSymbol: false }),
    ).toBe("90,071,992,547,409.91");
    expect(
      formatMoney({ minor: -9_007_199_254_740_991, currency: "USD" }, { withSymbol: false }),
    ).toBe("-90,071,992,547,409.91");
  });

  test("handles zero, negative small minor units, and varying ISO minor digits", () => {
    expect(formatMoney({ minor: 0, currency: "USD" })).toBe("$0.00");
    expect(formatMoney({ minor: -0, currency: "USD" })).toBe("$0.00");
    expect(formatMoney({ minor: -5, currency: "USD" })).toBe("-$0.05");
    expect(formatMoney({ minor: 1200, currency: "USD" }, { withSymbol: false })).toBe("12");
    expect(formatMoney({ minor: 9_007_199_254_740_991, currency: "JPY" })).toBe(
      "¥9,007,199,254,740,991",
    );
    expect(formatMoney({ minor: 9_007_199_254_740_991, currency: "KWD" })).toBe(
      "KWD\u00a09,007,199,254,740.991",
    );
    expect(formatMoney({ minor: 1250, currency: "USD" }, { compact: true })).toBe("$12.50");
  });
});
