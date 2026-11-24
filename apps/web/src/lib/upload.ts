import { serverUrl } from "@/lib/server-url";
import type { UploadHandler } from "@monorepo-boilerplate/ui/components/upload-dropzone";

/**
 * Upload transport for the bundled endpoint (`POST /uploads`).
 *
 * Swapping to presigned S3 means replacing this function, not the dropzone:
 * the block only knows `upload(file, { onProgress, signal }) => { url }`
 * (docs/adr/0004).
 */
export const uploadFile: UploadHandler = async (file, { onProgress, signal }) => {
  const body = new FormData();
  body.set("file", file);

  const response = await fetch(new URL("/uploads", serverUrl), {
    method: "POST",
    body,
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Upload failed (${response.status})`;
    throw new Error(message);
  }

  // fetch cannot report upload progress; the block still shows an indeterminate bar.
  onProgress(1);

  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("url" in payload) ||
    typeof payload.url !== "string"
  ) {
    throw new Error("Upload response did not include a URL");
  }
  // Stored values stay provider-relative: an absolute URL embeds the current
  // host, so a host change would invalidate every record and leak config into
  // API responses. Screens resolve it with `assetUrl()` at render time.
  return { url: payload.url };
};
