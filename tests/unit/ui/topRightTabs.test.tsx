import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../../src/components/editor/CodeEditor", () => ({
  CodeEditor: () => React.createElement("div", { "data-testid": "code-editor" }),
}));

const { AppShell, TOP_RIGHT_TABS } = await import("../../../src/components/layout/AppShell");

describe("Phase 6.4.2: Top-Right Tabs Final Architecture", () => {
  it("defines exactly three tabs in order: AST, Declarations, and Visualization", () => {
    expect(TOP_RIGHT_TABS).toEqual([
      { id: "ast", label: "AST" },
      { id: "declarations", label: "Declarations" },
      { id: "visualization", label: "Visualization" },
    ]);
  });

  it("renders only AST, Declarations, and Visualization tabs without duplicates or old views", () => {
    const html = renderToStaticMarkup(<AppShell />);

    // Check required tab buttons exist
    expect(html).toContain(">AST<");
    expect(html).toContain(">Declarations<");
    expect(html).toContain(">Visualization<");

    // Verify old views have been removed
    expect(html).not.toContain(">Stack<");
    expect(html).not.toContain(">Variable &amp; Array View<");
    expect(html).not.toContain(">Pointer View<");

    // Exactly one Visualization tab button exists
    const vizMatches = html.match(/>Visualization</g);
    expect(vizMatches).not.toBeNull();
    expect(vizMatches?.length).toBe(1);
  });
});
