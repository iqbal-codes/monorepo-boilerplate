/**
 * Single formatting boundary for the app. Nothing else may call
 * `Intl.NumberFormat`/`toLocaleString`: locale and currency are injected so a
 * consumer switches them by editing the defaults in one place.
 *
 * Money is always an integer number of currency minor units (see GLOSSARY.md).
 */

export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_CURRENCY = "USD";

export type Money = {
  /** Integer amount in currency minor units. */
  minor: number;
  /** ISO 4217 code. */
  currency: string;
};

/**
 * Currencies whose minor unit is not 1/100. Anything absent uses 2 digits,
 * which is correct for the overwhelming majority of ISO 4217 codes.
 */
const MINOR_UNIT_DIGITS: Record<string, number> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

export function minorUnitDigits(currency: string): number {
  return MINOR_UNIT_DIGITS[currency.toUpperCase()] ?? 2;
}

export function minorUnitFactor(currency: string): number {
  return 10 ** minorUnitDigits(currency);
}

export function toMajorUnits({ minor, currency }: Money): number {
  return minor / minorUnitFactor(currency);
}

/** Rounds half away from zero, matching how cash amounts are drawn. */
export function toMinorUnits(value: number, currency: string): number {
  const scaled = value * minorUnitFactor(currency);
  return Math.sign(scaled) * Math.round(Math.abs(scaled));
}

type FormatOptions = {
  locale?: string;
  /** Show the currency symbol/code. Off for table cells that already say the currency. */
  withSymbol?: boolean;
  /** Chipper display such as `US$1.2K`. Off everywhere amounts must stay exact. */
  compact?: boolean;
};

export function formatMoney(
  money: Money,
  { locale = DEFAULT_LOCALE, withSymbol = true, compact = false }: FormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: withSymbol ? "currency" : "decimal",
    currency: money.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: withSymbol ? minorUnitDigits(money.currency) : 0,
    maximumFractionDigits: minorUnitDigits(money.currency),
    notation: compact ? "compact" : "standard",
  }).format(toMajorUnits(money));
}

/**
 * Parses user input ("1,234.50", "$12", "-3") into currency minor units.
 * Returns `null` for input that is not a finite number.
 */
export function parseMoneyInput(input: string, currency: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const normalized = cleaned.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return toMinorUnits(value, currency);
}

const integerGroupFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits: 0 });

/**
 * Formats a partially typed decimal string for editing: groups the integer
 * part and preserves a trailing decimal separator. No rounding, so live typing
 * round-trips through `parseNumberInput`/`parseMoneyInput`.
 */
export function formatNumberInput(input: string): string {
  if (/[eE]/.test(input)) return input;
  const negative = input.trimStart().startsWith("-");
  const unsigned = negative ? input.slice(input.indexOf("-") + 1) : input;
  const separator = unsigned.indexOf(".");
  const integerPart = (separator === -1 ? unsigned : unsigned.slice(0, separator)).replace(
    /\D/g,
    "",
  );
  const digits = integerPart.replace(/^0+(?=\d)/, "");
  const fraction = separator === -1 ? "" : unsigned.slice(separator + 1).replace(/\D/g, "");
  const grouped = digits === "" ? "" : integerGroupFormatter.format(BigInt(digits));
  return `${negative ? "-" : ""}${grouped}${separator === -1 ? "" : "."}${fraction}`;
}

/**
 * Parses grouped numeric input ("1,234.5") into a number. Returns `null` for
 * blank or incomplete input.
 */
export function parseNumberInput(input: string): number | null {
  const normalized = input.replace(/,/g, "").trim();
  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatNumber(
  value: number,
  {
    locale = DEFAULT_LOCALE,
    compact = false,
    maximumFractionDigits = 2,
  }: Omit<FormatOptions, "withSymbol"> & { maximumFractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

export function formatPercent(
  /** Fraction, not percentage points: 0.42 renders as 42%. */
  value: number,
  {
    locale = DEFAULT_LOCALE,
    maximumFractionDigits = 1,
  }: { locale?: string; maximumFractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits,
  }).format(value);
}

export function formatDate(
  value: Date | string | number,
  {
    locale = DEFAULT_LOCALE,
    dateStyle = "medium",
  }: { locale?: string; dateStyle?: "short" | "medium" | "long" | "full" } = {},
): string {
  return new Intl.DateTimeFormat(locale, { dateStyle }).format(new Date(value));
}

export function formatDateTime(
  value: Date | string | number,
  { locale = DEFAULT_LOCALE }: { locale?: string } = {},
): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
