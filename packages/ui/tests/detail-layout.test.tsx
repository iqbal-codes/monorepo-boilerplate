import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DetailAside,
  DetailGrid,
  DetailHeader,
  DetailMain,
  DetailScreen,
} from "../src/components/detail-layout";

describe("DetailLayout", () => {
  test("renders responsive 2-tier header and 1:2 grid slots without order overrides", () => {
    const html = renderToStaticMarkup(
      <DetailScreen>
        <DetailHeader
          media={<div data-slot="avatar">AL</div>}
          title="Ada Lovelace"
          badge={<span>Active</span>}
          subtitle={<span>ada@example.com</span>}
          meta={<span>vip</span>}
          actions={<button type="button">Edit</button>}
        />
        <DetailGrid>
          <DetailAside>
            <div>Details</div>
          </DetailAside>
          <DetailMain>
            <div>Activity</div>
          </DetailMain>
        </DetailGrid>
      </DetailScreen>,
    );

    expect(html).toContain('data-slot="detail-screen"');
    expect(html).toContain('data-slot="detail-header"');
    expect(html).toContain('data-slot="detail-header-identity"');
    expect(html).toContain('data-slot="detail-header-actions"');
    expect(html).toContain('data-slot="detail-grid"');
    expect(html).toContain('data-slot="detail-aside"');
    expect(html).toContain('data-slot="detail-main"');
    expect(html).toContain("sm:flex-row");
    expect(html).toContain("lg:grid-cols-3");
    expect(html.indexOf('data-slot="detail-aside"')).toBeLessThan(
      html.indexOf('data-slot="detail-main"'),
    );
  });
});
