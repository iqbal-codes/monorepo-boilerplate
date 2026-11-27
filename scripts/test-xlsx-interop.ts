import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildXlsx } from "../packages/ui/src/lib/xlsx";

const directory = await mkdtemp(join(tmpdir(), "customers-xlsx-interop-"));
try {
  const notes = ["Reference _x0041_", "Valid note \uFFFE\uFFFF", "Following customer"];
  const workbook = join(directory, "customers.xlsx");
  await writeFile(
    workbook,
    await buildXlsx({ headers: ["notes"], rows: notes.map((note) => [note]) }),
  );

  const conversion = Bun.spawn(
    [
      "soffice",
      `-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`,
      "--headless",
      "--convert-to",
      "csv:Text - txt - csv (StarCalc):44,34,76",
      "--outdir",
      directory,
      workbook,
    ],
    { stdout: "inherit", stderr: "inherit", signal: AbortSignal.timeout(30_000) },
  );
  assert.equal(await conversion.exited, 0, "LibreOffice can read the generated workbook");
  const csv = await readFile(join(directory, "customers.csv"), "utf8");
  assert.deepEqual(csv.trimEnd().split(/\r?\n/), ["notes", ...notes]);
  console.log("LibreOffice preserved every exported note and row.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
