import { serverUrl } from "@/lib/server-url";

/**
 * Resolves a stored asset path (`/uploads/<key>`) to an absolute URL.
 *
 * Records store provider-relative paths, never host-derived absolute URLs: the
 * absolute form embeds the deployment host, so a host change would break every
 * stored reference and echo configuration into API responses.
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    }
    // Reject non-http(s) URI schemes (e.g. javascript:, data:, malformed authorities).
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      return null;
    }
    const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return new URL(normalized, serverUrl).toString();
  } catch {
    return null;
  }
}
