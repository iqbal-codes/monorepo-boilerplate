import { join, resolve } from "node:path";

import { createLocalStorage, MAX_UPLOAD_BYTES } from "@monorepo-boilerplate/storage";
import { Hono } from "hono";

import { ENV } from "../env.server";
import { auth } from "../services";

const uploadDir = resolve(ENV.UPLOAD_DIR ?? "./uploads");
const storage = createLocalStorage({ directory: uploadDir });

/** Public `text/html` content types are refused so an upload can never become a page. */
const INLINE_SAFE: Record<string, true> = {
  "image/png": true,
  "image/jpeg": true,
  "image/webp": true,
  "image/gif": true,
  "application/pdf": true,
};

export const uploads = new Hono();

// Serves previously uploaded files. Unauthenticated because keys are random
// UUIDs and the web app embeds these URLs in <img src>.
uploads.get("/:key", async (c) => {
  const key = c.req.param("key");
  if (key.includes("/") || key.includes("\\") || key.includes("..")) {
    return c.json({ error: "Invalid key" }, 400);
  }

  const file = Bun.file(join(uploadDir, key));
  if (!(await file.exists())) {
    return c.json({ error: "Not found" }, 404);
  }

  const contentType = file.type || "application/octet-stream";
  return new Response(file, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "content-disposition": INLINE_SAFE[contentType] === true ? "inline" : "attachment",
      "x-content-type-options": "nosniff",
    },
  });
});

/**
 * Multipart upload endpoint. Returns a public URL the caller stores on its own
 * record; this route never writes domain rows.
 */
uploads.post("/", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "Expected a `file` field" }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "File exceeds the 5 MB limit" }, 413);
  }

  try {
    const stored = await storage.put({
      filename: file.name,
      contentType: file.type,
      data: await file.arrayBuffer(),
    });
    // Relative on purpose: an absolute URL embeds the configured host, and the
    // web app resolves it against its own server URL.
    return c.json(stored, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return c.json({ error: message }, 400);
  }
});
