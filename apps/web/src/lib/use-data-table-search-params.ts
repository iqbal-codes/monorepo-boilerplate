import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CustomerStatusFilter = "all" | "active" | "inactive" | "archived";

type UseListSearchParamsOptions<TSortKey extends string> = {
  /** Accepted sort column ids. */
  sortKeys: readonly TSortKey[];
  defaultSortKey: TSortKey;
  defaultSortDir?: "asc" | "desc";
  defaultPageSize?: number;
  /** Debounce for the text filter only; paging and sorting stay immediate. */
  searchDebounceMs?: number;
};

/**
 * Bridges URL state (nuqs) to the controlled props of `DataTable`.
 *
 * The table block never reads the URL (docs/adr/0002): this hook is the single
 * writer of the list parameters, so paging, sorting, and filtering have one
 * owner and the resulting view is shareable by URL.
 */
export function useListSearchParams<TSortKey extends string>({
  sortKeys,
  defaultSortKey,
  defaultSortDir = "desc",
  defaultPageSize = 20,
  searchDebounceMs = 300,
}: UseListSearchParamsOptions<TSortKey>) {
  const [state, setState] = useQueryStates(
    {
      page: parseAsInteger.withDefault(0),
      size: parseAsInteger.withDefault(defaultPageSize),
      q: parseAsString.withDefault(""),
      status: parseAsStringLiteral<CustomerStatusFilter>([
        "all",
        "active",
        "inactive",
        "archived",
      ]).withDefault("all"),
      sort: parseAsStringLiteral(sortKeys).withDefault(defaultSortKey),
      dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault(defaultSortDir),
    },
    { history: "replace" },
  );

  // Keep the input responsive while debouncing commits to the shareable URL.
  const [searchInput, setSearchInput] = useState(state.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [searchFromUrl, setSearchFromUrl] = useState(state.q);
  if (searchFromUrl !== state.q) {
    setSearchFromUrl(state.q);
    setSearchInput(state.q);
  }

  useEffect(() => () => clearTimeout(timer.current), [state.q]);

  const onSearchInputChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void setState({ q: value, page: 0 });
      }, searchDebounceMs);
    },
    [setState, searchDebounceMs],
  );

  const pagination = useMemo(
    () => ({ pageIndex: state.page, pageSize: state.size }),
    [state.page, state.size],
  );

  const sorting = useMemo(
    () => [{ id: state.sort as string, desc: state.dir === "desc" }],
    [state.sort, state.dir],
  );

  const setPagination = useCallback(
    (next: { pageIndex: number; pageSize: number }) => {
      void setState({ page: Math.max(0, next.pageIndex), size: next.pageSize });
    },
    [setState],
  );

  const setSorting = useCallback(
    (next: ReadonlyArray<{ id: string; desc: boolean }>) => {
      const first = next[0];
      void setState({
        sort: (first?.id ?? defaultSortKey) as TSortKey,
        dir: first ? (first.desc ? "desc" : "asc") : defaultSortDir,
        page: 0,
      });
    },
    [setState, defaultSortKey, defaultSortDir],
  );

  const setStatus = useCallback(
    (status: CustomerStatusFilter) => void setState({ status, page: 0 }),
    [setState],
  );

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setSearchInput("");
    void setState({
      page: 0,
      q: "",
      status: "all",
      sort: defaultSortKey,
      dir: defaultSortDir,
    });
  }, [setState, defaultSortKey, defaultSortDir]);

  return {
    search: state.q,
    searchInput,
    onSearchInputChange,
    status: state.status,
    setStatus,
    sortBy: state.sort,
    sortDir: state.dir,
    pagination,
    setPagination,
    sorting,
    setSorting,
    reset,
  };
}
