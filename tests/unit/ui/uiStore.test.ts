import { describe, expect, it, beforeEach } from "vitest";
import { useUIStore } from "../../../src/state/uiStore";
import type { ThemeId } from "../../../src/themes/themeTypes";
import { THEME_IDS } from "../../../src/themes/themeTypes";

describe("UIStore workspace layout & panel resizing", () => {
  beforeEach(() => {
    useUIStore.getState().resetLayout();
    // Reset theme to default for each test
    useUIStore.getState().setTheme("dark-modern");
  });

  it("initializes with sensible default panel dimensions and visibility", () => {
    const state = useUIStore.getState();
    expect(state.rightPanelWidth).toBe(420);
    expect(state.isRightPanelVisible).toBe(true);
    expect(state.rightPanelBottomHeight).toBe(256);
    expect(state.consoleHeight).toBe(160);
    expect(state.isConsoleVisible).toBe(true);
    expect(state.isExplanationVisible).toBe(true);
  });

  it("updates right panel width with lower bound protection", () => {
    useUIStore.getState().setRightPanelWidth(500);
    expect(useUIStore.getState().rightPanelWidth).toBe(500);

    // Below minimum width (260px) should clamp to 260
    useUIStore.getState().setRightPanelWidth(100);
    expect(useUIStore.getState().rightPanelWidth).toBe(260);
  });

  it("toggles and sets right panel visibility", () => {
    expect(useUIStore.getState().isRightPanelVisible).toBe(true);

    useUIStore.getState().toggleRightPanel();
    expect(useUIStore.getState().isRightPanelVisible).toBe(false);

    useUIStore.getState().toggleRightPanel();
    expect(useUIStore.getState().isRightPanelVisible).toBe(true);

    useUIStore.getState().setRightPanelVisible(false);
    expect(useUIStore.getState().isRightPanelVisible).toBe(false);
  });

  it("toggles and sets console visibility independently", () => {
    expect(useUIStore.getState().isConsoleVisible).toBe(true);

    useUIStore.getState().toggleConsole();
    expect(useUIStore.getState().isConsoleVisible).toBe(false);

    useUIStore.getState().toggleConsole();
    expect(useUIStore.getState().isConsoleVisible).toBe(true);

    useUIStore.getState().setConsoleVisible(false);
    expect(useUIStore.getState().isConsoleVisible).toBe(false);
  });

  it("toggles and sets explanation visibility independently", () => {
    expect(useUIStore.getState().isExplanationVisible).toBe(true);

    useUIStore.getState().toggleExplanation();
    expect(useUIStore.getState().isExplanationVisible).toBe(false);

    useUIStore.getState().toggleExplanation();
    expect(useUIStore.getState().isExplanationVisible).toBe(true);

    useUIStore.getState().setExplanationVisible(false);
    expect(useUIStore.getState().isExplanationVisible).toBe(false);
  });

  it("updates right panel bottom (Variables/Memory) height with bounds protection", () => {
    useUIStore.getState().setRightPanelBottomHeight(320);
    expect(useUIStore.getState().rightPanelBottomHeight).toBe(320);

    // Below minimum height (100px) should clamp to 100
    useUIStore.getState().setRightPanelBottomHeight(50);
    expect(useUIStore.getState().rightPanelBottomHeight).toBe(100);
  });

  it("updates console height with bounds protection", () => {
    useUIStore.getState().setConsoleHeight(240);
    expect(useUIStore.getState().consoleHeight).toBe(240);

    // Below minimum height (70px) should clamp to 70
    useUIStore.getState().setConsoleHeight(30);
    expect(useUIStore.getState().consoleHeight).toBe(70);
  });

  it("resets layout dimensions and visibility to defaults", () => {
    useUIStore.getState().setRightPanelWidth(600);
    useUIStore.getState().setRightPanelVisible(false);
    useUIStore.getState().setRightPanelBottomHeight(350);
    useUIStore.getState().setConsoleHeight(300);
    useUIStore.getState().setConsoleVisible(false);
    useUIStore.getState().setExplanationVisible(false);

    useUIStore.getState().resetLayout();

    const state = useUIStore.getState();
    expect(state.rightPanelWidth).toBe(420);
    expect(state.isRightPanelVisible).toBe(true);
    expect(state.rightPanelBottomHeight).toBe(256);
    expect(state.consoleHeight).toBe(160);
    expect(state.isConsoleVisible).toBe(true);
    expect(state.isExplanationVisible).toBe(true);
  });
});

describe("UIStore theme system", () => {
  beforeEach(() => {
    useUIStore.getState().setTheme("dark-modern");
  });

  it("defaults to dark-modern theme", () => {
    expect(useUIStore.getState().theme).toBe("dark-modern");
  });

  it("allows setting any valid ThemeId", () => {
    for (const id of THEME_IDS) {
      useUIStore.getState().setTheme(id);
      expect(useUIStore.getState().theme).toBe(id);
    }
  });

  it("does not have a toggleTheme method", () => {
    // The old binary toggle has been replaced by setTheme(themeId)
    expect("toggleTheme" in useUIStore.getState()).toBe(false);
  });

  it("theme is included in persisted state", () => {
    // The theme should be persisted via partialize
    useUIStore.getState().setTheme("tokyo-night");
    expect(useUIStore.getState().theme).toBe("tokyo-night");

    // Changing theme does not affect layout state
    expect(useUIStore.getState().rightPanelWidth).toBe(420);
  });

  it("setting theme does not reset layout state", () => {
    useUIStore.getState().setRightPanelWidth(600);
    useUIStore.getState().setConsoleVisible(false);

    useUIStore.getState().setTheme("dracula");

    expect(useUIStore.getState().rightPanelWidth).toBe(600);
    expect(useUIStore.getState().isConsoleVisible).toBe(false);
    expect(useUIStore.getState().theme).toBe("dracula");
  });

  it("resetLayout does not reset theme", () => {
    useUIStore.getState().setTheme("nord");
    useUIStore.getState().resetLayout();
    expect(useUIStore.getState().theme).toBe("nord");
  });
});
