import { cn } from "cn";

import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { Switch } from "@monorepo-boilerplate/ui/components/switch";

import {
  buildDescribedBy,
  FieldErrorMessages,
  FieldSetFrame,
  useFieldFeedback,
  useFieldIds,
} from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps, FieldOption } from "../types";

export type CheckboxFieldProps = Omit<BaseFieldProps, "orientation"> & {
  /** Renders inside a selectable card border matching FieldLabel card styles. */
  variant?: "default" | "card";
};

export function CheckboxField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  showError,
  className,
  id,
  variant = "default",
}: CheckboxFieldProps) {
  const field = useFieldContext<boolean | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const checked = Boolean(field.state.value);

  const control = (
    <Checkbox
      id={ids.fieldId}
      name={field.name}
      checked={checked}
      disabled={disabled}
      required={required}
      aria-invalid={invalid}
      aria-describedby={buildDescribedBy({
        hasDescription: Boolean(description),
        invalid,
        ids,
      })}
      onCheckedChange={(next) => field.handleChange(Boolean(next))}
      onBlur={field.handleBlur}
    />
  );

  if (variant === "card") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <FieldLabel htmlFor={ids.fieldId} className="w-full cursor-pointer">
          <Field
            orientation="horizontal"
            data-invalid={invalid || undefined}
            data-disabled={disabled || undefined}
          >
            {control}
            <FieldContent>
              <FieldTitle className={cn(hideLabel && "sr-only")}>
                {label}
                {required ? (
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                ) : null}
              </FieldTitle>
              {description ? (
                <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
              ) : null}
            </FieldContent>
          </Field>
        </FieldLabel>
        <FieldErrorMessages id={ids.errorId} messages={messages} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Field
        orientation="horizontal"
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
      >
        {control}
        <FieldContent>
          <FieldLabel
            htmlFor={ids.fieldId}
            className={cn("cursor-pointer font-normal normal-case", hideLabel && "sr-only")}
          >
            {label}
            {required ? (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            ) : null}
          </FieldLabel>
          {description ? (
            <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
          ) : null}
        </FieldContent>
      </Field>
      <FieldErrorMessages id={ids.errorId} messages={messages} />
    </div>
  );
}

export type CheckboxGroupFieldProps = Omit<BaseFieldProps, "orientation"> & {
  options: ReadonlyArray<FieldOption>;
  variant?: "default" | "card";
  layout?: "vertical" | "horizontal";
};

export function CheckboxGroupField({
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
}: CheckboxGroupFieldProps) {
  const field = useFieldContext<string[] | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const selected = field.state.value ?? [];

  function toggleValue(optionValue: string, checked: boolean) {
    const next = checked
      ? selected.includes(optionValue)
        ? selected
        : [...selected, optionValue]
      : selected.filter((item) => item !== optionValue);
    field.handleChange(next);
  }

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
      <FieldGroup
        data-slot="checkbox-group"
        className={cn(
          layout === "horizontal"
            ? "flex-row flex-wrap gap-3"
            : variant === "card"
              ? "gap-2"
              : "gap-2.5",
        )}
      >
        {options.map((option) => {
          const optionId = `${ids.fieldId}-${option.value}`;
          const isChecked = selected.includes(option.value);
          const isDisabled = disabled || option.disabled;

          const checkbox = (
            <Checkbox
              id={optionId}
              checked={isChecked}
              disabled={isDisabled}
              aria-invalid={invalid}
              onCheckedChange={(next) => toggleValue(option.value, Boolean(next))}
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
                  {checkbox}
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
              {checkbox}
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
      </FieldGroup>
    </FieldSetFrame>
  );
}

export type SwitchFieldProps = Omit<BaseFieldProps, "orientation"> & {
  size?: "sm" | "default";
  variant?: "default" | "card";
};

export function SwitchField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  showError,
  className,
  id,
  size = "default",
  variant = "default",
}: SwitchFieldProps) {
  const field = useFieldContext<boolean | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const checked = Boolean(field.state.value);

  const control = (
    <Switch
      id={ids.fieldId}
      name={field.name}
      size={size}
      checked={checked}
      disabled={disabled}
      required={required}
      aria-invalid={invalid}
      aria-describedby={buildDescribedBy({
        hasDescription: Boolean(description),
        invalid,
        ids,
      })}
      onCheckedChange={(next) => field.handleChange(Boolean(next))}
      onBlur={field.handleBlur}
    />
  );

  if (variant === "card") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <FieldLabel htmlFor={ids.fieldId} className="w-full cursor-pointer">
          <Field
            orientation="horizontal"
            data-invalid={invalid || undefined}
            data-disabled={disabled || undefined}
          >
            <FieldContent>
              <FieldTitle className={cn(hideLabel && "sr-only")}>
                {label}
                {required ? (
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                ) : null}
              </FieldTitle>
              {description ? (
                <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
              ) : null}
            </FieldContent>
            {control}
          </Field>
        </FieldLabel>
        <FieldErrorMessages id={ids.errorId} messages={messages} />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Field
        orientation="horizontal"
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
      >
        <FieldContent>
          <FieldLabel
            htmlFor={ids.fieldId}
            className={cn("cursor-pointer", hideLabel && "sr-only")}
          >
            {label}
            {required ? (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            ) : null}
          </FieldLabel>
          {description ? (
            <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
          ) : null}
        </FieldContent>
        {control}
      </Field>
      <FieldErrorMessages id={ids.errorId} messages={messages} />
    </div>
  );
}
