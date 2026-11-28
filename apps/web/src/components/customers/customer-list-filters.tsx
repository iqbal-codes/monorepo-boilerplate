import { MAX_CUSTOMER_FILTER_TAGS } from "@monorepo-boilerplate/api/customer-filter-limits";
import { Checkbox } from "@monorepo-boilerplate/ui/components/checkbox";
import {
  FacetedFilter,
  type FacetedFilterOption,
} from "@monorepo-boilerplate/ui/components/faceted-filter";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@monorepo-boilerplate/ui/components/field";
import { useId, useMemo } from "react";

import { CUSTOMER_STATUS_META } from "@/components/customers/customer-detail-timeline";
import type { CustomerStatusValue } from "@/lib/use-data-table-search-params";

export type CustomerFacets = {
  status: Record<CustomerStatusValue, number>;
  tags: ReadonlyArray<{ value: string; count: number }>;
};

const STATUS_ORDER: readonly CustomerStatusValue[] = ["active", "inactive", "archived"];

type CustomerListFilters = {
  facets?: CustomerFacets;
  statuses: readonly CustomerStatusValue[];
  tags: readonly string[];
  onStatusesChange: (next: readonly CustomerStatusValue[]) => void;
  onTagsChange: (next: readonly string[]) => void;
};

/** Builds both presentations of the same URL-backed filters. */
export function useCustomerListFilters({
  facets,
  statuses,
  tags,
  onStatusesChange,
  onTagsChange,
}: CustomerListFilters) {
  const statusOptions = useMemo(
    () =>
      STATUS_ORDER.map((value) => ({
        value,
        label: CUSTOMER_STATUS_META[value].label,
        count: facets?.status[value],
      })),
    [facets],
  );
  const tagOptions = useMemo(() => {
    const byValue = new Map(facets?.tags.map(({ value, count }) => [value, count]));
    for (const tag of tags) if (!byValue.has(tag)) byValue.set(tag, 0);
    return [...byValue.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [facets, tags]);

  const activeCount = Number(statuses.length > 0) + Number(tags.length > 0);

  return {
    filters: (
      <>
        <FacetedFilter
          title="Status"
          options={statusOptions}
          value={statuses}
          onValueChange={(next) => onStatusesChange(next as CustomerStatusValue[])}
          searchPlaceholder="Filter status…"
        />
        <FacetedFilter
          title="Tags"
          options={tagOptions}
          value={tags}
          onValueChange={onTagsChange}
          maxSelections={MAX_CUSTOMER_FILTER_TAGS}
          searchPlaceholder="Filter tags…"
          emptyText="No tags found."
        />
      </>
    ),
    filterSheet: {
      activeCount,
      title: "Filter customers",
      description: "Choose which customer records to show.",
      onReset: () => {
        onStatusesChange([]);
        onTagsChange([]);
      },
      resetDisabled: activeCount === 0,
      content: (
        <div className="flex flex-col gap-5">
          <MobileFacet
            title="Status"
            options={statusOptions}
            selected={statuses}
            onChange={onStatusesChange}
          />
          {tagOptions.length > 0 ? (
            <MobileFacet
              title="Tags"
              options={tagOptions}
              selected={tags}
              onChange={onTagsChange}
              maxSelections={MAX_CUSTOMER_FILTER_TAGS}
            />
          ) : null}
        </div>
      ),
    },
  };
}

function MobileFacet<T extends string>({
  title,
  options,
  selected,
  onChange,
  maxSelections = Infinity,
}: {
  title: string;
  options: readonly (FacetedFilterOption & { value: T })[];
  selected: readonly T[];
  onChange: (next: readonly T[]) => void;
  maxSelections?: number;
}) {
  const id = useId();
  const atLimit = selected.length >= maxSelections;
  return (
    <FieldSet>
      <FieldLegend variant="label">{title}</FieldLegend>
      {atLimit ? (
        <p role="status" className="text-xs text-muted-foreground">
          Up to {maxSelections} selections. Remove one to add another.
        </p>
      ) : null}
      <div className="grid gap-2">
        {options.map((option, index) => {
          const optionId = `${id}-${index}`;
          const checked = selected.includes(option.value);
          const disabled = option.disabled || (atLimit && !checked);
          return (
            <FieldLabel key={option.value} htmlFor={optionId}>
              <Field orientation="horizontal" data-disabled={disabled || undefined}>
                <Checkbox
                  id={optionId}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={() => {
                    if (disabled) return;
                    onChange(
                      checked
                        ? selected.filter((value) => value !== option.value)
                        : [...selected, option.value],
                    );
                  }}
                />
                <FieldContent>
                  <FieldTitle className="flex items-center justify-between gap-2">
                    <span>{option.label}</span>
                    {option.count !== undefined ? (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {option.count}
                      </span>
                    ) : null}
                  </FieldTitle>
                </FieldContent>
              </Field>
            </FieldLabel>
          );
        })}
      </div>
    </FieldSet>
  );
}
