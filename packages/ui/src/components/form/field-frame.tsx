import * as React from "react";
import { useStore } from "@tanstack/react-form";
import { cn } from "cn";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@monorepo-boilerplate/ui/components/field";

import { extractErrorMessages, shouldShowFieldError, type ShowErrorMode } from "./error-utils";
import { useFieldContext } from "./form-context";
import type { FieldOrientation } from "./types";

export type FieldIds = {
  fieldId: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
};

export function useFieldIds(name: string, id?: string): FieldIds {
  const generated = React.useId();
  const fieldId = id ?? `${name.replace(/[^a-zA-Z0-9_-]/g, "-")}-${generated}`;
  return {
    fieldId,
    labelId: `${fieldId}-label`,
    descriptionId: `${fieldId}-description`,
    errorId: `${fieldId}-error`,
  };
}

export function useFieldFeedback(showError: ShowErrorMode = "auto") {
  const field = useFieldContext<unknown>();
  const submissionAttempts = useStore(field.form.store, (state) => state.submissionAttempts);
  const rawErrors = field.state.meta.errors as ReadonlyArray<unknown>;
  const messages = extractErrorMessages(rawErrors);
  const invalid = shouldShowFieldError({
    errors: rawErrors,
    isTouched: Boolean(field.state.meta.isTouched),
    submissionAttempts,
    showError,
  });

  return {
    messages: invalid ? messages : [],
    invalid,
  };
}

export function buildDescribedBy({
  hasDescription,
  invalid,
  ids,
}: {
  hasDescription: boolean;
  invalid: boolean;
  ids: FieldIds;
}): string | undefined {
  const parts: string[] = [];
  if (hasDescription) parts.push(ids.descriptionId);
  if (invalid) parts.push(ids.errorId);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function FieldErrorMessages({
  id,
  messages,
}: {
  id: string;
  messages: ReadonlyArray<string>;
}) {
  if (messages.length === 0) return null;
  if (messages.length === 1) {
    return <FieldError id={id}>{messages[0]}</FieldError>;
  }
  return <FieldError id={id} errors={messages.map((message) => ({ message }))} />;
}

export function FieldFrame({
  label,
  description,
  messages,
  invalid,
  hideLabel,
  required,
  disabled,
  orientation = "vertical",
  className,
  ids,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  messages: ReadonlyArray<string>;
  invalid: boolean;
  hideLabel?: boolean;
  required?: boolean;
  disabled?: boolean;
  orientation?: FieldOrientation;
  className?: string;
  ids: FieldIds;
  /** Pass `null` when the control is not a native labelable element (use `aria-labelledby`). */
  htmlFor?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Field
      orientation={orientation}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn("gap-1.5", className)}
    >
      <FieldLabel
        id={ids.labelId}
        htmlFor={htmlFor === null ? undefined : (htmlFor ?? ids.fieldId)}
        className={cn(hideLabel && "sr-only")}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </FieldLabel>
      {children}
      {description ? (
        <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldErrorMessages id={ids.errorId} messages={messages} />
    </Field>
  );
}

export function FieldSetFrame({
  label,
  description,
  messages,
  invalid,
  hideLabel,
  required,
  disabled,
  className,
  ids,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  messages: ReadonlyArray<string>;
  invalid: boolean;
  hideLabel?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ids: FieldIds;
  children: React.ReactNode;
}) {
  return (
    <FieldSet
      disabled={disabled}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      aria-describedby={buildDescribedBy({
        hasDescription: Boolean(description),
        invalid,
        ids,
      })}
      className={cn("gap-2", className)}
    >
      <FieldLegend
        id={ids.labelId}
        variant="label"
        className={cn("mb-1.5", hideLabel && "sr-only", invalid && "text-destructive")}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-1 text-destructive">
            *
          </span>
        ) : null}
      </FieldLegend>
      {description ? (
        <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
      ) : null}
      {children}
      <FieldErrorMessages id={ids.errorId} messages={messages} />
    </FieldSet>
  );
}
