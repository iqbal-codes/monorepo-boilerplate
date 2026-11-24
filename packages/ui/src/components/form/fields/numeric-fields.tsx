import * as React from "react";
import { cn } from "cn";

import { Input } from "@monorepo-boilerplate/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@monorepo-boilerplate/ui/components/input-group";
import { Slider } from "@monorepo-boilerplate/ui/components/slider";
import { formatMoney, parseMoneyInput } from "@monorepo-boilerplate/ui/lib/format";

import { buildDescribedBy, FieldFrame, useFieldFeedback, useFieldIds } from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps } from "../types";

export type NumberFieldProps = BaseFieldProps & {
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  readOnly?: boolean;
  /** Leading text or icon inside an InputGroup. */
  startAddon?: React.ReactNode;
  /** Trailing text or unit (e.g. "kg", "pcs") inside an InputGroup. */
  endAddon?: React.ReactNode;
  /** Alias for `endAddon` when displaying a measurement unit. */
  unit?: React.ReactNode;
  inputClassName?: string;
};

/**
 * Numeric Field Block. Form state holds `number | undefined`: clearing the
 * input writes `undefined` instead of coercing blank input to `0`.
 */
export function NumberField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  min,
  max,
  step,
  placeholder,
  readOnly,
  startAddon,
  endAddon,
  unit,
  inputClassName,
}: NumberFieldProps) {
  const field = useFieldContext<number | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const trailing = endAddon ?? unit;
  const hasAddons = Boolean(startAddon || trailing);

  const rawValue =
    field.state.value !== undefined && Number.isFinite(field.state.value)
      ? String(field.state.value)
      : "";

  const sharedInputProps = {
    id: ids.fieldId,
    name: field.name,
    type: "number" as const,
    inputMode: "decimal" as const,
    value: rawValue,
    min,
    max,
    step,
    placeholder,
    disabled,
    readOnly,
    required,
    "aria-invalid": invalid,
    "aria-describedby": buildDescribedBy({
      hasDescription: Boolean(description),
      invalid,
      ids,
    }),
    onBlur: field.handleBlur,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.value.trim() === "") {
        field.handleChange(undefined);
        return;
      }
      const parsed = event.target.valueAsNumber;
      if (Number.isFinite(parsed)) {
        field.handleChange(parsed);
      }
    },
  };

  return (
    <FieldFrame
      label={label}
      description={description}
      messages={messages}
      invalid={invalid}
      hideLabel={hideLabel}
      required={required}
      disabled={disabled}
      orientation={orientation}
      className={className}
      ids={ids}
    >
      {hasAddons ? (
        <InputGroup data-disabled={disabled || undefined}>
          {startAddon ? (
            <InputGroupAddon align="inline-start">
              <InputGroupText>{startAddon}</InputGroupText>
            </InputGroupAddon>
          ) : null}
          <InputGroupInput {...sharedInputProps} className={cn("tabular-nums", inputClassName)} />
          {trailing ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText className="text-xs">{trailing}</InputGroupText>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : (
        <Input {...sharedInputProps} className={cn("tabular-nums", inputClassName)} />
      )}
    </FieldFrame>
  );
}

export type CurrencyFieldProps = BaseFieldProps & {
  /** ISO 4217 currency code, e.g. `"USD"`, `"IDR"`. */
  currency: string;
  placeholder?: string;
  readOnly?: boolean;
  inputClassName?: string;
};

/**
 * Money Field Block. Form state holds `number | undefined` in integer Currency
 * minor units; users edit in major units and clearing the input writes
 * `undefined`.
 */
export function CurrencyField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  currency,
  placeholder = "0.00",
  readOnly,
  inputClassName,
}: CurrencyFieldProps) {
  const field = useFieldContext<number | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const [draft, setDraft] = React.useState<string | null>(null);

  const displayed =
    draft ??
    (field.state.value !== undefined && Number.isFinite(field.state.value)
      ? formatMoney({ minor: field.state.value, currency }, { withSymbol: false })
      : "");

  return (
    <FieldFrame
      label={label}
      description={description}
      messages={messages}
      invalid={invalid}
      hideLabel={hideLabel}
      required={required}
      disabled={disabled}
      orientation={orientation}
      className={className}
      ids={ids}
    >
      <InputGroup data-disabled={disabled || undefined}>
        <InputGroupAddon align="inline-start">
          <InputGroupText className="text-xs font-medium">{currency}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={ids.fieldId}
          name={field.name}
          inputMode="decimal"
          value={displayed}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={invalid}
          aria-describedby={buildDescribedBy({
            hasDescription: Boolean(description),
            invalid,
            ids,
          })}
          className={cn("text-right tabular-nums", inputClassName)}
          onBlur={() => {
            setDraft(null);
            field.handleBlur();
          }}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            if (raw.trim() === "") {
              field.handleChange(undefined);
              return;
            }
            const parsed = parseMoneyInput(raw, currency);
            if (parsed !== null) {
              field.handleChange(parsed);
            }
          }}
        />
      </InputGroup>
    </FieldFrame>
  );
}

export type SliderFieldProps = BaseFieldProps & {
  min?: number;
  max?: number;
  step?: number;
  /** Displays the current formatted value alongside the label. Defaults to `true`. */
  showValue?: boolean;
  formatValue?: (value: number | readonly number[]) => React.ReactNode;
};

/**
 * Slider Field Block. Supports both single scalar `number` and range `[number, number]`
 * form values matching Base UI's `Slider`.
 */
export function SliderField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  min = 0,
  max = 100,
  step = 1,
  showValue = true,
  formatValue,
}: SliderFieldProps) {
  const field = useFieldContext<number | number[] | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const currentValue = field.state.value ?? min;
  const formattedValue = formatValue
    ? formatValue(currentValue)
    : Array.isArray(currentValue)
      ? `${currentValue[0]} – ${currentValue[1]}`
      : String(currentValue);

  return (
    <FieldFrame
      label={
        showValue ? (
          <span className="flex w-full items-center justify-between gap-2">
            <span>{label}</span>
            <span className="font-normal text-muted-foreground tabular-nums">{formattedValue}</span>
          </span>
        ) : (
          label
        )
      }
      description={description}
      messages={messages}
      invalid={invalid}
      hideLabel={hideLabel}
      required={required}
      disabled={disabled}
      orientation={orientation}
      className={className}
      ids={ids}
      htmlFor={null}
    >
      <div className="py-2">
        <Slider
          id={ids.fieldId}
          name={field.name}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={currentValue}
          aria-labelledby={ids.labelId}
          aria-describedby={buildDescribedBy({
            hasDescription: Boolean(description),
            invalid,
            ids,
          })}
          onValueChange={(next) => {
            if (Array.isArray(currentValue)) {
              field.handleChange(Array.isArray(next) ? [...next] : [next, next]);
            } else {
              field.handleChange(Array.isArray(next) ? next[0] : next);
            }
          }}
          onValueCommitted={() => field.handleBlur()}
        />
      </div>
    </FieldFrame>
  );
}
