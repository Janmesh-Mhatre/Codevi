/**
 * Codevi Theme System — Centralized theme application.
 *
 * `applyTheme(themeId)` is the single point of entry for theme changes.
 * It sets CSS custom properties on `document.documentElement`, toggles the
 * `.dark` class for Tailwind's `@custom-variant dark`, and defines + sets
 * the corresponding Monaco editor theme.
 *
 * Called from `useTheme()` whenever the persisted theme ID changes.
 */

import * as monaco from "monaco-editor";
import type { ThemeId } from "./themeTypes";
import { THEMES } from "./themes";

/** Monaco theme names are namespaced: `cv-<themeId>`. */
export function monacoThemeName(themeId: ThemeId): string {
  return `cv-${themeId}`;
}

/** Set of Monaco themes that have already been defined this session. */
const definedMonacoThemes = new Set<string>();

/**
 * Apply a Codevi theme everywhere:
 *  1. CSS custom properties on <html>
 *  2. `color-scheme` on <html>
 *  3. `.dark` class toggle
 *  4. Monaco editor theme (define + set)
 */
export function applyTheme(themeId: ThemeId): void {
  const def = THEMES[themeId];
  if (!def) return;

  const root = document.documentElement;

  // 1. Inject CSS custom properties
  root.style.setProperty("--color-canvas", def.css.canvas);
  root.style.setProperty("--color-surface", def.css.surface);
  root.style.setProperty("--color-surface-raised", def.css.surfaceRaised);
  root.style.setProperty("--color-border", def.css.border);
  root.style.setProperty("--color-fg", def.css.fg);
  root.style.setProperty("--color-fg-muted", def.css.fgMuted);
  root.style.setProperty("--color-accent", def.css.accent);
  root.style.setProperty("--color-accent-fg", def.css.accentFg);
  root.style.setProperty("--color-active", def.css.active);
  root.style.setProperty("--color-danger", def.css.danger);

  // 2. Set color-scheme (affects browser chrome: scrollbars, form controls)
  root.style.colorScheme = def.colorScheme;

  // 3. Toggle `.dark` class for Tailwind's @custom-variant dark
  root.classList.toggle("dark", def.colorScheme === "dark");

  // 4. Define + activate Monaco theme
  const name = monacoThemeName(themeId);
  if (!definedMonacoThemes.has(name)) {
    monaco.editor.defineTheme(name, {
      base: def.monaco.base,
      inherit: true,
      rules: def.monaco.rules,
      colors: def.monaco.colors,
    });
    definedMonacoThemes.add(name);
  }
  monaco.editor.setTheme(name);
}
