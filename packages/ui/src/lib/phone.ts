import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber as libIsValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export type { CountryCode };

export type PhoneCountry = {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
};

function countryCodeToFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join("");
}

let cachedCountries: ReadonlyArray<PhoneCountry> | null = null;

/**
 * Returns every ISO country supported by libphonenumber-js with its localized
 * English display name, calling code, and flag emoji, sorted alphabetically.
 */
export function getPhoneCountries(locale = "en"): ReadonlyArray<PhoneCountry> {
  if (locale === "en" && cachedCountries) {
    return cachedCountries;
  }

  const displayNames =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
      ? new Intl.DisplayNames([locale], { type: "region" })
      : null;

  const list: PhoneCountry[] = getCountries()
    .map((code) => ({
      code,
      name: displayNames?.of(code) ?? code,
      dialCode: getCountryCallingCode(code),
      flag: countryCodeToFlag(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  if (locale === "en") {
    cachedCountries = list;
  }

  return list;
}

/**
 * Checks whether a phone string is a valid phone number (E.164 or national
 * when `defaultCountry` is supplied). Intended for use in Screen Zod schemas.
 */
export function isValidPhoneNumber(value: string, defaultCountry?: CountryCode): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return libIsValidPhoneNumber(trimmed, defaultCountry);
}

/**
 * Formats an E.164 phone string for display. Returns the original input if it
 * cannot be parsed.
 */
export function formatPhoneNumber(
  value: string,
  style: "international" | "national" | "e164" = "international",
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = parsePhoneNumberFromString(trimmed);
  if (!parsed) return trimmed;
  if (style === "national") return parsed.formatNational();
  if (style === "e164") return parsed.number;
  return parsed.formatInternational();
}

/**
 * Splits a stored E.164 phone value into its ISO country code and national
 * digits for editing. Falls back to `defaultCountry` when empty or partial.
 */
export function parsePhoneParts(
  e164: string | undefined,
  defaultCountry: CountryCode = "US",
): { country: CountryCode; nationalInput: string } {
  const trimmed = (e164 ?? "").trim();
  if (!trimmed) {
    return { country: defaultCountry, nationalInput: "" };
  }

  const parsed =
    parsePhoneNumberFromString(trimmed) ?? parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.country) {
    return {
      country: parsed.country,
      nationalInput: parsed.nationalNumber,
    };
  }

  const dialCode = getCountryCallingCode(defaultCountry);
  const prefix = `+${dialCode}`;
  if (trimmed.startsWith(prefix)) {
    return {
      country: defaultCountry,
      nationalInput: trimmed.slice(prefix.length).replace(/\D/g, ""),
    };
  }

  return {
    country: defaultCountry,
    nationalInput: trimmed.replace(/\D/g, ""),
  };
}

/**
 * Converts a country selection and raw user input into an E.164 string
 * (or `""` when no digits are entered). Partial numbers keep their `+<cc>`
 * prefix so live typing never drops characters.
 */
export function buildPhoneE164(country: CountryCode, rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (trimmed.startsWith("+")) {
    const parsedIntl = parsePhoneNumberFromString(trimmed);
    if (parsedIntl) return parsedIntl.number;
    return `+${digits}`;
  }

  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (parsed) {
    return parsed.number;
  }

  const dialCode = getCountryCallingCode(country);
  return `+${dialCode}${digits}`;
}
