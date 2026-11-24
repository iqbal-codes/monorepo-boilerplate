#!/usr/bin/env bun
import { randomBytes } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Every app that ships a .env.example gets a working .env on first install, so a
// freshly scaffolded project type-checks without manual setup. Idempotent: an
// existing .env is never touched.
const APPS = ["apps/web", "apps/server"] as const;

const PLACEHOLDER = "replace-me-with-a-32-byte-hex-secret";

async function ensureEnv(app: string) {
  const dir = join(process.cwd(), app);
  const example = join(dir, ".env.example");
  const target = join(dir, ".env");

  if (!existsSync(example)) {
    console.warn(`[env] ${app}/.env.example is missing, skipping`);
    return;
  }

  if (existsSync(target)) {
    await fillSecrets(target);
    return;
  }

  await copyFile(example, target);
  await fillSecrets(target);
  console.log(`[env] created ${app}/.env from .env.example`);
}

// A committed placeholder must never reach a running server.
async function fillSecrets(path: string) {
  const contents = await readFile(path, "utf8");

  if (!contents.includes(PLACEHOLDER)) {
    return;
  }

  await writeFile(path, contents.replaceAll(PLACEHOLDER, randomBytes(32).toString("hex")));
  console.log(`[env] generated BETTER_AUTH_SECRET in ${path}`);
}

for (const app of APPS) {
  await ensureEnv(app);
}
