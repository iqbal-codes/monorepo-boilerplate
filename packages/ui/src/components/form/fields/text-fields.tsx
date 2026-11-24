import * as React from "react";
import { cn } from "cn";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Input } from "@monorepo-boilerplate/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@monorepo-boilerplate/ui/components/input-group";
import { Textarea } from "@monorepo-boilerplate/ui/components/textarea";

import { buildDescribedBy, FieldFrame, useFieldFeedback, useFieldIds } from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps } from "../types";

const IDENTIFIER_TYPES = new Set(["email", "url", "search"]);

export type TextFieldProps = BaseFieldProps & {
  type?: "text" | "email" | "url" | "tel" | "search";
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  spellCheck?: boolean;
  autoCorrect?: string;
  autoCapitalize?: string;
  /** Leading text or icon rendered inside an InputGroup. */
  startAddon?: React.ReactNode;
  /** Trailing text or icon rendered inside an InputGroup. */
  endAddon?: React.ReactNode;
  inputClassName?: string;
};

export function TextField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  type = "text",
  placeholder,
  autoComplete,
  readOnly,
  maxLength,
  inputMode,
  enterKeyHint,
  spellCheck,
  autoCorrect,
  autoCapitalize,
  startAddon,
  endAddon,
  inputClassName,
}: TextFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const value = field.state.value ?? "";
  const isIdentifier = IDENTIFIER_TYPES.has(type);
  const hasDescription = Boolean(description || maxLength);

  const sharedInputProps = {
    id: ids.fieldId,
    name: field.name,
    type,
    value,
    disabled,
    readOnly,
    required,
    placeholder,
    autoComplete,
    maxLength,
    inputMode,
    enterKeyHint,
    spellCheck: spellCheck ?? (isIdentifier ? false : undefined),
    autoCorrect: autoCorrect ?? (isIdentifier ? "off" : undefined),
    autoCapitalize: autoCapitalize ?? (isIdentifier ? "none" : undefined),
    "aria-invalid": invalid,
    "aria-describedby": buildDescribedBy({ hasDescription, invalid, ids }),
    onBlur: field.handleBlur,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      field.handleChange(event.target.value),
  };

  const renderedDescription = maxLength ? (
    <span className="flex items-center justify-between gap-2">
      <span>{description}</span>
      <span className="tabular-nums">
        {value.length}/{maxLength}
      </span>
    </span>
  ) : (
    description
  );

  const hasAddons = Boolean(startAddon || endAddon);

  return (
    <FieldFrame
      label={label}
      description={renderedDescription}
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
          <InputGroupInput {...sharedInputProps} className={inputClassName} />
          {endAddon ? (
            <InputGroupAddon align="inline-end">
              <InputGroupText>{endAddon}</InputGroupText>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
      ) : (
        <Input {...sharedInputProps} className={inputClassName} />
      )}
    </FieldFrame>
  );
}

export type PasswordFieldProps = BaseFieldProps & {
  placeholder?: string;
  autoComplete?: "current-password" | "new-password" | "off";
  enterKeyHint?: React.InputHTMLAttributes<HTMLInputElement>["enterKeyHint"];
  maxLength?: number;
  inputClassName?: string;
};

export function PasswordField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  placeholder,
  autoComplete = "current-password",
  enterKeyHint,
  maxLength,
  inputClassName,
}: PasswordFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const [visible, setVisible] = React.useState(false);
  const value = field.state.value ?? "";

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
        <InputGroupInput
          id={ids.fieldId}
          name={field.name}
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
          maxLength={maxLength}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
          aria-invalid={invalid}
          aria-describedby={buildDescribedBy({
            hasDescription: Boolean(description),
            invalid,
            ids,
          })}
          className={inputClassName}
          onBlur={field.handleBlur}
          onChange={(event) => field.handleChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            size="icon-xs"
            disabled={disabled}
            aria-pressed={visible}
            aria-label={visible ? "Hide password" : "Show password"}
            onClick={() => setVisible((prev) => !prev)}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </FieldFrame>
  );
}

export type TextareaFieldProps = BaseFieldProps & {
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
  rows?: number;
  maxLength?: number;
  /** Optional footer content inside an InputGroup (e.g. helper action). */
  footerAddon?: React.ReactNode;
  textareaClassName?: string;
};

export function TextareaField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  placeholder,
  autoComplete,
  readOnly,
  rows = 4,
  maxLength,
  footerAddon,
  textareaClassName,
}: TextareaFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const value = field.state.value ?? "";
  const hasDescription = Boolean(description || maxLength);

  const sharedTextareaProps = {
    id: ids.fieldId,
    name: field.name,
    value,
    disabled,
    readOnly,
    required,
    placeholder,
    autoComplete,
    rows,
    maxLength,
    "aria-invalid": invalid,
    "aria-describedby": buildDescribedBy({ hasDescription, invalid, ids }),
    onBlur: field.handleBlur,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      field.handleChange(event.target.value),
  };

  const renderedDescription = maxLength ? (
    <span className="flex items-center justify-between gap-2">
      <span>{description}</span>
      <span className="tabular-nums">
        {value.length}/{maxLength}
      </span>
    </span>
  ) : (
    description
  );

  return (
    <FieldFrame
      label={label}
      description={renderedDescription}
      messages={messages}
      invalid={invalid}
      hideLabel={hideLabel}
      required={required}
      disabled={disabled}
      orientation={orientation}
      className={className}
      ids={ids}
    >
      {footerAddon ? (
        <InputGroup data-disabled={disabled || undefined}>
          <InputGroupTextarea
            {...sharedTextareaProps}
            className={cn("resize-y", textareaClassName)}
          />
          <InputGroupAddon align="block-end">{footerAddon}</InputGroupAddon>
        </InputGroup>
      ) : (
        <Textarea {...sharedTextareaProps} className={cn("resize-y", textareaClassName)} />
      )}
    </FieldFrame>
  );
}
