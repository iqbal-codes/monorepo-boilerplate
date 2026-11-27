"use client";

import * as React from "react";
import { cn } from "cn";
import { XIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";

export type TagInputProps = {
  id?: string;
  name?: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (tags: string[]) => void;
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
 * Controlled multi-tag input supporting suggestion filtering, keyboard
 * navigation, delimiter paste-splitting, deduplication, `maxTags`, and
 * Backspace removal.
 */
export function TagInput({
  id,
  name,
  value: controlledValue,
  defaultValue = [],
  onValueChange,
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
  const tags = controlledValue !== undefined ? controlledValue : uncontrolledValue;

  const [inputValue, setInputValue] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();

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

  const removeAt = React.useCallback(
    (index: number) => {
      if (!interactive) return;
      const next = tags.filter((_, i) => i !== index);
      commitTags(next);
    },
    [commitTags, interactive, tags],
  );

  const filteredSuggestions = React.useMemo(() => {
    if (atMax || suggestions.length === 0) return [];
    const query = inputValue.trim().toLowerCase();
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
  }, [allowDuplicates, atMax, inputValue, suggestions, tags]);

  const showSuggestions = interactive && isFocused && menuOpen && filteredSuggestions.length > 0;

  React.useEffect(() => {
    if (!showSuggestions) {
      setActiveIndex(-1);
    } else if (activeIndex >= filteredSuggestions.length) {
      setActiveIndex(filteredSuggestions.length - 1);
    }
  }, [activeIndex, filteredSuggestions.length, showSuggestions]);

  function handleSelectSuggestion(suggestion: string) {
    addTokens([suggestion]);
    setInputValue("");
    setActiveIndex(-1);
    setMenuOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div data-slot="tag-input" className={cn("relative flex flex-col gap-1", className)}>
      <div
        data-slot="tag-input-control"
        data-disabled={disabled || undefined}
        data-max-reached={atMax || undefined}
        aria-invalid={ariaInvalid || undefined}
        onClick={() => {
          if (interactive) inputRef.current?.focus();
        }}
        className={cn(
          "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-none border border-transparent border-b-input bg-transparent py-1.5 text-sm transition-[color,border-color]",
          "focus-within:border-b-ring aria-invalid:border-b-destructive",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {tags.map((tag, index) => (
          <Badge
            key={`${tag}-${index}`}
            variant="secondary"
            data-slot="tag-input-pill"
            className="h-6 gap-1 border border-border bg-muted px-2 text-xs font-medium tracking-normal text-foreground normal-case"
          >
            <span>{tag}</span>
            {interactive ? (
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeAt(index);
                  inputRef.current?.focus();
                }}
                className="inline-flex size-4 items-center justify-center rounded-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            ) : null}
          </Badge>
        ))}

        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-activedescendant={
            showSuggestions && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
          }
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-labelledby={ariaLabelledBy}
          value={inputValue}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={tags.length === 0 ? placeholder : atMax ? "Max tags reached" : ""}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          onFocus={() => {
            setIsFocused(true);
            if (filteredSuggestions.length > 0) {
              setMenuOpen(true);
            }
          }}
          onBlur={() => {
            setIsFocused(false);
            setMenuOpen(false);
            setActiveIndex(-1);
            onBlur?.();
          }}
          onChange={(event) => {
            const next = event.target.value;
            if (delimiters.some((d) => next.includes(d))) {
              addTokens(splitByDelimiters(next));
              setInputValue("");
              setMenuOpen(false);
              return;
            }
            setInputValue(next);
            setMenuOpen(true);
            setActiveIndex(-1);
          }}
          onPaste={(event) => {
            if (!interactive) return;
            const text = event.clipboardData?.getData("text");
            if (!text) return;
            const hasDelimiter = delimiters.some((d) => text.includes(d)) || /[\r\n]/.test(text);
            if (!hasDelimiter) return;
            event.preventDefault();
            addTokens(splitByDelimiters(text));
            setInputValue("");
            setMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (!interactive) return;

            if (event.key === "ArrowDown") {
              if (filteredSuggestions.length > 0) {
                event.preventDefault();
                setMenuOpen(true);
                setActiveIndex((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
              }
              return;
            }

            if (event.key === "ArrowUp") {
              if (showSuggestions && filteredSuggestions.length > 0) {
                event.preventDefault();
                setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
              }
              return;
            }

            if (event.key === "Escape") {
              if (menuOpen) {
                event.preventDefault();
                setMenuOpen(false);
                setActiveIndex(-1);
              }
              return;
            }

            if (event.key === "Enter") {
              if (event.nativeEvent.isComposing || event.keyCode === 229) {
                return;
              }
              if (showSuggestions && activeIndex >= 0 && filteredSuggestions[activeIndex]) {
                event.preventDefault();
                handleSelectSuggestion(filteredSuggestions[activeIndex]!);
                return;
              }
              if (inputValue.trim().length > 0) {
                event.preventDefault();
                addTokens(splitByDelimiters(inputValue));
                setInputValue("");
                setMenuOpen(false);
              }
              return;
            }

            if (delimiters.includes(event.key)) {
              event.preventDefault();
              if (inputValue.trim().length > 0) {
                addTokens(splitByDelimiters(inputValue));
                setInputValue("");
                setMenuOpen(false);
              }
              return;
            }

            if (event.key === "Backspace" && inputValue === "" && tags.length > 0) {
              event.preventDefault();
              removeAt(tags.length - 1);
            }
          }}
        />
      </div>

      {showSuggestions ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Tag suggestions"
          data-slot="tag-input-suggestions"
          className="absolute top-full right-0 left-0 z-50 mt-1 flex max-h-48 flex-col overflow-y-auto border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filteredSuggestions.map((suggestion, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={suggestion}
                id={`${listboxId}-opt-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={active}
                data-active={active || undefined}
                onMouseDown={(event) => {
                  // Prevent input blur before click finishes.
                  event.preventDefault();
                }}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={cn(
                  "w-full cursor-pointer px-2.5 py-1.5 text-start text-sm select-none",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60 hover:text-accent-foreground",
                )}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
