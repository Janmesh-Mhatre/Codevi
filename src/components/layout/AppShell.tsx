import { Toolbar } from "../toolbar/Toolbar";
import { CodeEditor } from "../editor/CodeEditor";
import { VisualizationPanel } from "../panels/VisualizationPanel";
import { AstViewerPanel } from "../panels/AstViewerPanel";
import { StackPanel } from "../panels/StackPanel";
import { VariablePanel } from "../panels/VariablePanel";
import { MemoryPanel } from "../panels/MemoryPanel";
import { ExplanationPanel } from "../panels/ExplanationPanel";
import { ConsolePanel } from "../panels/ConsolePanel";
import { ErrorDialog } from "../common/ErrorDialog";
import { Toast } from "../common/Toast";
import { Tabs } from "../common/Tabs";

const TOP_RIGHT_TABS = [
  { id: "ast", label: "AST" },
  { id: "stack", label: "Stack" },
  { id: "visualization", label: "Visualization" },
] as const;

/**
 * The workbench layout, carried over from the Phase 0 blueprint's UI
 * wireframe (section 6): editor on the left, visualization + variable +
 * memory stacked on the right, explanation as a thin bar, console along
 * the bottom. See README.md → "Component hierarchy" for the full tree.
 *
 * Phase 2 added the AST tab to this slot; Phase 4 adds Stack the same
 * way (see docs/PHASE_4_VISUALIZATION.md → "Layout"). The default tab
 * stays "ast" — unchanged from Phase 2 — rather than auto-switching to
 * Stack when execution starts, to avoid yanking the view out from under
 * someone reading the AST. Variable and Memory panels below are now
 * live (Phase 4) but occupy the exact same layout slots as Phase 1.
 */
export function AppShell() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-fg">
      <Toolbar />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 border-r border-border">
          <CodeEditor />
        </div>

        <div className="flex w-[420px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 border-b border-border">
            <Tabs tabs={TOP_RIGHT_TABS} defaultTabId="ast">
              {(activeTabId) => {
                if (activeTabId === "ast") return <AstViewerPanel />;
                if (activeTabId === "stack") return <StackPanel />;
                return <VisualizationPanel />;
              }}
            </Tabs>
          </div>
          <div className="flex h-64 shrink-0">
            <div className="min-w-0 flex-1 border-r border-border">
              <VariablePanel />
            </div>
            <div className="min-w-0 flex-1">
              <MemoryPanel />
            </div>
          </div>
        </div>
      </div>

      <ExplanationPanel />
      <ConsolePanel />

      <ErrorDialog />
      <Toast />
    </div>
  );
}
