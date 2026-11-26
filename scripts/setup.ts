#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";

// One-shot local bootstrap: dependencies, env files, Postgres, schema, seed.
// Every step is idempotent, so re-running `bun run setup` after a schema change
// or `docker compose down` is safe.
const ROOT = join(import.meta.dir, "..");

type RunOptions = { allowFailure?: boolean };

function run(label: string, cmd: string[], { allowFailure = false }: RunOptions = {}) {
  console.log(`\n[setup] ${label}`);
  const result = Bun.spawnSync(cmd, {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  });

  if (result.exitCode !== 0 && !allowFailure) {
    console.error(`[setup] ${cmd.join(" ")} exited with code ${result.exitCode}`);
    console.error("[setup] fix the error above, then run `bun run setup` again.");
    process.exit(result.exitCode ?? 1);
  }

  return result.exitCode === 0;
}

// A fresh clone has no workspace links yet; `bun install` also runs env init and
// Varlock codegen through the root postinstall hook.
if (!existsSync(join(ROOT, "node_modules"))) {
  run("Installing workspace dependencies", ["bun", "install"]);
}

// Idempotent: existing .env files are kept, a committed secret placeholder is
// replaced with a generated value.
run("Preparing app env files", ["bun", "scripts/env-init.ts"]);

if (!Bun.which("docker")) {
  console.error("[setup] docker is required to start the bundled Postgres.");
  console.error(
    "[setup] install Docker, or point DATABASE_URL in apps/server/.env at your own Postgres.",
  );
  process.exit(1);
}

if (!run("Checking Docker Compose", ["docker", "compose", "version"], { allowFailure: true })) {
  console.error("[setup] Docker Compose v2 is required (`docker compose version` failed).");
  process.exit(1);
}

if (!run("Checking the Docker daemon", ["docker", "info"], { allowFailure: true })) {
  console.error(
    "[setup] the Docker daemon is not reachable; start Docker and run `bun run setup` again.",
  );
  process.exit(1);
}

// --wait blocks until the postgres healthcheck passes, so the schema push never
// races a booting server.
run("Starting Postgres", ["docker", "compose", "up", "-d", "--wait", "postgres"]);

// Migrations are still empty in this template, so push applies the schema
// directly. It is a no-op once the database is in sync.
run("Applying the database schema", ["bun", "run", "db:push"]);

run("Seeding 53 deterministic customers", ["bun", "run", "db:seed"]);

console.log(`
[setup] ready.
  web     http://localhost:3001
  api     http://localhost:3000

[setup] start development with: bun run dev
`);
