import { buildDescribedBy, FieldFrame, useFieldFeedback, useFieldIds } from "../form/field-frame";
import { useFieldContext } from "../form/form-context";
import { RichTextEditor } from "./rich-text-editor";
import type { JSONContent, RichTextFieldProps } from "./types";

/**
 * TanStack Form-bound Rich Text Field Block wrapping `RichTextEditor` with
 * standardized label, description, and validation feedback.
 *
 * Exported exclusively from `@monorepo-boilerplate/ui/components/rich-text` so
 * `@monorepo-boilerplate/ui/components/form` never pulls `@tiptap/*` into forms
 * that do not use rich text.
 */
export function RichTextField({
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
  readOnly,
  toolbar,
  bubbleMenu,
  slashCommands,
  editorClassName,
}: RichTextFieldProps) {
  const field = useFieldContext<JSONContent | undefined>();
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
      htmlFor={null}
    >
      <RichTextEditor
        id={ids.fieldId}
        value={field.state.value ?? null}
        onChange={(next) => field.handleChange(next)}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        toolbar={toolbar}
        bubbleMenu={bubbleMenu}
        slashCommands={slashCommands}
        editorClassName={editorClassName}
        aria-labelledby={ids.labelId}
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
