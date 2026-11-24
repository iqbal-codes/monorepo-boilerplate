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
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path, serverUrl).toString();
}
