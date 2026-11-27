import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { ErrorScreen, ForbiddenScreen, NotFoundScreen } from "../src/components/status-screens";

const ROOT_ROUTE_SOURCE = readFileSync(
  resolve(import.meta.dir, "../src/routes/__root.tsx"),
  "utf8",
);

describe("App status screen helpers and root wiring", () => {
  test("root route wires notFoundComponent and errorComponent", () => {
    expect(ROOT_ROUTE_SOURCE).toContain("notFoundComponent:");
    expect(ROOT_ROUTE_SOURCE).toContain("errorComponent:");
  });

  test("NotFoundScreen renders 404 copy and semantic link recovery action", () => {
    const html = renderToStaticMarkup(
      <NotFoundScreen
        renderHomeLink={({ className, children }) => (
          <a href="/" className={className}>
            {children}
          </a>
        )}
      />,
    );
    expect(html).toContain('data-status="404"');
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).not.toContain('role="button"');
  });

  test("ForbiddenScreen renders 403 helper for _auth routes", () => {
    const html = renderToStaticMarkup(
      <ForbiddenScreen
        renderFallbackLink={({ className, children }) => (
          <a href="/dashboard" className={className}>
            {children}
          </a>
        )}
      />,
    );
    expect(html).toContain('data-status="403"');
    expect(html).toContain("Access restricted");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('role="button"');
  });

  test("ErrorScreen renders 500 state and hides technical details unless showDetails is enabled", () => {
    const error = new Error("Boom in loader");
    const prodHtml = renderToStaticMarkup(
      <ErrorScreen
        error={error}
        reset={() => {}}
        showDetails={false}
        renderHomeLink={({ className, children }) => (
          <a href="/" className={className}>
            {children}
          </a>
        )}
      />,
    );
    expect(prodHtml).toContain('data-status="500"');
    expect(prodHtml).toContain("Try again");
    expect(prodHtml).not.toContain("Boom in loader");

    const devHtml = renderToStaticMarkup(
      <ErrorScreen
        error={error}
        reset={() => {}}
        showDetails
        renderHomeLink={({ className, children }) => (
          <a href="/" className={className}>
            {children}
          </a>
        )}
      />,
    );
    expect(devHtml).toContain('data-slot="status-screen-details"');
  });
});
