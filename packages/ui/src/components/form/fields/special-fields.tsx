import * as React from "react";
import { cn } from "cn";

import { Field, FieldDescription } from "@monorepo-boilerplate/ui/components/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@monorepo-boilerplate/ui/components/input-otp";
import {
  UploadDropzone,
  type UploadHandler,
} from "@monorepo-boilerplate/ui/components/upload-dropzone";

import {
  buildDescribedBy,
  FieldErrorMessages,
  FieldFrame,
  useFieldFeedback,
  useFieldIds,
} from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps } from "../types";

export type OtpFieldProps = BaseFieldProps & {
  /** Number of characters in the verification code. Defaults to `6`. */
  length?: number;
  /** Optional index after which to insert an `InputOTPSeparator` (e.g. `3` for 3+3). */
  separatorAfter?: number;
  pattern?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
};

export function OtpField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  length = 6,
  separatorAfter,
  pattern,
  inputMode = "numeric",
  autoComplete = "one-time-code",
}: OtpFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const splitAt =
    separatorAfter && separatorAfter > 0 && separatorAfter < length ? separatorAfter : null;

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
      <InputOTP
        id={ids.fieldId}
        name={field.name}
        maxLength={length}
        value={field.state.value ?? ""}
        disabled={disabled}
        pattern={pattern}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={buildDescribedBy({
          hasDescription: Boolean(description),
          invalid,
          ids,
        })}
        onBlur={field.handleBlur}
        onChange={(next) => field.handleChange(next)}
      >
        {splitAt ? (
          <>
            <InputOTPGroup>
              {Array.from({ length: splitAt }, (_, index) => (
                <InputOTPSlot key={index} index={index} aria-invalid={invalid} />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {Array.from({ length: length - splitAt }, (_, offset) => {
                const index = splitAt + offset;
                return <InputOTPSlot key={index} index={index} aria-invalid={invalid} />;
              })}
            </InputOTPGroup>
          </>
        ) : (
          <InputOTPGroup>
            {Array.from({ length }, (_, index) => (
              <InputOTPSlot key={index} index={index} aria-invalid={invalid} />
            ))}
          </InputOTPGroup>
        )}
      </InputOTP>
    </FieldFrame>
  );
}

export type UploadFieldProps = Omit<BaseFieldProps, "orientation" | "hideLabel"> & {
  /** Screen-supplied Upload handler owning transport. */
  upload: UploadHandler;
  /**
   * Optional render-time URL resolver (e.g. `assetUrl`) so form state stores
   * the provider-relative Stored asset path (ADR 0004) while previews render.
   */
  resolvePreviewUrl?: (storedPath: string) => string | null;
  accept?: string;
  variant?: "file" | "image";
  maxSizeBytes?: number;
  hint?: React.ReactNode;
  onError?: (error: Error) => void;
};

/**
 * Upload Field Block. Stores a relative Stored asset path (`string | null` or
 * `""`) in TanStack Form state while resolving previews through the optional
 * `resolvePreviewUrl` callback.
 */
export function UploadField({
  label,
  description,
  required,
  disabled,
  showError,
  className,
  id,
  upload,
  resolvePreviewUrl,
  accept,
  variant = "image",
  maxSizeBytes,
  hint,
  onError,
}: UploadFieldProps) {
  const field = useFieldContext<string | null | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const rawValue = field.state.value ?? null;
  const previewValue =
    rawValue && rawValue.length > 0
      ? resolvePreviewUrl
        ? resolvePreviewUrl(rawValue) || null
        : rawValue
      : null;

  return (
    <Field
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn("gap-1.5", className)}
    >
      <UploadDropzone
        label={
          required ? (
            <span>
              {label}{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </span>
          ) : (
            label
          )
        }
        hint={hint}
        accept={accept}
        variant={variant}
        maxSizeBytes={maxSizeBytes}
        disabled={disabled}
        upload={upload}
        value={previewValue}
        onValueChange={(nextUrl) => {
          // Preserve null vs "" gracefully depending on initial field value type.
          if (nextUrl === null) {
            field.handleChange(typeof field.state.value === "string" ? "" : null);
          } else {
            field.handleChange(nextUrl);
          }
          field.handleBlur();
        }}
        onError={onError}
      />
      {description ? (
        <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldErrorMessages id={ids.errorId} messages={messages} />
    </Field>
  );
}
