import { createFormHook } from "@tanstack/react-form";

import { FieldArray } from "./field-array";
import { CheckboxField, CheckboxGroupField, SwitchField } from "./fields/boolean-fields";
import {
  ComboboxField,
  RadioGroupField,
  SelectField,
  ToggleGroupField,
} from "./fields/choice-fields";
import { DateField, DateRangeField, DateTimeField } from "./fields/date-fields";
import { CurrencyField, NumberField, SliderField } from "./fields/numeric-fields";
import { PhoneField } from "./fields/phone-field";
import { OtpField, UploadField } from "./fields/special-fields";
import { PasswordField, TextareaField, TextField } from "./fields/text-fields";
import { FormError, ResetButton, SubmitButton } from "./form-actions";
import { fieldContext, formContext } from "./form-context";

/**
 * Canonical form hook for the monorepo (ADR 0008).
 *
 * Every Field Block is registered on `form.AppField` (`field.TextField`, etc.)
 * and form-level action Blocks are registered on `form.AppForm`
 * (`form.SubmitButton`, `form.ResetButton`, `form.FormError`).
 */
export const { useAppForm, withForm, withFieldGroup, useTypedAppFormContext, extendForm } =
  createFormHook({
    fieldContext,
    formContext,
    fieldComponents: {
      TextField,
      PasswordField,
      TextareaField,
      NumberField,
      CurrencyField,
      PhoneField,
      SelectField,
      ComboboxField,
      RadioGroupField,
      CheckboxField,
      CheckboxGroupField,
      SwitchField,
      ToggleGroupField,
      DateField,
      DateRangeField,
      DateTimeField,
      SliderField,
      OtpField,
      UploadField,
      FieldArray,
    },
    formComponents: {
      SubmitButton,
      ResetButton,
      FormError,
    },
  });
