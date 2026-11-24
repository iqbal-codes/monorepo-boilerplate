import { describe, expect, test } from "bun:test";
import {
  buildPhoneE164,
  formatPhoneNumber,
  getPhoneCountries,
  isValidPhoneNumber,
  parsePhoneParts,
} from "../src/lib/phone";

describe("phone helpers", () => {
  test("validates E.164 and rejects malformed numbers", () => {
    expect(isValidPhoneNumber("+14155552671")).toBe(true);
    expect(isValidPhoneNumber("+6281234567890")).toBe(true);
    expect(isValidPhoneNumber("+123")).toBe(false);
    expect(isValidPhoneNumber("")).toBe(false);
    expect(isValidPhoneNumber("not-a-phone")).toBe(false);
  });

  test("formats E.164 values for display", () => {
    expect(formatPhoneNumber("+14155552671", "international")).toBe("+1 415 555 2671");
    expect(formatPhoneNumber("+14155552671", "national")).toBe("(415) 555-2671");
    expect(formatPhoneNumber("+14155552671", "e164")).toBe("+14155552671");
    expect(formatPhoneNumber("")).toBe("");
  });

  test("parses E.164 into country and national digits, falling back to defaultCountry", () => {
    expect(parsePhoneParts("+6281234567890", "US")).toEqual({
      country: "ID",
      nationalInput: "81234567890",
    });
    expect(parsePhoneParts("", "ID")).toEqual({
      country: "ID",
      nationalInput: "",
    });
  });

  test("builds E.164 from country code and raw national input", () => {
    expect(buildPhoneE164("US", "(415) 555-2671")).toBe("+14155552671");
    expect(buildPhoneE164("ID", "0812-3456-7890")).toBe("+6281234567890");
    expect(buildPhoneE164("US", "   ")).toBe("");
    // Partial input still produces a prefixed string so typing is not lost
    expect(buildPhoneE164("ID", "812")).toBe("+62812");
  });

  test("exposes sorted phone countries with dial codes and flags", () => {
    const countries = getPhoneCountries();
    expect(countries.length).toBeGreaterThan(200);
    const id = countries.find((c) => c.code === "ID");
    expect(id).toBeDefined();
    expect(id?.dialCode).toBe("62");
    expect(id?.flag).toBe("🇮🇩");
  });
});
