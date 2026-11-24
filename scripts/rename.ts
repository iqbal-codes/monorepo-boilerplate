#!/usr/bin/env bun
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

// Replaces the template's identifiers with the project's own. Runs on demand:
//   bun run rename my-app
//   bun run rename @acme
//
// A bare name also updates visible titles, the PWA manifest, and the Postgres
// database name. A scoped name (@acme) only changes the workspace scope, because
// npm package names must be lowercase and cannot carry spaces.

const TEMPLATE_NAME = "monorepo-boilerplate";
const TEMPLATE_SCOPE = "@monorepo-boilerplate";

const SKIP_DIRS: Record<string, true> = {
  ".git": true,
  node_modules: true,
  dist: true,
  build: true,
  ".turbo": true,
  ".wrangler": true,
  ".tanstack": true,
  coverage: true,
};

const TEXT_EXTENSIONS: Record<string, true> = {
  ".ts": true,
  ".tsx": true,
  ".js": true,
  ".jsx": true,
  ".mjs": true,
  ".cjs": true,
  ".json": true,
  ".jsonc": true,
  ".css": true,
  ".md": true,
  ".mdx": true,
  ".yml": true,
  ".yaml": true,
  ".toml": true,
  ".html": true,
  ".svg": true,
  ".txt": true,
};

const target = process.argv[2];

if (!target) {
  console.error("Usage: bun run rename <name>        # e.g. my-app");
  console.error("       bun run rename @scope       # e.g. @acme");
  process.exit(1);
}

const isScope = target.startsWith("@");

if (isScope && !/^@[a-z0-9][a-z0-9._-]*$/.test(target)) {
  console.error(`Invalid scope "${target}": use lowercase letters, digits, ".", "_" or "-".`);
  process.exit(1);
}

const projectName = isScope ? null : target;

if (projectName && !/^[a-z0-9][a-z0-9._-]*$/.test(projectName)) {
  console.error(`Invalid name "${projectName}": use lowercase letters, digits, ".", "_" or "-".`);
  process.exit(1);
}

const files: string[] = [];

async function walk(dir: string) {
  for (const entry of await readdir(dir)) {
    if (SKIP_DIRS[entry]) {
      continue;
    }

    const path = join(dir, entry);
    const info = await stat(path);

    if (info.isDirectory()) {
      await walk(path);
      continue;
    }

    const dot = entry.lastIndexOf(".");
    const extension = dot === -1 ? "" : entry.slice(dot);

    if (TEXT_EXTENSIONS[extension] || entry === "bun.lock") {
      files.push(path);
    }
  }
}

await walk(process.cwd());

let changed = 0;

for (const path of files) {
  const before = await readFile(path, "utf8");
  let after = before.replaceAll(TEMPLATE_SCOPE, isScope ? target : `@${projectName}`);

  if (projectName) {
    after = after.replaceAll(TEMPLATE_NAME, projectName);
  }

  if (after !== before) {
    await writeFile(path, after);
    changed += 1;
    console.log(`[rename] ${relative(process.cwd(), path)}`);
  }
}

console.log(
  changed === 0
    ? "[rename] nothing to change"
    : `[rename] ${changed} file(s) updated for ${isScope ? `${target}/*` : projectName}`,
);

// bun create names the root after the destination folder. A rename to a
// different name has to correct it here.
if (projectName) {
  const manifestPath = join(process.cwd(), "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { name?: string };

  if (manifest.name !== projectName) {
    manifest.name = projectName;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[rename] package.json name -> ${projectName}`);
  }

  console.log("[rename] run `bun install` to refresh bun.lock.");
}
