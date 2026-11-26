import { bodyLimit } from "hono/body-limit";
import type { MiddlewareHandler } from "hono";

/**
 * Request ceiling for the Customers import procedures.
 *
 * The browser caps a chosen file at 5 MiB (`MAX_IMPORT_BYTES`), and tRPC sends
 * it as JSON with escaping overhead, so 8 MiB leaves room without letting an
 * anonymous caller stream an unbounded body into the JSON decoder.
 */
export const IMPORT_MAX_REQUEST_BYTES = 8 * 1024 * 1024;

const IMPORT_PROCEDURES = ["customers.importPreview", "customers.importConfirm"] as const;

/**
 * tRPC's batch link joins procedure names with commas in the path:
 * `/trpc/customers.importPreview` or `/trpc/customers.list,customers.importConfirm`.
 */
function mentionsImport(c: { req: { path: string } }): boolean {
  const path = c.req.path;
  if (!path.startsWith("/trpc/")) return false;
  const procedures = decodeURIComponent(path.slice("/trpc/".length)).split(",");
  return procedures.some((procedure) =>
    IMPORT_PROCEDURES.includes(procedure as (typeof IMPORT_PROCEDURES)[number]),
  );
}

const limitedImportBody = bodyLimit({
  maxSize: IMPORT_MAX_REQUEST_BYTES,
  onError: (c) =>
    c.json(
      {
        error: {
          message: `The import request exceeded ${IMPORT_MAX_REQUEST_BYTES} bytes. Split the file into smaller imports.`,
          code: "PAYLOAD_TOO_LARGE",
        },
      },
      413,
    ),
});

/**
 * Rejects oversized import requests before tRPC decodes them. Every non-import
 * request — including other `/trpc` procedures — passes through untouched.
 *
 * Dependency-free on purpose (only `hono` and `hono/body-limit`): importing
 * `services` or `env.server` here would make the unit test boot the whole
 * server, auth included.
 */
export function importBodyLimit(): MiddlewareHandler {
  return async (c, next) => {
    if (!mentionsImport(c)) return next();
    return limitedImportBody(c, next);
  };
}
