import type * as React from "react";
import type { ShowErrorMode } from "./error-utils";

export type FieldOrientation = "vertical" | "horizontal" | "responsive";

export type FieldOption = {
  value: string;
  label: React.ReactNode;
  /** Plain-text label for search filtering when `label` is rich JSX. */
  searchText?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  group?: string;
};

export type BaseFieldProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Renders the label for screen readers only. */
  hideLabel?: boolean;
  required?: boolean;
  disabled?: boolean;
  orientation?: FieldOrientation;
  /** Controls when validation errors become visible. Defaults to `"auto"` (touched or submitted). */
  showError?: ShowErrorMode;
  className?: string;
  id?: string;
};

export type DateRangeValue = {
  from?: string;
  to?: string;
};

/**
 * Extracts a searchable plain-text label from a `FieldOption`.
 */
export function optionLabelText(option: FieldOption): string {
  if (option.searchText) return option.searchText;
  if (typeof option.label === "string" || typeof option.label === "number") {
    return String(option.label);
  }
  return option.value;
}
