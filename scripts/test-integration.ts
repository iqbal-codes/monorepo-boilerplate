#!/usr/bin/env bun
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const TEST_FILES = [
  "./packages/api/src/routers/customers-archive.integration.test.ts",
  "./packages/api/src/routers/customers-import.integration.test.ts",
  "./packages/api/src/routers/customers-export.integration.test.ts",
  "./packages/api/src/routers/customers-events.integration.test.ts",
];

async function run(
  command: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(180_000),
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function runInherited(
  command: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdio: ["inherit", "inherit", "inherit"],
    signal: AbortSignal.timeout(180_000),
  });
  return child.exited;
}

async function stopContainer(containerId: string): Promise<void> {
  const stop = await run(["docker", "stop", "--time", "2", containerId]);
  if (stop.code === 0) return;

  const rm = await run(["docker", "rm", "-f", containerId]);
  if (rm.code !== 0) {
    console.error(`[test:integration] failed to remove container ${containerId}: ${rm.stderr}`);
  }
}

let containerId: string | undefined;

try {
  let databaseUrl = process.env.CUSTOMERS_TEST_DATABASE_URL?.trim();
  if (databaseUrl) {
    if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
      throw new Error("CUSTOMERS_TEST_DATABASE_URL must be a postgresql:// URL");
    }
  } else {
    if (!Bun.which("docker")) {
      throw new Error(
        "[test:integration] CUSTOMERS_TEST_DATABASE_URL is not set and `docker` is unavailable to boot disposable Postgres.",
      );
    }

    const dockerInfo = await run(["docker", "info"]);
    if (dockerInfo.code !== 0) {
      throw new Error(
        `[test:integration] CUSTOMERS_TEST_DATABASE_URL is not set and the Docker daemon is not reachable:\n${dockerInfo.stderr}`,
      );
    }

    const password = crypto.randomUUID();
    const started = await run([
      "docker",
      "run",
      "--rm",
      "-d",
      "-p",
      "127.0.0.1::5432",
      "-e",
      "POSTGRES_DB=customers_test",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "postgres:18",
    ]);
    if (started.code !== 0 || !started.stdout) {
      throw new Error(`[test:integration] failed to start disposable Postgres:\n${started.stderr}`);
    }

    containerId = started.stdout;
    const portResult = await run(["docker", "port", containerId, "5432/tcp"]);
    const port = Number(portResult.stdout.split(":").at(-1));
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Unexpected docker port output: ${portResult.stdout}`);
    }

    databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/customers_test`;
    const deadline = Date.now() + 30_000;
    for (;;) {
      const ready = await run([
        "docker",
        "exec",
        containerId,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-d",
        "customers_test",
      ]);
      if (ready.code === 0) break;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for disposable Postgres:\n${ready.stderr}`);
      }
      await Bun.sleep(250);
    }

    const pushCode = await runInherited(["bun", "run", "db:push"], {
      ...process.env,
      DATABASE_URL: databaseUrl,
    });
    if (pushCode !== 0) {
      throw new Error(`[test:integration] bun run db:push failed with exit code ${pushCode}`);
    }
  }

  const testCode = await runInherited(["bun", "test", ...TEST_FILES], {
    ...process.env,
    DATABASE_URL: databaseUrl,
    CUSTOMERS_TEST_DATABASE_URL: databaseUrl,
  });
  if (testCode !== 0) {
    process.exitCode = testCode;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (containerId) {
    await stopContainer(containerId);
  }
}
