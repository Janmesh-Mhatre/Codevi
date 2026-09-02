import { describe, expect, it, beforeEach } from "vitest";
import { useUIStore } from "../../../src/state/uiStore";

describe("UIStore workspace layout & panel resizing", () => {
  beforeEach(() => {
    useUIStore.getState().resetLayout();
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
