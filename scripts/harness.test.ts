import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const scriptsDir = resolve(import.meta.dir);

function hasProcessExitCall(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node) => {
    if (found) return;
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      ts.isIdentifier(current.expression.expression) &&
      current.expression.expression.text === "process" &&
      current.expression.name.text === "exit"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function findProcessExitInsideTryFinally(sourceText: string, fileName: string): number[] {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isTryStatement(node) && node.finallyBlock) {
      const scanTryOrCatch = (branch: ts.Node) => {
        if (
          ts.isCallExpression(branch) &&
          ts.isPropertyAccessExpression(branch.expression) &&
          ts.isIdentifier(branch.expression.expression) &&
          branch.expression.expression.text === "process" &&
          branch.expression.name.text === "exit"
        ) {
          const { line } = sf.getLineAndCharacterOfPosition(branch.getStart(sf));
          lines.push(line + 1);
        }
        ts.forEachChild(branch, scanTryOrCatch);
      };
      scanTryOrCatch(node.tryBlock);
      if (node.catchClause) scanTryOrCatch(node.catchClause);
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return lines;
}

describe("scripts harness invariants", () => {
  test("no script calls process.exit() inside a try/catch with a finally cleanup block", () => {
    const files = readdirSync(scriptsDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .sort();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = readFileSync(join(scriptsDir, file), "utf8");
      const violations = findProcessExitInsideTryFinally(content, file);
      expect(violations).toEqual([]);
    }
  });

  test("static guard catches process.exit() inside try...finally", () => {
    const bad = `
      try {
        process.exit(1);
      } finally {
        await cleanup();
      }
    `;
    expect(
      hasProcessExitCall(ts.createSourceFile("bad.ts", bad, ts.ScriptTarget.Latest, true)),
    ).toBe(true);
    expect(findProcessExitInsideTryFinally(bad, "bad.ts")).toEqual([3]);
  });
});
