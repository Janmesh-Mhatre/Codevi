import { useEffect } from "react";
import { useUIStore } from "../state/uiStore";

/** Keeps `<html class="dark">` in sync with uiStore's theme. The actual
 * color values live in src/index.css (`@theme` + `.dark` overrides), so
 * this hook only ever toggles one class — it has no opinions about color. */
export function useTheme() {
  const theme = useUIStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return theme;
}
