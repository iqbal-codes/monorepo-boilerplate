import * as React from "react";

type PageTitleState = {
  /** Title a screen set for itself, replacing the route's `staticData.pageTitle`. */
  override: string | undefined;
  setOverride: (title: string | undefined) => void;
};

const PageTitleContext = React.createContext<PageTitleState | null>(null);

/**
 * Lets a screen name itself with data it only knows after loading — a detail
 * page showing the record's name instead of "Customer" — without prop-drilling
 * through the layout or parsing the pathname.
 *
 * Routes with a fixed name use `staticData.pageTitle`; this is the escape hatch
 * for dynamic ones.
 */
export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = React.useState<string | undefined>(undefined);
  const value = React.useMemo(() => ({ override, setOverride }), [override]);
  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleOverride(): string | undefined {
  return React.useContext(PageTitleContext)?.override;
}

/** Sets the page title for as long as the calling component is mounted. */
export function usePageTitle(title: string | undefined) {
  const context = React.useContext(PageTitleContext);
  const setOverride = context?.setOverride;

  React.useEffect(() => {
    if (!setOverride) return;
    setOverride(title);
    return () => setOverride(undefined);
  }, [setOverride, title]);
}
