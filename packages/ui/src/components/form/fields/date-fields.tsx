import * as React from "react";
import { format } from "date-fns";
import { cn } from "cn";
import { CalendarIcon, ClockIcon, XIcon } from "lucide-react";

import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Calendar } from "@monorepo-boilerplate/ui/components/calendar";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import { Label } from "@monorepo-boilerplate/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";

import {
  combineLocalDateAndTimeToUtcIso,
  getLocalTimeZone,
  parseIsoDate,
  parseIsoDateTime,
  toIsoDate,
} from "../date-utils";
import { buildDescribedBy, FieldFrame, useFieldFeedback, useFieldIds } from "../field-frame";
import { useFieldContext } from "../form-context";
import type { BaseFieldProps, DateRangeValue } from "../types";

export type DateFieldProps = BaseFieldProps & {
  placeholder?: string;
  /** date-fns format string for trigger display. Defaults to `"PPP"`. */
  displayFormat?: string;
  clearable?: boolean;
  /** Calendar disabled matcher passed straight to react-day-picker. */
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
  captionLayout?: React.ComponentProps<typeof Calendar>["captionLayout"];
  startMonth?: Date;
  endMonth?: Date;
};

/**
 * Date Field Block. Stores a timezone-free `"YYYY-MM-DD"` string (or `""` when
 * cleared) and displays a `Calendar` inside a `Popover`.
 */
