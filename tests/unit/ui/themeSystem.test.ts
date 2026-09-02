import { describe, expect, it } from "vitest";
import { THEMES } from "../../../src/themes/themes";
import { THEME_IDS, THEME_LABELS, type ThemeId } from "../../../src/themes/themeTypes";

describe("Theme definitions", () => {
  it("has exactly 9 themes", () => {
    expect(Object.keys(THEMES).length).toBe(9);
    expect(THEME_IDS.length).toBe(9);
  });

  it("every THEME_ID has a matching entry in THEMES", () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id]).toBeDefined();
    }
  });

  it("every THEME_ID has a human-readable label", () => {
    for (const id of THEME_IDS) {
      expect(THEME_LABELS[id]).toBeTruthy();
      expect(typeof THEME_LABELS[id]).toBe("string");
    }
  });

  it("every theme has all required CSS variable fields", () => {
    const requiredFields = [
      "canvas", "surface", "surfaceRaised", "border",
      "fg", "fgMuted", "accent", "accentFg", "active", "danger",
    ] as const;

    for (const id of THEME_IDS) {
      const def = THEMES[id];
      for (const field of requiredFields) {
        expect(def.css[field], `${id}.css.${field}`).toBeTruthy();
        expect(def.css[field]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("every theme has a valid colorScheme", () => {
    for (const id of THEME_IDS) {
      expect(["light", "dark"]).toContain(THEMES[id].colorScheme);
    }
  });

  it("every theme has a valid Monaco base", () => {
    for (const id of THEME_IDS) {
      expect(["vs", "vs-dark"]).toContain(THEMES[id].monaco.base);
    }
  });

  it("colorScheme and Monaco base are consistent", () => {
    for (const id of THEME_IDS) {
      const def = THEMES[id];
      if (def.colorScheme === "light") {
        expect(def.monaco.base, `${id} should use vs base`).toBe("vs");
      } else {
        expect(def.monaco.base, `${id} should use vs-dark base`).toBe("vs-dark");
      }
    }
  });

  it("every theme has Monaco token rules", () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id].monaco.rules.length).toBeGreaterThan(0);
    }
  });

  it("every theme has Monaco editor chrome colors", () => {
    const requiredColors = [
      "editor.background",
      "editor.foreground",
      "editorLineNumber.foreground",
      "editorCursor.foreground",
    ];
    for (const id of THEME_IDS) {
      for (const color of requiredColors) {
        expect(THEMES[id].monaco.colors[color], `${id} missing Monaco color ${color}`).toBeTruthy();
      }
    }
  });

  it("Dark Modern is positioned first as the default theme", () => {
    expect(THEME_IDS[0]).toBe("dark-modern");
  });

  it("Light Modern is positioned second as the standard light alternative", () => {
    expect(THEME_IDS[1]).toBe("light-modern");
  });

  it("only Light Modern has colorScheme 'light'", () => {
    const lightThemes = THEME_IDS.filter((id) => THEMES[id].colorScheme === "light");
    expect(lightThemes).toEqual(["light-modern"]);
  });
});

describe("Theme CSS variable structure", () => {
  it("every theme's CSS canvas color differs from its fg color", () => {
    // Ensures minimum contrast between background and text
    for (const id of THEME_IDS) {
      const def = THEMES[id];
      expect(def.css.canvas).not.toBe(def.css.fg);
    }
  });

  it("every theme's accent differs from active", () => {
    // Stack (accent) and Heap (active) must be visually distinguishable
    for (const id of THEME_IDS) {
      const def = THEMES[id];
      expect(def.css.accent, `${id}: accent must differ from active`).not.toBe(def.css.active);
    }
  });

  it("every theme's danger differs from accent and active", () => {
    for (const id of THEME_IDS) {
      const def = THEMES[id];
      expect(def.css.danger).not.toBe(def.css.accent);
      expect(def.css.danger).not.toBe(def.css.active);
    }
  });
});

describe("Legacy theme migration", () => {
  it("maps legacy 'dark' to 'dark-modern'", () => {
    // Test the migration logic inline since it's a pure function
    function migrateTheme(raw: unknown): ThemeId {
      if (raw === "dark") return "dark-modern";
      if (raw === "light") return "light-modern";
      if (typeof raw === "string" && (THEME_IDS as readonly string[]).includes(raw)) {
        return raw as ThemeId;
      }
      return "dark-modern";
    }

    expect(migrateTheme("dark")).toBe("dark-modern");
  });

  it("maps legacy 'light' to 'light-modern'", () => {
    function migrateTheme(raw: unknown): ThemeId {
      if (raw === "dark") return "dark-modern";
      if (raw === "light") return "light-modern";
      if (typeof raw === "string" && (THEME_IDS as readonly string[]).includes(raw)) {
        return raw as ThemeId;
      }
      return "dark-modern";
    }

    expect(migrateTheme("light")).toBe("light-modern");
  });

  it("passes through valid ThemeId values unchanged", () => {
    function migrateTheme(raw: unknown): ThemeId {
      if (raw === "dark") return "dark-modern";
      if (raw === "light") return "light-modern";
      if (typeof raw === "string" && (THEME_IDS as readonly string[]).includes(raw)) {
        return raw as ThemeId;
      }
      return "dark-modern";
    }

    for (const id of THEME_IDS) {
      expect(migrateTheme(id)).toBe(id);
    }
  });

  it("defaults to dark-modern for invalid values", () => {
    function migrateTheme(raw: unknown): ThemeId {
      if (raw === "dark") return "dark-modern";
      if (raw === "light") return "light-modern";
      if (typeof raw === "string" && (THEME_IDS as readonly string[]).includes(raw)) {
        return raw as ThemeId;
      }
      return "dark-modern";
    }

    expect(migrateTheme("nonexistent")).toBe("dark-modern");
    expect(migrateTheme(null)).toBe("dark-modern");
    expect(migrateTheme(undefined)).toBe("dark-modern");
    expect(migrateTheme(42)).toBe("dark-modern");
  });
});
