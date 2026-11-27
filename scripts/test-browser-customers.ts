import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SQL } from "bun";
import { chromium, type Browser, type Page } from "playwright";

const root = resolve(import.meta.dir, "..");
const caseIds = ["focus", "export-cancel", "import-response-loss"] as const;
type CaseId = (typeof caseIds)[number];

const args = Bun.argv.slice(2);
const requested = args[0] === "--case" ? args[1] : undefined;
const selected = caseIds.filter((id) => !requested || id === requested);
if (args.length > 0 && (args.length !== 2 || !requested || selected.length !== 1)) {
  throw new Error(`Usage: bun run test:browser:customers [--case ${caseIds.join("|")}]`);
}

const directory = process.env.ARTIFACTS_DIR
  ? resolve(process.env.ARTIFACTS_DIR, "evidence")
  : await mkdtemp(join(tmpdir(), "customers-browser-"));
await mkdir(directory, { recursive: true });

async function run(command: string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
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
  if (code !== 0) throw new Error(`${command[0]} exited with status ${code}\n${stderr}`);
  return stdout.trim();
}

async function signIn(page: Page, preview: Map<string, string>) {
  const url = preview.get("URL")!;
  await page.goto(new URL("/sign-in", url).href);
  await page.locator('input[name="email"]').fill(preview.get("E2E_EMAIL")!);
  await page.locator('input[name="password"]').fill(preview.get("E2E_PASSWORD")!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((current) => current.pathname !== "/sign-in");
  await page.goto(new URL("/customers", url).href);
  await page.getByRole("button", { name: "More customer actions" }).waitFor();
}

async function openImport(page: Page) {
  await page.getByRole("button", { name: "More customer actions" }).click();
  await page.getByRole("menuitem", { name: "Import CSV / Excel" }).click();
  await page.getByRole("dialog", { name: "Import customers" }).waitFor();
}

async function checkFocus(page: Page) {
  const labels = ["Download Excel template", "Choose file"];
  await openImport(page);
  const reached = new Set<string>();
  for (let index = 0; index < 12 && reached.size < labels.length; index += 1) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(async (labels) => {
      const focused = document.activeElement;
      const dialog = focused?.closest('[role="dialog"]');
      const label = focused?.textContent?.trim();
      if (!focused || !dialog || !label || !labels.includes(label)) return null;
      // Flush the focus style, then measure after its CSS transition.
      const outline = getComputedStyle(focused);
      void outline.outlineWidth;
      await Promise.all(
        focused.getAnimations().map((animation) => animation.finished.catch(() => {})),
      );
      const context = document.createElement("canvas").getContext("2d")!;
      const surface = getComputedStyle(dialog).backgroundColor;
      const luminance = (rgba: Uint8ClampedArray) =>
        [0.2126, 0.7152, 0.0722].reduce((sum, weight, channel) => {
          const value = rgba[channel]! / 255;
          return (
            sum + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          );
        }, 0);
      context.fillStyle = surface;
      context.fillRect(0, 0, 1, 1);
      const background = luminance(context.getImageData(0, 0, 1, 1).data);
      context.fillStyle = outline.outlineColor;
      context.fillRect(0, 0, 1, 1);
      const ring = luminance(context.getImageData(0, 0, 1, 1).data);
      return {
        label,
        visible:
          focused.matches(":focus-visible") &&
          outline.outlineStyle !== "none" &&
          parseFloat(outline.outlineWidth) >= 2,
        contrast: (Math.max(ring, background) + 0.05) / (Math.min(ring, background) + 0.05),
      };
    }, labels);
    if (result) {
      assert.ok(result.visible, `${result.label} shows a keyboard focus outline`);
      assert.ok(
        result.contrast >= 3,
        `${result.label} focus contrast was ${result.contrast.toFixed(2)}:1`,
      );
      reached.add(result.label);
    }
  }
  assert.deepEqual(
    [...reached].sort(),
    [...labels].sort(),
    "Both import controls are keyboard reachable",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "More customer actions",
  );
}

