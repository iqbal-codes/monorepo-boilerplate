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
export type TableDensity = "comfortable" | "compact";

type UiPrefsState = {
  /** Row height in every DataTable. */
  tableDensity: TableDensity;
  /** Default page size for new list views; per-view overrides go in the URL. */
  defaultPageSize: number;
  setTableDensity: (density: TableDensity) => void;
  setDefaultPageSize: (pageSize: number) => void;
};

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      tableDensity: "comfortable",
      defaultPageSize: 20,
      setTableDensity: (tableDensity) => set({ tableDensity }),
      setDefaultPageSize: (defaultPageSize) => set({ defaultPageSize }),
    }),
    { name: "ui-prefs", version: 1 },
  ),
);