export function DateField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  placeholder = "Pick a date",
  displayFormat = "PPP",
  clearable = true,
  disabledDates,
  captionLayout = "dropdown",
  startMonth,
  endMonth,
}: DateFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => parseIsoDate(field.state.value), [field.state.value]);
  const showClear = clearable && Boolean(selected) && !disabled;

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
      <div className="relative flex w-full items-center">
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) field.handleBlur();
          }}
        >
          <PopoverTrigger
            render={
              <Button
                id={ids.fieldId}
                type="button"
                variant="outline"
                disabled={disabled}
                aria-invalid={invalid}
                aria-describedby={buildDescribedBy({
                  hasDescription: Boolean(description),
                  invalid,
                  ids,
                })}
                className={cn(
                  "h-10 w-full justify-start border-transparent border-b-input px-0 font-normal tracking-normal normal-case hover:bg-transparent",
                  showClear && "pr-8",
                  !selected && "text-muted-foreground",
                  invalid && "border-b-destructive",
                )}
              />
            }
          >
            <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
            <span className="truncate">
              {selected ? format(selected, displayFormat) : placeholder}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              captionLayout={captionLayout}
              startMonth={startMonth}
              endMonth={endMonth}
              disabled={disabledDates}
              onSelect={(day) => {
                field.handleChange(toIsoDate(day));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {showClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-0 inset-y-0 my-auto"
            aria-label={`Clear ${typeof label === "string" ? label : "date"}`}
            onClick={() => {
              field.handleChange("");
              field.handleBlur();
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </FieldFrame>
  );
}

export type DateRangeFieldProps = BaseFieldProps & {
  placeholder?: string;
  displayFormat?: string;
  clearable?: boolean;
  numberOfMonths?: number;
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
};

/**
 * Date Range Field Block. Stores `{ from?: string; to?: string }` using
 * `"YYYY-MM-DD"` calendar strings.
 */
export function DateRangeField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  placeholder = "Pick a date range",
  displayFormat = "LLL d, y",
  clearable = true,
  numberOfMonths = 2,
  disabledDates,
}: DateRangeFieldProps) {
  const field = useFieldContext<DateRangeValue | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => {
    const from = parseIsoDate(field.state.value?.from);
    const to = parseIsoDate(field.state.value?.to);
    return from || to ? { from, to } : undefined;
  }, [field.state.value?.from, field.state.value?.to]);

  const labelText = selected?.from
    ? selected.to
      ? `${format(selected.from, displayFormat)} – ${format(selected.to, displayFormat)}`
      : format(selected.from, displayFormat)
    : placeholder;
  const showClear = clearable && Boolean(selected?.from || selected?.to) && !disabled;

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
      <div className="relative flex w-full items-center">
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) field.handleBlur();
          }}
        >
          <PopoverTrigger
            render={
              <Button
                id={ids.fieldId}
                type="button"
                variant="outline"
                disabled={disabled}
                aria-invalid={invalid}
                aria-describedby={buildDescribedBy({
                  hasDescription: Boolean(description),
                  invalid,
                  ids,
                })}
                className={cn(
                  "h-10 w-full justify-start border-transparent border-b-input px-0 font-normal tracking-normal normal-case hover:bg-transparent",
                  showClear && "pr-8",
                  !selected?.from && "text-muted-foreground",
                  invalid && "border-b-destructive",
                )}
              />
            }
          >
            <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
            <span className="truncate">{labelText}</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={selected}
              defaultMonth={selected?.from}
              numberOfMonths={numberOfMonths}
              disabled={disabledDates}
              onSelect={(range) => {
                field.handleChange({
                  from: range?.from ? toIsoDate(range.from) : undefined,
                  to: range?.to ? toIsoDate(range.to) : undefined,
                });
              }}
            />
          </PopoverContent>
        </Popover>
        {showClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-0 inset-y-0 my-auto"
            aria-label={`Clear ${typeof label === "string" ? label : "date range"}`}
            onClick={() => {
              field.handleChange({ from: undefined, to: undefined });
              field.handleBlur();
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </FieldFrame>
  );
}

export type DateTimeFieldProps = BaseFieldProps & {
  placeholder?: string;
  /** date-fns display format. Defaults to `"PPP p"` (12h) or `"PPP HH:mm"` (24h). */
  displayFormat?: string;
  hourCycle?: 12 | 24;
  showSeconds?: boolean;
  clearable?: boolean;
  disabledDates?: React.ComponentProps<typeof Calendar>["disabled"];
};

function clampInt(raw: string, min: number, max: number): number | null {
  const num = Number.parseInt(raw, 10);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

/**
 * DateTime Field Block. Edits date and wall-clock time in the user's browser
 * IANA time zone (displayed as a badge) and stores a UTC ISO-8601 string (or
 * `""` when cleared).
 */
export function DateTimeField({
  label,
  description,
  hideLabel,
  required,
  disabled,
  orientation,
  showError,
  className,
  id,
  placeholder = "Pick date and time",
  displayFormat,
  hourCycle = 24,
  showSeconds = false,
  clearable = true,
  disabledDates,
}: DateTimeFieldProps) {
  const field = useFieldContext<string | undefined>();
  const ids = useFieldIds(field.name, id);
  const { messages, invalid } = useFieldFeedback(showError);
  const [open, setOpen] = React.useState(false);

  const timeZone = React.useMemo(() => getLocalTimeZone(), []);
  const selected = React.useMemo(() => parseIsoDateTime(field.state.value), [field.state.value]);
  const showClear = clearable && Boolean(selected) && !disabled;

  const hours24 = selected ? selected.getHours() : 9;
  const minutes = selected ? selected.getMinutes() : 0;
  const seconds = selected ? selected.getSeconds() : 0;

  const isPm = hours24 >= 12;
  const displayHour = hourCycle === 12 ? hours24 % 12 || 12 : hours24;

  const resolvedFormat =
    displayFormat ??
    (hourCycle === 12
      ? showSeconds
        ? "PPP pp"
        : "PPP p"
      : showSeconds
        ? "PPP HH:mm:ss"
        : "PPP HH:mm");

  function updateDateTime(nextDay: Date, nextH: number, nextM: number, nextS: number) {
    field.handleChange(combineLocalDateAndTimeToUtcIso(nextDay, nextH, nextM, nextS));
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
      <div className="relative flex w-full items-center">
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) field.handleBlur();
          }}
        >
          <PopoverTrigger
            render={
              <Button
                id={ids.fieldId}
                type="button"
                variant="outline"
                disabled={disabled}
                aria-invalid={invalid}
                aria-describedby={buildDescribedBy({
                  hasDescription: Boolean(description),
                  invalid,
                  ids,
                })}
                className={cn(
                  "h-10 w-full justify-start border-transparent border-b-input px-0 font-normal tracking-normal normal-case hover:bg-transparent",
                  showClear && "pr-8",
                  !selected && "text-muted-foreground",
                  invalid && "border-b-destructive",
                )}
              />
            }
          >
            <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
            <span className="flex-1 truncate text-start">
              {selected ? format(selected, resolvedFormat) : placeholder}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto gap-0 p-0">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              captionLayout="dropdown"
              disabled={disabledDates}
              onSelect={(day) => {
                if (!day) return;
                updateDateTime(day, hours24, minutes, seconds);
              }}
            />
            <Separator />
            <div className="flex flex-col gap-2.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ClockIcon aria-hidden="true" className="size-3.5" />
                  Time
                </span>
                <Badge variant="secondary" className="font-normal">
                  {timeZone}
                </Badge>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids.fieldId}-hour`} className="text-xs text-muted-foreground">
                    Hour
                  </Label>
                  <Input
                    id={`${ids.fieldId}-hour`}
                    type="number"
                    inputMode="numeric"
                    min={hourCycle === 12 ? 1 : 0}
                    max={hourCycle === 12 ? 12 : 23}
                    value={String(displayHour).padStart(2, "0")}
                    onChange={(event) => {
                      const baseDate = selected ?? new Date();
                      const clamped = clampInt(
                        event.target.value,
                        hourCycle === 12 ? 1 : 0,
                        hourCycle === 12 ? 12 : 23,
                      );
                      if (clamped === null) return;
                      const next24 =
                        hourCycle === 12 ? (isPm ? (clamped % 12) + 12 : clamped % 12) : clamped;
                      updateDateTime(baseDate, next24, minutes, seconds);
                    }}
                    className="h-8 w-14 text-center tabular-nums"
                  />
                </div>
                <span className="pb-1.5 text-sm text-muted-foreground">:</span>
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor={`${ids.fieldId}-minute`}
                    className="text-xs text-muted-foreground"
                  >
                    Min
                  </Label>
                  <Input
                    id={`${ids.fieldId}-minute`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    value={String(minutes).padStart(2, "0")}
                    onChange={(event) => {
                      const baseDate = selected ?? new Date();
                      const clamped = clampInt(event.target.value, 0, 59);
                      if (clamped === null) return;
                      updateDateTime(baseDate, hours24, clamped, seconds);
                    }}
                    className="h-8 w-14 text-center tabular-nums"
                  />
                </div>
                {showSeconds ? (
                  <>
                    <span className="pb-1.5 text-sm text-muted-foreground">:</span>
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={`${ids.fieldId}-second`}
                        className="text-xs text-muted-foreground"
                      >
                        Sec
                      </Label>
                      <Input
                        id={`${ids.fieldId}-second`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={59}
                        value={String(seconds).padStart(2, "0")}
                        onChange={(event) => {
                          const baseDate = selected ?? new Date();
                          const clamped = clampInt(event.target.value, 0, 59);
                          if (clamped === null) return;
                          updateDateTime(baseDate, hours24, minutes, clamped);
                        }}
                        className="h-8 w-14 text-center tabular-nums"
                      />
                    </div>
                  </>
                ) : null}
                {hourCycle === 12 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-8"
                    onClick={() => {
                      const baseDate = selected ?? new Date();
                      const toggled = isPm ? hours24 - 12 : hours24 + 12;
                      updateDateTime(baseDate, toggled, minutes, seconds);
                    }}
                  >
                    {isPm ? "PM" : "AM"}
                  </Button>
                ) : null}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {showClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute end-0 inset-y-0 my-auto"
            aria-label={`Clear ${typeof label === "string" ? label : "date and time"}`}
            onClick={() => {
              field.handleChange("");
              field.handleBlur();
            }}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </FieldFrame>
  );
}