async function checkExportCancel(page: Page) {
  const context = page.context();
  const path = "**/trpc/customers.export?*";
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await context.route(path, async (route) => {
    requested.resolve();
    await release.promise;
    // The preview worker can terminate while Playwright is holding the request.
    await route.continue().catch(() => {});
  });

  const exportCsv = async () => {
    await page.getByRole("button", { name: "More customer actions" }).click();
    await page.getByRole("menuitem", { name: "Export CSV (.csv)" }).click();
  };
  try {
    const exportRequest = context.waitForEvent("request", {
      predicate: (request) => new URL(request.url()).pathname === "/trpc/customers.export",
    });
    await exportCsv();
    const request = await exportRequest;
    // Use the actual intercepted fetch as the precondition for departure.
    await Promise.race([
      requested.promise,
      Bun.sleep(5_000).then(() => {
        throw new Error("Could not hold the export request");
      }),
    ]);
    const stopped = request.response();
    await page.locator('a[href^="/customers/"]:visible').first().click();
    await page.waitForURL(/\/customers\/[^/?]+/);
    release.resolve();
    assert.equal(await stopped, null, "The in-flight request is cancelled on detail navigation");
  } finally {
    release.resolve();
    await context.unroute(path);
  }
  await page.goBack();
  await page.getByRole("button", { name: "More customer actions" }).waitFor();
  const downloaded = page.waitForEvent("download");
  await exportCsv();
  assert.match((await downloaded).suggestedFilename(), /\.csv$/);
  assert.equal(downloads.length, 1, "Only the export started after returning downloads a file");
}

async function checkImportResponseLoss(page: Page) {
  const name = `Response loss ${crypto.randomUUID().slice(0, 8)}`;
  const email = `${name.replaceAll(" ", "-").toLowerCase()}@example.test`;
  const context = page.context();
  let confirmations = 0;
  let serverReply: unknown;
  const reconciled = page.waitForResponse((response) =>
    new URL(response.url()).pathname
      .split(",")
      .some((path) => path.endsWith("customers.importStatus")),
  );
  await context.route("**/trpc/*", async (route) => {
    const procedures = new URL(route.request().url()).pathname.split(",");
    if (!procedures.some((path) => path.endsWith("customers.importConfirm"))) {
      await route.continue();
      return;
    }
    confirmations += 1;
    const response = await route.fetch();
    serverReply = await response.json();
    await route.abort("connectionreset");
  });

  await openImport(page);
  const dialog = page.getByRole("dialog", { name: "Import customers" });
  await dialog.getByLabel("CSV or Excel file").setInputFiles({
    name: "customers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `name,email,phone,company,status,balanceMinor,currency,notes\r\n${name},${email},,,,,,\r\n`,
    ),
  });
  await dialog.getByRole("button", { name: "Import 1 record", exact: true }).click();
  assert.ok((await reconciled).ok(), "The app asks the server to reconcile the committed attempt");
  await page.getByText("1 customer imported.", { exact: true }).first().waitFor();
  assert.equal(confirmations, 1);
  assert.deepEqual(serverReply, [{ result: { data: { ok: true, created: 1 } } }]);

  await dialog.waitFor({ state: "hidden" });
  const search = page.getByRole("searchbox", { name: "Search customers" });
  await search.fill(email);
  await page.getByRole("link", { name, exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name, exact: true }).count(), 1);
}

