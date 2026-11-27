#!/usr/bin/env bun

const TEST_FILES = ["./packages/api/src/routers/customers.integration.test.ts"];

async function run(
  command: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const child = Bun.spawn(command, {
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
    env,
    stdio: ["inherit", "inherit", "inherit"],
    signal: AbortSignal.timeout(180_000),
  });
  return child.exited;
}

const providedUrl = process.env.CUSTOMERS_TEST_DATABASE_URL?.trim();
if (providedUrl) {
  const code = await runInherited(["bun", "test", ...TEST_FILES], {
    ...process.env,
    CUSTOMERS_TEST_DATABASE_URL: providedUrl,
  });
  process.exit(code);
}

if (!Bun.which("docker")) {
  console.error(
    "[test:integration] CUSTOMERS_TEST_DATABASE_URL is not set and `docker` is unavailable to boot disposable Postgres.",
  );
  process.exit(1);
}

const dockerInfo = await run(["docker", "info"]);
if (dockerInfo.code !== 0) {
  console.error(
    `[test:integration] CUSTOMERS_TEST_DATABASE_URL is not set and the Docker daemon is not reachable:\n${dockerInfo.stderr}`,
  );
  process.exit(1);
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
  console.error(`[test:integration] failed to start disposable Postgres:\n${started.stderr}`);
  process.exit(1);
}

const containerId = started.stdout;

try {
  const portResult = await run(["docker", "port", containerId, "5432/tcp"]);
  const port = Number(portResult.stdout.split(":").at(-1));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Unexpected docker port output: ${portResult.stdout}`);
  }

  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/customers_test`;
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
    process.exit(pushCode);
  }

  const testCode = await runInherited(["bun", "test", ...TEST_FILES], {
    ...process.env,
    CUSTOMERS_TEST_DATABASE_URL: databaseUrl,
  });
  process.exit(testCode);
} finally {
  await run(["docker", "stop", "--time", "2", containerId]);
}
