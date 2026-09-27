import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelsDropdown } from "../../../src/components/toolbar/PanelsDropdown";
import { useUIStore } from "../../../src/state/uiStore";

describe("PanelsDropdown Component", () => {
  beforeEach(() => {
    useUIStore.getState().resetLayout();
  });

  it("renders the trigger button with Panels label", () => {
    const html = renderToStaticMarkup(<PanelsDropdown />);
    expect(html).toContain("Panels");
    expect(html).toContain("Toggle workspace panels dropdown");
  });

  it("has initial state with all 3 panels enabled", () => {
    const state = useUIStore.getState();
    expect(state.isMainViewsVisible).toBe(true);
    expect(state.isVariablesVisible).toBe(true);
    expect(state.isMemoryVisible).toBe(true);
  });

  it("allows toggling Execution Views, Variables, and Memory independently", () => {
    // 1. Toggle Execution Views off
    useUIStore.getState().toggleMainViews();
    expect(useUIStore.getState().isMainViewsVisible).toBe(false);
    expect(useUIStore.getState().isVariablesVisible).toBe(true);
    expect(useUIStore.getState().isMemoryVisible).toBe(true);

    // 2. Toggle Variables off
    useUIStore.getState().toggleVariables();
    expect(useUIStore.getState().isVariablesVisible).toBe(false);
    expect(useUIStore.getState().isMemoryVisible).toBe(true);

    // 3. Toggle Memory off
    useUIStore.getState().toggleMemory();
    expect(useUIStore.getState().isMemoryVisible).toBe(false);

    // 4. Toggle them back on
    useUIStore.getState().setMainViewsVisible(true);
    expect(useUIStore.getState().isMainViewsVisible).toBe(true);

    useUIStore.getState().setVariablesVisible(true);
    expect(useUIStore.getState().isVariablesVisible).toBe(true);

    useUIStore.getState().setMemoryVisible(true);
    expect(useUIStore.getState().isMemoryVisible).toBe(true);
  });
});
