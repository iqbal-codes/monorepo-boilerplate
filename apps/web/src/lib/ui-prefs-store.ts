import type { DataTableDensity } from "@monorepo-boilerplate/ui/components/data-table";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Cross-route UI preferences. This store holds *only* interface choices:
 * server data lives in TanStack Query, list parameters live in the URL (nuqs),
 * and form state lives in TanStack Form.
 *
 * Rule: never put server data here. A persisted copy of API data is the usual
 * source of "why is my app stale after deploy" bugs.
 */
export type TableDensity = DataTableDensity;

const DEFAULT_TABLE_DENSITY: TableDensity = "comfortable";
const DEFAULT_PAGE_SIZE = 20;

type UiPrefsState = {
  /** Row height in every DataTable. */
  tableDensity: TableDensity;
  /** Default page size for new list views; per-view overrides go in the URL. */
  defaultPageSize: number;
  setTableDensity: (density: TableDensity) => void;
  setDefaultPageSize: (pageSize: number) => void;
  resetUiPrefs: () => void;
};

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      tableDensity: DEFAULT_TABLE_DENSITY,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      setTableDensity: (tableDensity) => set({ tableDensity }),
      setDefaultPageSize: (defaultPageSize) => set({ defaultPageSize }),
      resetUiPrefs: () =>
        set({
          tableDensity: DEFAULT_TABLE_DENSITY,
          defaultPageSize: DEFAULT_PAGE_SIZE,
        }),
    }),
    { name: "ui-prefs", version: 1 },
  ),
);
