import { describe, expect, test } from "bun:test";
import {
  combineLocalDateAndTimeToUtcIso,
  getLocalTimeZone,
  parseIsoDate,
  parseIsoDateTime,
  toIsoDate,
} from "../src/components/form/date-utils";
import { extractErrorMessages, shouldShowFieldError } from "../src/components/form/error-utils";

describe("date-utils", () => {
  test("parses and formats YYYY-MM-DD without timezone drift", () => {
    const parsed = parseIsoDate("2026-11-24");
    expect(parsed).toBeDefined();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10);
    expect(parsed?.getDate()).toBe(24);
    expect(toIsoDate(parsed)).toBe("2026-11-24");
  });

  test("rejects impossible calendar dates like Feb 30", () => {
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
    expect(parseIsoDate("2026-13-01")).toBeUndefined();
    expect(parseIsoDate("not-a-date")).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate(undefined)).toBeUndefined();
  });

  test("handles leap day accurately", () => {
    expect(toIsoDate(parseIsoDate("2024-02-29"))).toBe("2024-02-29");
    expect(parseIsoDate("2025-02-29")).toBeUndefined();
  });

  test("combines local date and time into UTC ISO-8601 and round-trips", () => {
    const localDay = new Date(2026, 5, 15);
    const iso = combineLocalDateAndTimeToUtcIso(localDay, 14, 30, 15);
    expect(iso.endsWith("Z")).toBe(true);
    const roundTripped = parseIsoDateTime(iso);
    expect(roundTripped).toBeDefined();
    expect(roundTripped?.getFullYear()).toBe(2026);
    expect(roundTripped?.getMonth()).toBe(5);
    expect(roundTripped?.getDate()).toBe(15);
    expect(roundTripped?.getHours()).toBe(14);
    expect(roundTripped?.getMinutes()).toBe(30);
    expect(roundTripped?.getSeconds()).toBe(15);
  });

  test("returns a non-empty IANA time zone name", () => {
    const tz = getLocalTimeZone();
    expect(tz.length).toBeGreaterThan(0);
  });
});

describe("error-utils", () => {
  test("extracts and deduplicates string and Zod-style error objects", () => {
    expect(
      extractErrorMessages([
        "Required",
        { message: "Must be valid" },
        { message: "Required" },
        undefined,
        null,
        { code: "no-message" },
      ]),
    ).toEqual(["Required", "Must be valid"]);
  });

  test("gates error visibility on isTouched or submissionAttempts in auto mode", () => {
    expect(
      shouldShowFieldError({
        errors: ["Required"],
        isTouched: false,
        submissionAttempts: 0,
      }),
    ).toBe(false);

    expect(
      shouldShowFieldError({
        errors: ["Required"],
        isTouched: true,
        submissionAttempts: 0,
      }),
    ).toBe(true);

    expect(
      shouldShowFieldError({
        errors: ["Required"],
        isTouched: false,
        submissionAttempts: 1,
      }),
    ).toBe(true);

    expect(
      shouldShowFieldError({
        errors: [],
        isTouched: true,
        submissionAttempts: 2,
      }),
    ).toBe(false);
  });

  test("honors showError override modes", () => {
    expect(
      shouldShowFieldError({
        errors: ["Required"],
        isTouched: false,
        submissionAttempts: 0,
        showError: "always",
      }),
    ).toBe(true);

    expect(
      shouldShowFieldError({
        errors: ["Required"],
        isTouched: true,
        submissionAttempts: 3,
        showError: "never",
      }),
    ).toBe(false);
  });
});
