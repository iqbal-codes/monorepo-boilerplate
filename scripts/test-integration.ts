#!/usr/bin/env bun
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const testTarget = "./packages/api/src/routers/customers.integration.test.ts";

async function runChecked(
  command: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
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
  if (code !== 0) {
    throw new Error(`${command.join(" ")} exited with status ${code}\n${stderr || stdout}`);
  }
  return stdout.trim();
}

async function runInherited(
  command: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await child.exited;
}

async function stopContainer(containerId: string): Promise<void> {
  const stop = Bun.spawn(["docker", "stop", "--time", "2", containerId], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stopCode = await stop.exited;
  if (stopCode === 0) return;

  const rm = Bun.spawn(["docker", "rm", "-f", containerId], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [rmErr, rmCode] = await Promise.all([new Response(rm.stderr).text(), rm.exited]);
  if (rmCode !== 0) {
    console.error(`[test:integration] failed to remove container ${containerId}: ${rmErr.trim()}`);
  }
}

let container: string | undefined;

try {
  let databaseUrl = process.env.CUSTOMERS_TEST_DATABASE_URL?.trim();
  if (databaseUrl) {
    if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
      throw new Error("CUSTOMERS_TEST_DATABASE_URL must be a postgresql:// URL");
    }
  } else {
    const password = crypto.randomUUID();
    container = await runChecked([
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

    const portOutput = await runChecked(["docker", "port", container, "5432/tcp"]);
    const port = Number(portOutput.split(":").at(-1));
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Docker did not publish a valid Postgres port: ${portOutput}`);
    }
    databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/customers_test`;

    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await runChecked([
          "docker",
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-d",
          "customers_test",
        ]);
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await Bun.sleep(250);
      }
    }

    const pushCode = await runInherited(["bun", "run", "db:push"], {
      ...process.env,
      DATABASE_URL: databaseUrl,
    });
    if (pushCode !== 0) {
      throw new Error(`bun run db:push failed with exit code ${pushCode}`);
    }
  }

  const testCode = await runInherited(["bun", "test", testTarget], {
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
  if (container) {
    await stopContainer(container);
  }
}
