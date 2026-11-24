export type ShowErrorMode = "auto" | "always" | "never";

/**
 * Extracts unique, non-empty string messages from TanStack Form's `meta.errors`
 * array (which may contain strings, Zod-style `{ message }` issues, or nested arrays).
 */
export function extractErrorMessages(errors: ReadonlyArray<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const visit = (item: unknown) => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
      return;
    }
    if (typeof item === "object" && "message" in item) {
      const message = (item as { message?: unknown }).message;
      if (typeof message === "string") {
        const trimmed = message.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          result.push(trimmed);
        }
      }
    }
  };

  for (const error of errors) visit(error);
  return result;
}

/**
 * Decides whether a Field Block should visually & programmatically expose its
 * validation errors. Defaults to `"auto"`: only after the field has been
 * touched or the form has been submitted at least once.
 */
export function shouldShowFieldError({
  errors,
  isTouched,
  submissionAttempts,
  showError = "auto",
}: {
  errors: ReadonlyArray<unknown>;
  isTouched: boolean;
  submissionAttempts: number;
  showError?: ShowErrorMode;
}): boolean {
  if (showError === "never") return false;
  const messages = extractErrorMessages(errors);
  if (messages.length === 0) return false;
  if (showError === "always") return true;
  return isTouched || submissionAttempts > 0;
}
