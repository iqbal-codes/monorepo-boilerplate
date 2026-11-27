import { useTheme } from "next-themes";

/**
 * Single owner for the App Shell's light/dark toggle. The top bar and the
 * Command Center are two entry points to the same UI preference.
 */
export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return {
    isDark,
    toggleTheme: () => setTheme(isDark ? "light" : "dark"),
  };
}
