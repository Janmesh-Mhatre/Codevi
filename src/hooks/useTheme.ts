import { useEffect } from "react";
import { useUIStore } from "../state/uiStore";
import { applyTheme } from "../themes/applyTheme";

/** Keeps the Codevi UI themed: applies CSS variables, .dark class, and
 *  the matching Monaco editor theme whenever the persisted theme changes.
 *  Called once in App.tsx at the root. */
export function useTheme() {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return theme;
}
