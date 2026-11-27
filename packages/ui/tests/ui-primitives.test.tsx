import { describe, expect, test } from "bun:test";
import { FieldApi, FormApi } from "@tanstack/react-form";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../src/components/button";
import { Combobox, ComboboxInput } from "../src/components/combobox";
import { columnsFor, DataTable } from "../src/components/data-table";
import {
  CurrencyField,
  fieldContext,
  NumberField,
  PhoneField,
  SelectField,
  TextareaField,
  TextField,
} from "../src/components/form";
import { ImportBlock } from "../src/components/import-block";
import { KpiCard, KpiGrid } from "../src/components/kpi-card";
import { ListToolbar } from "../src/components/list-toolbar";
import { PageHeader } from "../src/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../src/components/select";
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

  test("DataTable keeps rows mounted and marks the region busy while fetching", () => {
    type Row = { id: string; name: string };
    const helper = columnsFor<Row>();
    const columns = helper.columns([helper.accessor("name", { header: "Name" })]);

    const html = renderToStaticMarkup(
      <DataTable
        data={[{ id: "1", name: "Ada Lovelace" }]}
        columns={columns}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        isFetching
      />,
    );

    expect(html).toContain("Ada Lovelace");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('data-slot="skeleton"');
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

  test("Button uses a solid focus-visible outline instead of semi-transparent ring-ring/30", () => {
    const html = renderToStaticMarkup(<Button variant="outline">Download Excel template</Button>);

    expect(html).toContain("focus-visible:outline-ring");
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain("focus-visible:outline-solid");
    expect(html).not.toContain("ring-ring/30");
  });
});

describe("Clearable Select and ListToolbar filters", () => {
  test("Select shows placeholder when null and renders clear button when showClear is enabled", () => {
    const items = [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ];

    const emptyHtml = renderToStaticMarkup(
      <Select items={items} value={null}>
        <SelectTrigger aria-label="Filter by status" showClear={false} onClear={() => {}}>
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );

    expect(emptyHtml).toContain("All Status");
    expect(emptyHtml).toContain("data-placeholder");
    expect(emptyHtml).not.toContain('data-slot="select-clear"');

    const selectedHtml = renderToStaticMarkup(
      <Select items={items} value="active">
        <SelectTrigger
          aria-label="Filter by status"
          showClear
          clearLabel="Clear status filter"
          onClear={() => {}}
        >
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );

    expect(selectedHtml).toContain("Active");
    expect(selectedHtml).toContain('data-slot="select-clear"');
    expect(selectedHtml).toContain('aria-label="Clear status filter"');
  });

  test("ListToolbar renders search clear and Clear filters buttons only when active", () => {
    const inactiveHtml = renderToStaticMarkup(
      <ListToolbar
        search={{ label: "Search customers", value: "", onChange: () => {} }}
        hasActiveFilters={false}
        onClearFilters={() => {}}
      />,
    );

    expect(inactiveHtml).not.toContain('data-slot="list-toolbar-search-clear"');
    expect(inactiveHtml).not.toContain('data-slot="list-toolbar-clear-filters"');

    const activeHtml = renderToStaticMarkup(
      <ListToolbar
        search={{ label: "Search customers", value: "ada", onChange: () => {} }}
        hasActiveFilters
        onClearFilters={() => {}}
      />,
    );

    expect(activeHtml).toContain('data-slot="list-toolbar-search-clear"');
    expect(activeHtml).toContain('aria-label="Clear Search customers"');
    expect(activeHtml).toContain('data-slot="list-toolbar-clear-filters"');
    expect(activeHtml).toContain("Clear filters");
  });
});

describe("Form field primitives clearable support", () => {
  test("renders clear buttons across clearable TextField, TextareaField, NumberField, CurrencyField, PhoneField, and SelectField", () => {
    const form = new FormApi({
      defaultValues: {
        search: "acme",
        notes: "VIP account",
        qty: 42,
        balance: 12500,
        phone: "+14155552671",
        status: "active",
      },
    });
    const unmountForm = form.mount();

    const searchField = new FieldApi({ form, name: "search" });
    const notesField = new FieldApi({ form, name: "notes" });
    const qtyField = new FieldApi({ form, name: "qty" });
    const balanceField = new FieldApi({ form, name: "balance" });
    const phoneField = new FieldApi({ form, name: "phone" });
    const statusField = new FieldApi({ form, name: "status" });

    const unmounts = [
      searchField.mount(),
      notesField.mount(),
      qtyField.mount(),
      balanceField.mount(),
      phoneField.mount(),
      statusField.mount(),
    ];

    try {
      const renderWithField = (fieldApi: unknown, node: React.ReactNode) =>
        renderToStaticMarkup(
          <fieldContext.Provider value={fieldApi as never}>{node}</fieldContext.Provider>,
        );

      const textHtml = renderWithField(
        searchField,
        <TextField label="Search" type="search" clearable />,
      );
      expect(textHtml).toContain('aria-label="Clear Search"');

      const textareaHtml = renderWithField(notesField, <TextareaField label="Notes" clearable />);
      expect(textareaHtml).toContain('aria-label="Clear Notes"');

      const numberHtml = renderWithField(qtyField, <NumberField label="Quantity" clearable />);
      expect(numberHtml).toContain('aria-label="Clear Quantity"');

      const currencyHtml = renderWithField(
        balanceField,
        <CurrencyField label="Balance" currency="USD" clearable />,
      );
      expect(currencyHtml).toContain('aria-label="Clear Balance"');

      const phoneHtml = renderWithField(phoneField, <PhoneField label="Phone" clearable />);
      expect(phoneHtml).toContain('aria-label="Clear Phone"');

      const selectHtml = renderWithField(
        statusField,
        <SelectField
          label="Status"
          placeholder="All Status"
          options={[{ value: "active", label: "Active" }]}
          clearable
        />,
      );
      expect(selectHtml).toContain('data-slot="select-clear"');
      expect(selectHtml).toContain('aria-label="Clear Status"');
    } finally {
      for (const unmount of unmounts) unmount();
      unmountForm();
    }
  });
});

describe("KpiCard and KpiGrid", () => {
  test("renders compact KPI card with trend pill, progressbar, and sparkline", () => {
    const html = renderToStaticMarkup(
      <KpiGrid variant="strip">
        <KpiCard
          label="Open"
          value="8"
          tone="warning"
          trend={{ value: 0.24, label: "vs prior cycle" }}
          progress={{ value: 8, max: 23, label: "Open share" }}
          sparkline={[10, 14, 12, 18]}
          hint="8 of 23 invoices"
        />
      </KpiGrid>,
    );

    expect(html).toContain('data-slot="kpi-grid"');
    expect(html).toContain('data-variant="strip"');
    expect(html).toContain('data-slot="kpi-trend"');
    expect(html).toContain("+24%");
    expect(html).toContain("vs prior cycle");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="35"');
    expect(html).toContain('aria-label="Open share"');
    expect(html).toContain('data-slot="kpi-sparkline"');
  });

  test("renders as a native button with aria-pressed when interactive", () => {
    const html = renderToStaticMarkup(
      <KpiGrid>
        <KpiCard label="Paid" value="15" active onClick={() => {}} />
      </KpiGrid>,
    );

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-active="true"');
  });
});
