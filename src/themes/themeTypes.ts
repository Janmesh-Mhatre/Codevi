/**
 * Codevi Theme System — Type definitions.
 *
 * Every theme is identified by a `ThemeId` slug and described by a
 * `ThemeDefinition` object that provides both CSS custom-property values
 * and a full Monaco editor theme. Adding a new theme is a matter of
 * adding a new entry to the `THEMES` map in `./themes.ts` — no component
 * changes required.
 */

import type * as monaco from "monaco-editor";

/** Unique identifier for each built-in theme. */
export type ThemeId =
  | "dark-modern"
  | "light-modern"
  | "one-dark-pro"
  | "github-dark"
  | "tokyo-night"
  | "catppuccin-mocha"
  | "dracula"
  | "nord"
  | "ayu-mirage";

/** Ordered list of all theme IDs — drives the dropdown order. */
export const THEME_IDS: readonly ThemeId[] = [
  "dark-modern",
  "light-modern",
  "one-dark-pro",
  "github-dark",
  "tokyo-night",
  "catppuccin-mocha",
  "dracula",
  "nord",
  "ayu-mirage",
] as const;

/** Human-readable labels for each theme. */
export const THEME_LABELS: Record<ThemeId, string> = {
  "dark-modern": "Dark Modern",
  "light-modern": "Light Modern",
  "one-dark-pro": "One Dark Pro",
  "github-dark": "GitHub Dark",
  "tokyo-night": "Tokyo Night",
  "catppuccin-mocha": "Catppuccin Mocha",
  "dracula": "Dracula",
  "nord": "Nord",
  "ayu-mirage": "Ayu Mirage",
};

/** CSS custom-property values that control the entire Codevi UI. */
export interface ThemeCSSVars {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  fg: string;
  fgMuted: string;
  accent: string;
  accentFg: string;
  active: string;
  danger: string;
}

/** Monaco editor theme configuration embedded inside each theme. */
export interface ThemeMonaco {
  base: "vs" | "vs-dark";
  rules: monaco.editor.ITokenThemeRule[];
  colors: Record<string, string>;
}

/** Complete theme definition: CSS variables + Monaco + metadata. */
export interface ThemeDefinition {
  /** Whether this is a light or dark theme (controls `color-scheme`). */
  colorScheme: "light" | "dark";
  /** CSS custom-property values. */
  css: ThemeCSSVars;
  /** Monaco editor theme. */
  monaco: ThemeMonaco;
}
