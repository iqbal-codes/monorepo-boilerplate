import { describe, expect, test } from "bun:test";
import { FieldApi, FormApi } from "@tanstack/react-form";
import { renderToStaticMarkup } from "react-dom/server";
import { Combobox, ComboboxInput } from "../src/components/combobox";
import { columnsFor, DataTable } from "../src/components/data-table";
import { ImportBlock } from "../src/components/import-block";
import { ListToolbar } from "../src/components/list-toolbar";
import { PageHeader } from "../src/components/page-header";
import { Slider } from "../src/components/slider";

describe("Slider", () => {
  test("renders one thumb for a single numeric value or defaultValue", () => {
    const controlledHtml = renderToStaticMarkup(
      <Slider aria-label="Confidence" value={75} min={0} max={100} />,
    );
    const uncontrolledHtml = renderToStaticMarkup(
      <Slider aria-label="Threshold" defaultValue={40} min={0} max={100} />,
    );

    expect(controlledHtml.match(/data-slot="slider-thumb"/g)?.length).toBe(1);
    expect(uncontrolledHtml.match(/data-slot="slider-thumb"/g)?.length).toBe(1);
  });

  test("renders two thumbs for a range array value", () => {
    const html = renderToStaticMarkup(
      <Slider aria-label="Allocation" defaultValue={[20, 80]} min={0} max={100} />,
    );

    expect(html.match(/data-slot="slider-thumb"/g)?.length).toBe(2);
  });
});

describe("ComboboxInput", () => {
  test("renders accessible clear button label when a value is selected and showClear is enabled", () => {
    const html = renderToStaticMarkup(
      <Combobox items={["alpha", "beta"]} value="alpha">
        <ComboboxInput aria-label="Plan" showClear />
      </Combobox>,
    );

    expect(html).toContain('aria-label="Clear selection"');
  });
});

describe("TanStack Form onChange + onSubmit validation", () => {
  test("clears prior validation errors immediately when a field becomes valid", async () => {
    const validateName = ({ value }: { value: { name: string } }) =>
      value.name.trim().length < 2
        ? { form: "Fix errors", fields: { name: "Name too short" } }
        : undefined;

    const form = new FormApi({
      defaultValues: { name: "" },
      validators: {
        onChange: validateName,
        onSubmit: validateName,
      },
    });
    const unmountForm = form.mount();
    const field = new FieldApi({ form, name: "name" });
    const unmountField = field.mount();

    try {
      await form.validate("submit");
      expect(form.state.errorMap.onSubmit).toBe("Fix errors");
      expect(field.state.meta.errors.length).toBeGreaterThan(0);

      field.handleChange("Ada");
      await form.validate("change");
      await form.validate("submit");
      expect(form.state.errorMap.onChange).toBeUndefined();
      expect(form.state.errorMap.onSubmit).toBeUndefined();
      expect(field.state.meta.errors).toEqual([]);
    } finally {
      unmountField();
      unmountForm();
    }
  });
});

describe("Responsive UI blocks", () => {
  test("PageHeader hides subtitle on mobile unless keepDescriptionOnMobile is set", () => {
    const defaultHtml = renderToStaticMarkup(
      <PageHeader title="Customers" description="Server-driven table." />,
    );
    expect(defaultHtml).toContain("hidden sm:block");

    const keptHtml = renderToStaticMarkup(
      <PageHeader title="Ada" description="ada@example.com" keepDescriptionOnMobile />,
    );
    expect(keptHtml).not.toContain("hidden sm:block");
  });

  test("ListToolbar renders mobile Filters button with active count when filterSheet is provided", () => {
    const html = renderToStaticMarkup(
      <ListToolbar
        search={{ label: "Search", value: "", onChange: () => {} }}
        filters={<span data-testid="desktop-filter">Desktop filter</span>}
        filterSheet={{
          activeCount: 2,
          title: "Filter items",
          content: <span>Sheet filter</span>,
        }}
        resultLabel="5 results"
      />,
    );

    expect(html).toContain("Filters");
    expect(html).toContain(">2<");
    expect(html).toContain("hidden sm:flex");
  });

  test("DataTable renders accessible scroll region, mobile cards, and compact pagination", () => {
    type Row = { id: string; name: string; status: string };
    const helper = columnsFor<Row>();
    const columns = helper.columns([
      helper.accessor("name", { header: "Name" }),
      helper.accessor("status", { header: "Status" }),
    ]);

    const html = renderToStaticMarkup(
      <DataTable
        data={[{ id: "1", name: "Ada Lovelace", status: "active" }]}
        columns={columns}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        regionLabel="Customers table"
      />,
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Customers table"');
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain("Ada Lovelace");
  });

  test("ImportBlock omits trigger button when hideTrigger is true", () => {
    const html = renderToStaticMarkup(
      <ImportBlock
        contract={{ columns: ["name"], filename: "template.csv" }}
        defaults={{}}
        validate={() => []}
        confirm={() => ({ ok: true, created: 0 })}
        hideTrigger
      />,
    );

    expect(html).not.toContain('data-slot="import-trigger"');
  });
});
