import * as React from "react";
import { cn } from "cn";
import { XIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@monorepo-boilerplate/ui/components/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { RadioGroup, RadioGroupItem } from "@monorepo-boilerplate/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@monorepo-boilerplate/ui/components/toggle-group";

import {
  buildDescribedBy,
  FieldFrame,
  FieldSetFrame,
  useFieldFeedback,
  useFieldIds,
} from "../field-frame";
import { useFieldContext } from "../form-context";
import { optionLabelText, type BaseFieldProps, type FieldOption } from "../types";

function groupOptions(options: ReadonlyArray<FieldOption>) {
  const ungrouped: FieldOption[] = [];
  const groups = new Map<string, FieldOption[]>();
  for (const option of options) {
    if (option.group) {
      const existing = groups.get(option.group) ?? [];
      existing.push(option);
      groups.set(option.group, existing);
    } else {
      ungrouped.push(option);
    }
  }
  return { ungrouped, groups };
}

export type SelectFieldProps = BaseFieldProps & {
  options: ReadonlyArray<FieldOption>;
  placeholder?: string;
  size?: "sm" | "default";
  clearable?: boolean;
  triggerClassName?: string;
};

export function SelectField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  options,
  placeholder = "Select an option",
  size = "default",
  clearable = false,
  triggerClassName,
}: SelectFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const value = field.state.value ? field.state.value : null;
  const showClear = clearable && value !== null && !disabled;
  const items = React.useMemo(
    () => [
      { value: null, label: placeholder },
      ...options.map((opt) => ({ value: opt.value, label: opt.label })),
    ],
    [options, placeholder],
  );
  const { ungrouped, groups } = React.useMemo(() => groupOptions(options), [options]);

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
      <div className="relative flex w-full items-center">
        <Select
          items={items}
          value={value}
          disabled={disabled}
          required={required}
          name={field.name}
          onValueChange={(next) => {
            field.handleChange(next === null ? undefined : String(next));
          }}
        >
          <SelectTrigger
            id={ids.fieldId}
            size={size}
            aria-invalid={invalid}
            aria-describedby={buildDescribedBy({
              hasDescription: Boolean(description),
              invalid,
              ids,
            })}
            onBlur={field.handleBlur}
            className={cn("w-full", showClear && "pr-8", triggerClassName)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {ungrouped.length > 0 ? (
              <SelectGroup>
                {ungrouped.map((option) => (
                  <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {[...groups.entries()].map(([groupName, groupItems]) => (
              <SelectGroup key={groupName}>
                <SelectLabel>{groupName}</SelectLabel>
                {groupItems.map((option) => (
                  <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {showClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-0 inset-y-0 my-auto"
            aria-label={`Clear ${typeof label === "string" ? label : "selection"}`}
            onClick={() => {
              field.handleChange(undefined);
              field.handleBlur();
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </FieldFrame>
  );
}

export type ComboboxFieldProps = BaseFieldProps & {
  options: ReadonlyArray<FieldOption>;
  placeholder?: string;
  emptyText?: React.ReactNode;
  multiple?: boolean;
  clearable?: boolean;
  renderOption?: (option: FieldOption) => React.ReactNode;
};

export function ComboboxField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  options,
  placeholder = "Search…",
  emptyText = "No results found.",
  multiple = false,
  clearable = true,
  renderOption,
}: ComboboxFieldProps) {
  const field = useFieldContext<string | string[] | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const anchor = useComboboxAnchor();

  const optionByValue = React.useMemo(() => {
    const map = new Map<string, FieldOption>();
    for (const opt of options) map.set(opt.value, opt);
    return map;
  }, [options]);

  const describedBy = buildDescribedBy({
    hasDescription: Boolean(description),
    invalid,
    ids,
  });

  if (multiple) {
    const selectedValues = Array.isArray(field.state.value) ? field.state.value : [];
    const selectedOptions = selectedValues
      .map((val) => optionByValue.get(val))
      .filter((opt): opt is FieldOption => opt !== undefined);

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
        <Combobox
          multiple
          items={options}
          value={selectedOptions}
          disabled={disabled}
          isItemEqualToValue={(a, b) => a.value === b.value}
          itemToStringLabel={optionLabelText}
          itemToStringValue={(opt) => opt.value}
          onValueChange={(next) => {
            const list = Array.isArray(next) ? next : [];
            field.handleChange(list.map((opt) => opt.value));
          }}
        >
          <ComboboxChips ref={anchor} className="w-full">
            <ComboboxValue>
              {(values: FieldOption[]) => (
                <>
                  {values.map((opt) => (
                    <ComboboxChip
                      key={opt.value}
                      showRemove={!disabled}
                      removeLabel={`Remove ${optionLabelText(opt)}`}
                    >
                      {opt.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id={ids.fieldId}
                    name={field.name}
                    placeholder={values.length === 0 ? placeholder : ""}
                    disabled={disabled}
                    aria-invalid={invalid}
                    aria-describedby={describedBy}
                    onBlur={field.handleBlur}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>{emptyText}</ComboboxEmpty>
            <ComboboxList>
              {(item: FieldOption) => (
                <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
                  {renderOption ? (
                    renderOption(item)
                  ) : (
                    <span className="flex flex-col">
                      <span>{item.label}</span>
                      {item.description ? (
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      ) : null}
                    </span>
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </FieldFrame>
    );
  }

  const singleValue =
    typeof field.state.value === "string" ? (optionByValue.get(field.state.value) ?? null) : null;

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
      <Combobox
        items={options}
        value={singleValue}
        disabled={disabled}
        isItemEqualToValue={(a, b) => a.value === b.value}
        itemToStringLabel={optionLabelText}
        itemToStringValue={(opt) => opt.value}
        onValueChange={(next) => {
          field.handleChange(next ? next.value : undefined);
        }}
      >
        <ComboboxInput
          id={ids.fieldId}
          name={field.name}
          placeholder={placeholder}
          disabled={disabled}
          showClear={clearable && singleValue !== null && !disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onBlur={field.handleBlur}
          className="w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>{emptyText}</ComboboxEmpty>
          <ComboboxList>
            {(item: FieldOption) => (
              <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
                {renderOption ? (
                  renderOption(item)
                ) : (
                  <span className="flex flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    ) : null}
                  </span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FieldFrame>
  );
}

export type RadioGroupFieldProps = Omit<BaseFieldProps, "orientation"> & {
  options: ReadonlyArray<FieldOption>;
  variant?: "default" | "card";
  layout?: "vertical" | "horizontal";
};

export function RadioGroupField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  showError,
  className,
  id,
  options,
  variant = "default",
  layout = "vertical",
}: RadioGroupFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  return (
    <FieldSetFrame
      label={label}
      description={description}
      messages={messages}
      invalid={invalid}
      hideLabel={hideLabel}
      required={required}
      disabled={disabled}
      className={className}
      ids={ids}
    >
      <RadioGroup
        name={field.name}
        value={field.state.value ?? ""}
        disabled={disabled}
        required={required}
        aria-labelledby={ids.labelId}
        onValueChange={(next) => field.handleChange(next ? String(next) : undefined)}
        className={cn(
          layout === "horizontal"
            ? "flex flex-wrap gap-3"
            : variant === "card"
              ? "grid gap-2"
              : "grid gap-2.5",
        )}
      >
        {options.map((option) => {
          const optionId = `${ids.fieldId}-${option.value}`;
          const isDisabled = disabled || option.disabled;
          const radio = (
            <RadioGroupItem
              id={optionId}
              value={option.value}
              disabled={isDisabled}
              aria-invalid={invalid}
              onBlur={field.handleBlur}
            />
          );

          if (variant === "card") {
            return (
              <FieldLabel
                key={option.value}
                htmlFor={optionId}
                className={cn(
                  "cursor-pointer",
                  layout === "horizontal" ? "w-auto min-w-44 flex-1" : "w-full",
                )}
              >
                <Field
                  orientation="horizontal"
                  data-invalid={invalid || undefined}
                  data-disabled={isDisabled || undefined}
                >
                  {radio}
                  <FieldContent>
                    <FieldTitle>{option.label}</FieldTitle>
                    {option.description ? (
                      <FieldDescription>{option.description}</FieldDescription>
                    ) : null}
                  </FieldContent>
                </Field>
              </FieldLabel>
            );
          }

          return (
            <Field
              key={option.value}
              orientation="horizontal"
              data-invalid={invalid || undefined}
              data-disabled={isDisabled || undefined}
              className={cn(layout === "horizontal" && "w-auto")}
            >
              {radio}
              <FieldContent>
                <FieldLabel htmlFor={optionId} className="cursor-pointer font-normal normal-case">
                  {option.label}
                </FieldLabel>
                {option.description ? (
                  <FieldDescription>{option.description}</FieldDescription>
                ) : null}
              </FieldContent>
            </Field>
          );
        })}
      </RadioGroup>
    </FieldSetFrame>
  );
}

export type ToggleGroupFieldProps = Omit<BaseFieldProps, "orientation"> & {
  options: ReadonlyArray<FieldOption>;
  multiple?: boolean;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  spacing?: number;
};

export function ToggleGroupField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  showError,
  className,
  id,
  options,
  multiple = false,
  variant = "outline",
  size = "default",
  spacing = 2,
}: ToggleGroupFieldProps) {
  const field = useFieldContext<string | string[] | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const groupValue = multiple
    ? Array.isArray(field.state.value)
      ? field.state.value
      : []
    : typeof field.state.value === "string" && field.state.value
      ? [field.state.value]
      : [];

  return (
    <FieldSetFrame
      label={label}
      description={description}
      messages={messages}
      invalid={invalid}
      hideLabel={hideLabel}
      required={required}
      disabled={disabled}
      className={className}
      ids={ids}
    >
      <ToggleGroup
        multiple={multiple}
        variant={variant}
        size={size}
        spacing={spacing}
        disabled={disabled}
        value={groupValue}
        aria-labelledby={ids.labelId}
        className="flex-wrap"
        onValueChange={(next) => {
          const values = next.map(String);
          if (multiple) {
            field.handleChange(values);
          } else {
            field.handleChange(values[0] ?? undefined);
          }
          field.handleBlur();
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            disabled={disabled || option.disabled}
            aria-invalid={invalid}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSetFrame>
  );
}
