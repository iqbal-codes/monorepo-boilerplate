import * as React from "react";
import { cn } from "cn";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@monorepo-boilerplate/ui/components/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import { ScrollArea } from "@monorepo-boilerplate/ui/components/scroll-area";
import {
  buildPhoneE164,
  getPhoneCountries,
  parsePhoneParts,
  type CountryCode,
} from "@monorepo-boilerplate/ui/lib/phone";

import { buildDescribedBy, FieldFrame, useFieldFeedback, useFieldIds } from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps } from "../types";

export type PhoneFieldProps = BaseFieldProps & {
  /** Default ISO-3166 alpha-2 country code when the value is empty. Defaults to `"US"`. */
  defaultCountry?: CountryCode;
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
};

/**
 * Country-code Phone Field Block. Renders a searchable country calling-code
 * selector paired with a phone input via `InputGroup`, and reads/writes a
 * single E.164 string (or `""` when cleared).
 */
export function PhoneField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  defaultCountry = "US",
  placeholder = "812 3456 7890",
  autoComplete = "tel",
  readOnly,
}: PhoneFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);

  const countries = React.useMemo(() => getPhoneCountries(), []);
  const parsed = React.useMemo(
    () => parsePhoneParts(field.state.value, defaultCountry),
    [field.state.value, defaultCountry],
  );

  const [selectedCountry, setSelectedCountry] = React.useState<CountryCode>(parsed.country);
  const [nationalDraft, setNationalDraft] = React.useState<string>(parsed.nationalInput);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const lastEmittedRef = React.useRef<string | undefined>(field.state.value);

  // Sync external updates (e.g. form.reset or async record load).
  React.useEffect(() => {
    if (field.state.value !== lastEmittedRef.current) {
      lastEmittedRef.current = field.state.value;
      setSelectedCountry(parsed.country);
      setNationalDraft(parsed.nationalInput);
    }
  }, [field.state.value, parsed.country, parsed.nationalInput]);

  const activeCountry =
    countries.find((item) => item.code === selectedCountry) ??
    countries.find((item) => item.code === defaultCountry) ??
    countries[0];

  const filteredCountries = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        `+${item.dialCode}`.includes(q) ||
        item.dialCode.includes(q),
    );
  }, [countries, query]);

  function commitValue(country: CountryCode, rawNational: string) {
    const next = buildPhoneE164(country, rawNational);
    lastEmittedRef.current = next;
    field.handleChange(next);
  }

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
        <InputGroupAddon align="inline-start" className="pe-1">
          <Popover
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) setQuery("");
            }}
          >
            <PopoverTrigger
              render={
                <InputGroupButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || readOnly}
                  aria-label={`Country code: ${activeCountry?.name ?? selectedCountry} (+${activeCountry?.dialCode ?? ""})`}
                  className="h-8 gap-1 px-1.5 font-normal text-foreground"
                />
              }
            >
              <span aria-hidden="true">{activeCountry?.flag}</span>
              <span className="text-xs tabular-nums">+{activeCountry?.dialCode}</span>
              <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 gap-2 p-2">
              <div className="flex items-center gap-2 border-b border-border px-2 pb-2 transition-colors focus-within:border-b-ring">
                <SearchIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search country or dial code…"
                  aria-label="Search country or dial code"
                  className="h-7 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
                  autoFocus
                />
              </div>
              <ScrollArea className="h-60 overscroll-contain">
                <div role="listbox" aria-label="Countries" className="flex flex-col gap-0.5 pe-2">
                  {filteredCountries.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No matching country
                    </p>
                  ) : (
                    filteredCountries.map((country) => {
                      const isSelected = country.code === selectedCountry;
                      return (
                        <button
                          key={country.code}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setSelectedCountry(country.code);
                            commitValue(country.code, nationalDraft);
                            setOpen(false);
                            setQuery("");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-2 py-1.5 text-start text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none",
                            isSelected && "bg-muted font-medium",
                          )}
                        >
                          <span aria-hidden="true">{country.flag}</span>
                          <span className="flex-1 truncate">{country.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            +{country.dialCode}
                          </span>
                          <CheckIcon
                            aria-hidden="true"
                            className={cn(
                              "size-3.5 shrink-0",
                              isSelected ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </InputGroupAddon>

        <InputGroupInput
          id={ids.fieldId}
          name={field.name}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          value={nationalDraft}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={invalid}
          aria-describedby={buildDescribedBy({
            hasDescription: Boolean(description),
            invalid,
            ids,
          })}
          onBlur={field.handleBlur}
          onChange={(event) => {
            const raw = event.target.value;
            setNationalDraft(raw);
            if (raw.trim().startsWith("+")) {
              const reparsed = parsePhoneParts(raw, selectedCountry);
              if (reparsed.country !== selectedCountry) {
                setSelectedCountry(reparsed.country);
              }
            }
            commitValue(selectedCountry, raw);
          }}
        />
      </InputGroup>
    </FieldFrame>
  );
}
