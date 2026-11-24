/**
 * Date and datetime boundary helpers for Field Blocks.
 *
 * Date-only values cross the form boundary as `"YYYY-MM-DD"` strings and are
 * constructed from explicit year/month/day integers so they never shift across
 * timezones (never `new Date("YYYY-MM-DD")`, which parses UTC midnight).
 *
 * Datetime values cross the form boundary as UTC ISO-8601 strings and are
 * edited in the user's browser IANA time zone.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Parses a `"YYYY-MM-DD"` calendar date into a local `Date` at midnight,
 * rejecting invalid calendar dates such as `"2026-02-30"`.
 */
export function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

/** Formats a local `Date` as a `"YYYY-MM-DD"` string (or `""` when undefined). */
export function toIsoDate(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Parses an ISO-8601 datetime string into a `Date`, or `undefined` if invalid. */
export function parseIsoDateTime(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Combines a local calendar date and local wall-clock time into a UTC ISO-8601
 * string (`...Z`).
 */
export function combineLocalDateAndTimeToUtcIso(
  date: Date,
  hours: number,
  minutes: number,
  seconds = 0,
): string {
  const combined = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    seconds,
    0,
  );
  return combined.toISOString();
}

/**
 * Returns the browser's IANA time zone name (e.g. `"Asia/Jakarta"`,
 * `"America/New_York"`), falling back to `"UTC"`.
 */
export function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
