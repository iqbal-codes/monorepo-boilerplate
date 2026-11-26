import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { IMPORT_MAX_REQUEST_BYTES, importBodyLimit } from "../src/lib/import-body-limit";

const APP_TOKEN = "test-session-token";

/**
 * Stands in for the tRPC handler: reports the decoded body length so the test
 * can prove the limit runs before any body is read.
 */
function stubApp() {
  const app = new Hono();
  app.use("/trpc/*", importBodyLimit());
  app.all("/trpc/*", async (c) => {
    const body = await c.req.text();
    return c.json({ path: c.req.path, bytes: body.length });
  });
  app.get("/", (c) => c.text("ok"));
  return app;
}

function bodyOfBytes(total: number) {
  const prefix = `{"json":null,"meta":{"values":["`;
  const suffix = `"]}}`;
  const filler = total - new TextEncoder().encode(prefix + suffix).length;
  const body = `${prefix}${"x".repeat(filler)}${suffix}`;
  return body;
}

function oversizedBody() {
  return bodyOfBytes(IMPORT_MAX_REQUEST_BYTES + 1);
}

describe("importBodyLimit", () => {
  test("exports the documented request ceiling", () => {
    expect(IMPORT_MAX_REQUEST_BYTES).toBe(8 * 1024 * 1024);
  });

  test("passes an ordinary request through to the next handler", async () => {
    const response = await stubApp().request("/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  test("passes other tRPC procedures through, even when the body is large", async () => {
    const body = oversizedBody();
    const response = await stubApp().request("/trpc/customers.list", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `session=${APP_TOKEN}` },
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ path: "/trpc/customers.list" });
  });

  test("answers 413 for an oversized importPreview POST before tRPC reads it", async () => {
    const response = await stubApp().request("/trpc/customers.importPreview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody(),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  test("answers 413 for an oversized importConfirm POST", async () => {
    const response = await stubApp().request("/trpc/customers.importConfirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody(),
    });

    expect(response.status).toBe(413);
  });

  test("answers 413 when a batched procedure list mentions an import", async () => {
    const response = await stubApp().request("/trpc/customers.list,customers.importConfirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody(),
    });

    expect(response.status).toBe(413);
  });

  test("accepts an import request at exactly the ceiling", async () => {
    const body = bodyOfBytes(IMPORT_MAX_REQUEST_BYTES);
    const response = await stubApp().request("/trpc/customers.importPreview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(new TextEncoder().encode(body).length).toBe(IMPORT_MAX_REQUEST_BYTES);
    expect(response.status).toBe(200);
  });

  test("rejects an import request one byte over the ceiling", async () => {
    const body = bodyOfBytes(IMPORT_MAX_REQUEST_BYTES + 1);
    const response = await stubApp().request("/trpc/customers.importPreview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(new TextEncoder().encode(body).length).toBe(IMPORT_MAX_REQUEST_BYTES + 1);
    expect(response.status).toBe(413);
  });

  test("does not limit the non-tRPC routes it is mounted in front of", async () => {
    const response = await stubApp().request("/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody(),
    });

    expect(response.status).toBe(404);
  });
});
