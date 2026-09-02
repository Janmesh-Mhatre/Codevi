import { useCallback, useEffect, useRef } from "react";
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
import { ResizeHandle } from "../common/ResizeHandle";
import { useUIStore } from "../../state/uiStore";

const TOP_RIGHT_TABS = [
  { id: "ast", label: "AST" },
  { id: "stack", label: "Stack" },
  { id: "visualization", label: "Visualization" },
] as const;

/**
 * The workbench layout:
 * - Code editor on the left (or full width when right workspace is hidden)
 * - Resizable vertical divider between Editor and Right-Side Workspace
 * - Right-side workspace:
 *   - Top: Tabs for AST, Stack, and Visualization
 *   - Resizable horizontal divider
 *   - Bottom: Variables and Memory panels
 * - Explanation bar
 * - Resizable horizontal divider
 * - Console panel
 */
export function AppShell() {
  const rightPanelWidth = useUIStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useUIStore((state) => state.setRightPanelWidth);
  const isRightPanelVisible = useUIStore((state) => state.isRightPanelVisible);
  const rightPanelBottomHeight = useUIStore((state) => state.rightPanelBottomHeight);
  const setRightPanelBottomHeight = useUIStore((state) => state.setRightPanelBottomHeight);
  const consoleHeight = useUIStore((state) => state.consoleHeight);
  const setConsoleHeight = useUIStore((state) => state.setConsoleHeight);

  const startWidthRef = useRef(rightPanelWidth);
  const startBottomHeightRef = useRef(rightPanelBottomHeight);
  const startConsoleHeightRef = useRef(consoleHeight);

  // Resize right panel (vertical divider)
  const handleRightPanelDragStart = useCallback(() => {
    startWidthRef.current = rightPanelWidth;
  }, [rightPanelWidth]);

  const handleRightPanelDrag = useCallback(
    (delta: number) => {
      // Dragging left (negative delta) increases right panel width
      const nextWidth = startWidthRef.current - delta;
      const minWidth = 260;
      const maxWidth = Math.max(minWidth, window.innerWidth - 300);
      setRightPanelWidth(Math.max(minWidth, Math.min(maxWidth, nextWidth)));
    },
    [setRightPanelWidth],
  );

  const handleRightPanelNudge = useCallback(
    (direction: -1 | 1) => {
      const nextWidth = rightPanelWidth - direction * 20;
      const minWidth = 260;
      const maxWidth = Math.max(minWidth, window.innerWidth - 300);
      setRightPanelWidth(Math.max(minWidth, Math.min(maxWidth, nextWidth)));
    },
    [rightPanelWidth, setRightPanelWidth],
  );

  // Resize right bottom panels (horizontal divider)
  const handleRightBottomDragStart = useCallback(() => {
    startBottomHeightRef.current = rightPanelBottomHeight;
  }, [rightPanelBottomHeight]);

  const handleRightBottomDrag = useCallback(
    (delta: number) => {
      // Dragging up (negative delta) increases bottom height
      const nextHeight = startBottomHeightRef.current - delta;
      const minHeight = 100;
      const maxHeight = Math.max(minHeight, window.innerHeight - 300);
      setRightPanelBottomHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    },
    [setRightPanelBottomHeight],
  );

  const handleRightBottomNudge = useCallback(
    (direction: -1 | 1) => {
      const nextHeight = rightPanelBottomHeight - direction * 20;
      const minHeight = 100;
      const maxHeight = Math.max(minHeight, window.innerHeight - 300);
      setRightPanelBottomHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    },
    [rightPanelBottomHeight, setRightPanelBottomHeight],
  );

  // Resize console (horizontal divider)
  const handleConsoleDragStart = useCallback(() => {
    startConsoleHeightRef.current = consoleHeight;
  }, [consoleHeight]);

  const handleConsoleDrag = useCallback(
    (delta: number) => {
      // Dragging up (negative delta) increases console height
      const nextHeight = startConsoleHeightRef.current - delta;
      const minHeight = 70;
      const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.65));
      setConsoleHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    },
    [setConsoleHeight],
  );

  const handleConsoleNudge = useCallback(
    (direction: -1 | 1) => {
      const nextHeight = consoleHeight - direction * 20;
      const minHeight = 70;
      const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.65));
      setConsoleHeight(Math.max(minHeight, Math.min(maxHeight, nextHeight)));
    },
    [consoleHeight, setConsoleHeight],
  );

  // Responsive window resize auto-clamping
  useEffect(() => {
    const handleWindowResize = () => {
      const maxRightWidth = Math.max(260, window.innerWidth - 300);
      if (rightPanelWidth > maxRightWidth) {
        setRightPanelWidth(maxRightWidth);
      }
      const maxConsole = Math.floor(window.innerHeight * 0.65);
      if (consoleHeight > maxConsole) {
        setConsoleHeight(maxConsole);
      }
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [rightPanelWidth, consoleHeight, setRightPanelWidth, setConsoleHeight]);

  const isConsoleVisible = useUIStore((state) => state.isConsoleVisible);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-fg">
      <Toolbar />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <CodeEditor />
        </div>

        {isRightPanelVisible && (
          <>
            <ResizeHandle
              direction="vertical"
              onDragStart={handleRightPanelDragStart}
              onDrag={handleRightPanelDrag}
              onReset={() => setRightPanelWidth(420)}
              onNudge={handleRightPanelNudge}
              title="Resize editor and right panel • Double-click to reset"
            />

            <div style={{ width: `${rightPanelWidth}px` }} className="flex shrink-0 flex-col min-w-0">
              <div className="min-h-0 flex-1">
                <Tabs tabs={TOP_RIGHT_TABS} defaultTabId="ast">
                  {(activeTabId) => {
                    if (activeTabId === "ast") return <AstViewerPanel />;
                    if (activeTabId === "stack") return <StackPanel />;
                    return <VisualizationPanel />;
                  }}
                </Tabs>
              </div>

              <ResizeHandle
                direction="horizontal"
                onDragStart={handleRightBottomDragStart}
                onDrag={handleRightBottomDrag}
                onReset={() => setRightPanelBottomHeight(256)}
                onNudge={handleRightBottomNudge}
                title="Resize visualization and variables/memory • Double-click to reset"
              />

              <div style={{ height: `${rightPanelBottomHeight}px` }} className="flex shrink-0">
                <div className="min-w-0 flex-1 border-r border-border">
                  <VariablePanel />
                </div>
                <div className="min-w-0 flex-1">
                  <MemoryPanel />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ExplanationPanel />

      {isConsoleVisible && (
        <ResizeHandle
          direction="horizontal"
          onDragStart={handleConsoleDragStart}
          onDrag={handleConsoleDrag}
          onReset={() => setConsoleHeight(160)}
          onNudge={handleConsoleNudge}
          title="Resize console • Double-click to reset"
        />
      )}

      <ConsolePanel />

      <ErrorDialog />
      <Toast />
    </div>
  );
}
