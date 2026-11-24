import type { ReactNode, Ref } from "react";
import { SearchIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@monorepo-boilerplate/ui/components/input-group";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

export function ListToolbar({
  search,
  filters,
  resultLabel,
  isFetching,
}: {
  search: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    inputRef?: Ref<HTMLInputElement>;
  };
  filters?: ReactNode;
  resultLabel?: string;
  isFetching?: boolean;
}) {
  return (
    <div data-slot="list-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
      <InputGroup className="w-full max-w-xs">
        <InputGroupInput
          ref={search.inputRef}
          type="search"
          aria-label={search.label}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
      </InputGroup>
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        {isFetching && <Spinner aria-hidden />}
        {resultLabel}
      </span>
    </div>
  );
}
