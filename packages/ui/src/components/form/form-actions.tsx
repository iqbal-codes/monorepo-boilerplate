import * as React from "react";
import { useStore } from "@tanstack/react-form";
import { cn } from "cn";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@monorepo-boilerplate/ui/components/alert";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

import { extractErrorMessages } from "./error-utils";
import { useFormContext } from "./form-context";

type FormLike = {
  handleSubmit: () => Promise<void> | void;
  AppForm: React.ComponentType<React.PropsWithChildren>;
};

export type FormProps = Omit<React.ComponentProps<"form">, "onSubmit"> & {
  form: FormLike;
  /** Move focus to the first invalid control (or FormError) after a failed submit. Defaults to `true`. */
  focusFirstError?: boolean;
};

/**
 * Form root Block. Handles `preventDefault`, `stopPropagation`, `noValidate`,
 * mounts `form.AppForm`, and moves focus to the first invalid control on failed
 * submission.
 */
export function Form({
  form,
  focusFirstError = true,
  className,
  children,
  noValidate = true,
  ...props
}: FormProps) {
  const formRef = React.useRef<HTMLFormElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    await form.handleSubmit();

    if (focusFirstError && formRef.current) {
      // Wait a microtask so React commits aria-invalid attributes after validation.
      queueMicrotask(() => {
        const root = formRef.current;
        if (!root) return;
        const firstInvalid = root.querySelector<HTMLElement>(
          '[aria-invalid="true"]:not([disabled]), [data-slot="form-error"]',
        );
        firstInvalid?.focus();
      });
    }
  }

  return (
    <form.AppForm>
      <form
        ref={formRef}
        noValidate={noValidate}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className={cn("flex flex-col gap-6", className)}
        {...props}
      >
        {children}
      </form>
    </form.AppForm>
  );
}

export type SubmitButtonProps = Omit<React.ComponentProps<typeof Button>, "type"> & {
  /** Label shown while the form is submitting. Defaults to `children`. */
  loadingLabel?: React.ReactNode;
};

/**
 * Submit button Block bound to `formContext`. Disables itself and shows a
 * spinner only while `isSubmitting` so users can always click Submit to reveal
 * validation errors.
 */
export function SubmitButton({ children, loadingLabel, disabled, ...props }: SubmitButtonProps) {
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  return (
    <Button type="submit" disabled={disabled || isSubmitting} {...props}>
      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
      {isSubmitting && loadingLabel ? loadingLabel : children}
    </Button>
  );
}

export type ResetButtonProps = Omit<React.ComponentProps<typeof Button>, "type"> & {
  onReset?: () => void;
};

/**
 * Reset button Block bound to `formContext`. Resets form state and disables
 * itself while pristine or submitting.
 */
export function ResetButton({
  children = "Reset",
  disabled,
  variant = "outline",
  onClick,
  onReset,
  ...props
}: ResetButtonProps) {
  const form = useFormContext();
  const [isSubmitting, isPristine] = useStore(
    form.store,
    (state) => [state.isSubmitting, state.isPristine] as const,
  );

  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled || isSubmitting || isPristine}
      onClick={(event) => {
        form.reset();
        onReset?.();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

export type FormErrorProps = {
  /** Optional external/server error (string, Error, or `{ message }` such as a tRPC client error). */
  error?: string | { message?: string } | null;
  title?: React.ReactNode;
  className?: string;
};

/**
 * Form-level error banner Block. Displays both TanStack Form's form-level
 * errors and any explicit server/mutation error passed via `error`.
 */
export function FormError({ error, title = "Unable to submit", className }: FormErrorProps) {
  const form = useFormContext();
  const [formErrors, submitError] = useStore(
    form.store,
    (state) =>
      [state.errors as ReadonlyArray<unknown>, state.errorMap.onSubmit as unknown] as const,
  );

  const external =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && typeof error.message === "string"
        ? error.message
        : undefined;
  const messages = extractErrorMessages([external, submitError, ...formErrors]);

  if (messages.length === 0) return null;

  return (
    <Alert
      variant="destructive"
      data-slot="form-error"
      tabIndex={-1}
      className={cn("focus-visible:outline-2 focus-visible:outline-ring", className)}
    >
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {messages.length === 1 ? (
          messages[0]
        ) : (
          <ul className="ms-4 flex list-disc flex-col gap-1">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
