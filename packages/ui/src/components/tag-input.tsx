"use client";

import * as React from "react";
import { cn } from "cn";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@monorepo-boilerplate/ui/components/combobox";

export type TagInputProps = {
  id?: string;
  name?: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (tags: string[]) => void;
  inputValue?: string;
  onInputValueChange?: (value: string) => void;
  onBlur?: () => void;
  suggestions?: readonly string[];
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  readOnly?: boolean;
  delimiters?: readonly string[];
  allowDuplicates?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
};

const DEFAULT_DELIMITERS = [",", ";"] as const;

function hasTag(tags: readonly string[], candidate: string, allowDuplicates: boolean): boolean {
  if (allowDuplicates) return false;
  const target = candidate.toLowerCase();
  return tags.some((tag) => tag.toLowerCase() === target);
}

/**
 * Controlled multi-tag input built on Base UI `Combobox` supporting suggestion
 * filtering, scroll-safe keyboard navigation, delimiter paste-splitting,
 * deduplication, `maxTags`, and Backspace removal.
 */
export function TagInput({
  id,
  name,
  value: controlledValue,
  defaultValue = [],
  onValueChange,
  inputValue: controlledInputValue,
  onInputValueChange,
  onBlur,
  suggestions = [],
  placeholder = "Add tag…",
  maxTags,
  disabled = false,
  readOnly = false,
  delimiters = DEFAULT_DELIMITERS,
  allowDuplicates = false,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-labelledby": ariaLabelledBy,
}: TagInputProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string[]>(() => [
    ...defaultValue,
  ]);
  const [uncontrolledInputValue, setUncontrolledInputValue] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const highlightedItemRef = React.useRef<string | undefined>(undefined);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const anchor = useComboboxAnchor();

  const tags = controlledValue !== undefined ? controlledValue : uncontrolledValue;
  const draftValue =
    controlledInputValue !== undefined ? controlledInputValue : uncontrolledInputValue;

  const atMax = maxTags !== undefined && tags.length >= maxTags;
  const interactive = !disabled && !readOnly;

  const commitTags = React.useCallback(
    (nextTags: string[]) => {
      if (controlledValue === undefined) {
        setUncontrolledValue(nextTags);
      }
      onValueChange?.(nextTags);
    },
    [controlledValue, onValueChange],
  );

  const commitInputValue = React.useCallback(
    (nextInput: string) => {
      if (controlledInputValue === undefined) {
        setUncontrolledInputValue(nextInput);
      }
      onInputValueChange?.(nextInput);
    },
    [controlledInputValue, onInputValueChange],
  );

  const addTokens = React.useCallback(
    (rawTokens: readonly string[]) => {
      if (!interactive) return;
      const next = [...tags];
      let changed = false;

      for (const raw of rawTokens) {
        if (maxTags !== undefined && next.length >= maxTags) break;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (hasTag(next, trimmed, allowDuplicates)) continue;
        next.push(trimmed);
        changed = true;
      }

      if (changed) {
        commitTags(next);
      }
    },
    [allowDuplicates, commitTags, interactive, maxTags, tags],
  );

  const splitByDelimiters = React.useCallback(
    (raw: string): string[] => {
      const escaped = delimiters.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const pattern = new RegExp(`[${escaped.join("")}\\r\\n]+`);
      return raw.split(pattern);
    },
    [delimiters],
  );

  const filteredSuggestions = React.useMemo(() => {
    if (atMax || suggestions.length === 0) return [];
    const query = draftValue.trim().toLowerCase();
    const seen = new Set<string>();
    const results: string[] = [];

    for (const suggestion of suggestions) {
      const trimmed = suggestion.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      if (!allowDuplicates && hasTag(tags, trimmed, false)) continue;
      if (query && !lower.includes(query)) continue;
      results.push(trimmed);
    }

    return results;
  }, [allowDuplicates, atMax, draftValue, suggestions, tags]);

  const showSuggestions = interactive && menuOpen && filteredSuggestions.length > 0;

  return (
    <div data-slot="tag-input" className={cn("relative flex flex-col gap-1", className)}>
      <Combobox
        multiple
        filter={null}
        name={name}
        items={filteredSuggestions}
        value={tags as string[]}
        inputValue={draftValue}
        open={showSuggestions}
        disabled={disabled}
        readOnly={readOnly}
        onOpenChange={(nextOpen) => {
          if (!interactive || filteredSuggestions.length === 0) {
            setMenuOpen(false);
            return;
          }
          setMenuOpen(nextOpen);
        }}
        onItemHighlighted={(item) => {
          highlightedItemRef.current = item;
        }}
        onInputValueChange={(nextInput, details) => {
          if (!interactive) return;
          if (details.reason === "escape-key") {
            return;
          }
          if (details.reason === "input-change" && delimiters.some((d) => nextInput.includes(d))) {
            addTokens(splitByDelimiters(nextInput));
            commitInputValue("");
            setMenuOpen(false);
            return;
          }
          commitInputValue(nextInput);
          if (details.reason === "input-change") {
            setMenuOpen(true);
          }
        }}
        onValueChange={(nextValues, details) => {
          if (!interactive) return;
          if (details.reason === "escape-key") {
            return;
          }
          const list = Array.isArray(nextValues) ? nextValues : [];
          const normalized: string[] = [];
          for (const raw of list) {
            if (maxTags !== undefined && normalized.length >= maxTags) break;
            const trimmed = raw.trim();
            if (!trimmed) continue;
            if (hasTag(normalized, trimmed, allowDuplicates)) continue;
            normalized.push(trimmed);
          }
          commitTags(normalized);
          if (details.reason === "item-press") {
            commitInputValue("");
            highlightedItemRef.current = undefined;
            setMenuOpen(false);
            inputRef.current?.focus();
          }
        }}
      >
        <ComboboxChips
          ref={anchor}
          data-slot="tag-input-control"
          data-disabled={disabled || undefined}
          data-max-reached={atMax || undefined}
          aria-invalid={ariaInvalid || undefined}
          onClick={() => {
            if (interactive) inputRef.current?.focus();
          }}
          className={cn("w-full", disabled && "cursor-not-allowed opacity-50")}
        >
          <ComboboxValue>
            {(values: string[]) => (
              <>
                {values.map((tag, index) => (
                  <ComboboxChip
                    key={`${tag}-${index}`}
                    data-tag-pill=""
                    showRemove={interactive}
                    removeLabel={`Remove ${tag}`}
                  >
                    {tag}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  ref={inputRef}
                  id={id}
                  name={name}
                  placeholder={tags.length === 0 ? placeholder : atMax ? "Max tags reached" : ""}
                  disabled={disabled}
                  readOnly={readOnly}
                  aria-label={ariaLabel}
                  aria-invalid={ariaInvalid}
                  aria-describedby={ariaDescribedBy}
                  aria-labelledby={ariaLabelledBy}
                  onFocus={() => {
                    if (interactive && filteredSuggestions.length > 0) {
                      setMenuOpen(true);
                    }
                  }}
                  onBlur={() => {
                    setMenuOpen(false);
                    highlightedItemRef.current = undefined;
                    onBlur?.();
                  }}
                  onPaste={(event) => {
                    if (!interactive) return;
                    const text = event.clipboardData?.getData("text");
                    if (!text) return;
                    const hasDelimiter =
                      delimiters.some((d) => text.includes(d)) || /[\r\n]/.test(text);
                    if (!hasDelimiter) return;
                    event.preventDefault();
                    addTokens(splitByDelimiters(text));
                    commitInputValue("");
                    setMenuOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (!interactive) return;

                    if (event.key === "ArrowDown") {
                      if (filteredSuggestions.length > 0 && !showSuggestions) {
                        setMenuOpen(true);
                      }
                      return;
                    }

                    if (event.key === "Escape") {
                      if (!showSuggestions) {
                        event.preventBaseUIHandler?.();
                      } else {
                        setMenuOpen(false);
                        highlightedItemRef.current = undefined;
                      }
                      return;
                    }

                    if (event.key === "Enter") {
                      if (event.nativeEvent.isComposing || event.keyCode === 229) {
                        event.preventBaseUIHandler?.();
                        return;
                      }
                      if (showSuggestions && highlightedItemRef.current !== undefined) {
                        return;
                      }
                      if (draftValue.trim().length > 0) {
                        event.preventDefault();
                        event.preventBaseUIHandler?.();
                        addTokens(splitByDelimiters(draftValue));
                        commitInputValue("");
                        setMenuOpen(false);
                      }
                      return;
                    }

                    if (delimiters.includes(event.key)) {
                      event.preventDefault();
                      if (draftValue.trim().length > 0) {
                        addTokens(splitByDelimiters(draftValue));
                        commitInputValue("");
                        setMenuOpen(false);
                      }
                    }
                  }}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>

        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            {(suggestion: string) => (
              <ComboboxItem key={suggestion} value={suggestion}>
                {suggestion}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