type CaseResult = { id: CaseId; status: "PASS" | "FAIL"; evidence: string[]; error?: string };
const results: CaseResult[] = [];
let container: string | undefined;
let previewPid: number | undefined;
let browser: Browser | undefined;
let setupError: string | undefined;
try {
  let databaseUrl = process.env.CUSTOMERS_BROWSER_DATABASE_URL;
  if (databaseUrl) {
    assert.match(databaseUrl, /^postgres(?:ql)?:\/\//, "A disposable PostgreSQL URL is required");
    const sql = new SQL(databaseUrl);
    try {
      const relations = await sql`
        SELECT 1 FROM pg_class JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
        WHERE pg_namespace.nspname = 'public' LIMIT 1
      `;
      assert.equal(
        relations.length,
        0,
        "CUSTOMERS_BROWSER_DATABASE_URL must point to an empty database",
      );
    } finally {
      await sql.close();
    }
  } else {
    const password = crypto.randomUUID();
    container = await run([
      "docker",
      "run",
      "--rm",
      "-d",
      "-p",
      "127.0.0.1::5432",
      "-e",
      "POSTGRES_DB=customers_browser",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      "postgres:18",
    ]);
    const port = Number((await run(["docker", "port", container, "5432/tcp"])).split(":").at(-1));
    assert.ok(port > 0, "Docker published a private Postgres port");
    databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/customers_browser`;
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        await run([
          "docker",
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-d",
          "customers_browser",
        ]);
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await Bun.sleep(250);
      }
    }
  }

  await run(["bun", "run", "db:push"], { ...process.env, DATABASE_URL: databaseUrl });
  await run(["bun", "run", "db:seed"], { ...process.env, DATABASE_URL: databaseUrl });
  const output = await run(["bash", ".archon/ui-preview.sh", "--with-api"], {
    ...process.env,
    PREVIEW_DATABASE_URL: databaseUrl,
  });
  const preview = new Map(
    output.split("\n").map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
  previewPid = Number(preview.get("PID"));
  assert.ok(
    previewPid > 0 && preview.has("URL") && preview.has("E2E_EMAIL") && preview.has("E2E_PASSWORD"),
    "Preview printed the PID, URL and test credentials",
  );

  browser = await chromium.launch();
  for (const id of selected) {
    const evidence: string[] = [];
    try {
      const profiles =
        id === "focus"
          ? [
              { colorScheme: "light" as const, width: 1280 },
              { colorScheme: "light" as const, width: 320 },
              { colorScheme: "dark" as const, width: 1280 },
              { colorScheme: "dark" as const, width: 320 },
            ]
          : [{ colorScheme: "light" as const, width: 1280 }];
      const check =
        id === "focus"
          ? checkFocus
          : id === "export-cancel"
            ? checkExportCancel
            : checkImportResponseLoss;
      for (const { colorScheme, width } of profiles) {
        const context = await browser.newContext({
          colorScheme,
          serviceWorkers: "block",
          viewport: { width, height: 800 },
        });
        const page = await context.newPage();
        const label = `customers-${id}-${colorScheme}-${width}`;
        page.setDefaultTimeout(12_000);
        context.setDefaultTimeout(12_000);
        await context.tracing.start({ screenshots: true, snapshots: true });
        try {
          await signIn(page, preview);
          await page.waitForFunction(() => document.documentElement.matches(".light, .dark"));
          if (
            await page.evaluate(
              (theme) => !document.documentElement.classList.contains(theme),
              colorScheme,
            )
          ) {
            await page.getByRole("button", { name: "Toggle theme" }).click();
          }
          await page.waitForFunction(
            (theme) => document.documentElement.classList.contains(theme),
            colorScheme,
          );
          await check(page);
          await context.tracing.stop();
        } catch (error) {
          const trace = `${label}.zip`;
          await context.tracing.stop({ path: join(directory, trace) });
          evidence.push(trace);
          throw error;
        } finally {
          await context.close();
        }
      }
      results.push({ id, status: "PASS", evidence });
      console.log(`PASS ${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id, status: "FAIL", evidence, error: message });
      console.error(`FAIL ${id}\n${message}`);
      process.exitCode = 1;
    }
  }
} catch (error) {
  setupError = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  try {
    await browser?.close();
    if (previewPid && previewPid > 0) process.kill(previewPid);
  } finally {
    if (container) await run(["docker", "stop", "--time", "2", container]);
    const path = join(directory, "customers-browser.json");
    await writeFile(path, JSON.stringify({ results, setupError }, null, 2) + "\n");
    console.log(`Browser evidence written to ${path}`);
  }
}
