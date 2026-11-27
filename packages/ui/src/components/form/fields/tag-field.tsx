import { TagInput, type TagInputProps } from "@monorepo-boilerplate/ui/components/tag-input";

import { buildDescribedBy, FieldFrame, useFieldFeedback, useFieldIds } from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps } from "../types";

export type TagFieldProps = BaseFieldProps &
  Pick<TagInputProps, "suggestions" | "placeholder" | "maxTags" | "delimiters" | "allowDuplicates">;

/**
 * TanStack Form-bound multi-tag Field Block wrapping `TagInput` with
 * standardized label, description, and validation feedback.
 */
export function TagField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  suggestions,
  placeholder,
  maxTags,
  delimiters,
  allowDuplicates,
}: TagFieldProps) {
  const field = useFieldContext<string[] | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

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
      <TagInput
        id={ids.fieldId}
        name={field.name}
        value={Array.isArray(field.state.value) ? field.state.value : []}
        onValueChange={(next) => field.handleChange(next)}
        onBlur={field.handleBlur}
        suggestions={suggestions}
        placeholder={placeholder}
        maxTags={maxTags}
        disabled={disabled}
        delimiters={delimiters}
        allowDuplicates={allowDuplicates}
        aria-invalid={invalid}
        aria-describedby={buildDescribedBy({
          hasDescription: Boolean(description),
          invalid,
          ids,
        })}
      />
    </FieldFrame>
  );
}
