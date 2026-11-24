import { describe, expect, test } from "bun:test";
import { FieldApi, FormApi } from "@tanstack/react-form";
import { renderToStaticMarkup } from "react-dom/server";
import { Combobox, ComboboxInput } from "../src/components/combobox";
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
