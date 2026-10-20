import { describe, expect, it, beforeAll, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Parser } from "web-tree-sitter";
import { getParser } from "../helpers/interpreterTestHelpers";
import { vi } from "vitest";
import type {
  ExecutionStep,
  ExecutionValue,
  HeapBlock,
  PointerRelationship,
} from "../../../src/execution/models/executionTypes";
import { detectGraphModels } from "../../../src/visualization/detectors/graphDetector";
import { layoutGraphStructures } from "../../../src/visualization/layout/graphLayout";
import { detectPointerViewGraph } from "../../../src/components/panels/pointerViewGraphLayout";

let mockTree: import("web-tree-sitter").Tree | null = null;
vi.mock("../../../src/parser/parserService", () => ({
  getCurrentTree: () => mockTree,
  getLastDiagnostics: () => [],
  initParser: () => Promise.resolve(),
  isReady: () => true,
  parseSource: () => ({
    ast: { type: "translation_unit", text: "", startPosition: { row: 0, column: 0 }, endPosition: { row: 0, column: 0 }, children: [] },
    diagnostics: [],
    parseTimeMs: 1,
    usedIncrementalParse: false,
    nodeCount: 1,
  }),
}));
vi.mock("../../../src/themes/applyTheme", () => ({
  applyTheme: vi.fn(),
  monacoThemeName: (t: string) => t,
}));
vi.mock("../../../src/components/editor/CodeEditor", () => ({
  CodeEditor: () => React.createElement("div", { "data-testid": "code-editor" }),
}));
vi.mock("../../../src/state/executionStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/state/executionStore")>();
  const customHook: any = (selector?: (s: any) => any) => {
    const s = actual.useExecutionStore.getState();
    return selector ? selector(s) : s;
  };
  customHook.getState = actual.useExecutionStore.getState;
  customHook.setState = actual.useExecutionStore.setState;
  customHook.subscribe = actual.useExecutionStore.subscribe;
  return {
    ...actual,
    useExecutionStore: customHook,
  };
});

const { runExecution, stepExecution, resetExecution, useExecutionStore } = await import("../../../src/state/executionStore");
const { DeclarationsPanel } = await import("../../../src/components/panels/DeclarationsPanel");
const { NewVisualizationPanel } = await import("../../../src/components/panels/NewVisualizationPanel");
const { default: App } = await import("../../../src/app/App");
const { useEditorStore } = await import("../../../src/state/editorStore");

let parser: InstanceType<typeof Parser>;

beforeAll(async () => {
  parser = await getParser();
});

afterEach(() => {
  mockTree?.delete();
  mockTree = null;
  resetExecution();
});

function setSource(source: string): void {
  mockTree = parser.parse(source);
  useEditorStore.getState().setCode(source);
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("waitFor timed out");
}

describe("Cleanup & Bugfix Regression Test Suite", () => {
  // 1 & 2. Global 1D & 2D array rendering in DeclarationsPanel
  it("renders global 1D and 2D arrays in DeclarationsPanel with structured representation and dimensions", async () => {
    setSource(`
      int g_vec[3] = {10, 20, 30};
      int g_mat[2][2] = {{1, 2}, {3, 4}};
      int main() {
          return 0;
      }
    `);

    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");

    const markup = renderToStaticMarkup(<DeclarationsPanel />);
    // Check Global Declarations header
    expect(markup).toContain("Global Declarations");
    // Check 1D array rendering
    expect(markup).toContain("g_vec");
    expect(markup).toContain("3 elements");
    expect(markup).toContain("[0]");
    expect(markup).toContain("10");
    expect(markup).toContain("[1]");
    expect(markup).toContain("20");
    expect(markup).toContain("[2]");
    expect(markup).toContain("30");

    // Check 2D array rendering
    expect(markup).toContain("g_mat");
    expect(markup).toContain("2 × 2 matrix (4 elements)");
    expect(markup).toContain("Row 0");
    expect(markup).toContain("Row 1");
    expect(markup).toContain("[0][0]");
    expect(markup).toContain("[0][1]");
    expect(markup).toContain("[1][0]");
    expect(markup).toContain("[1][1]");
    // Values
    expect(markup).toContain("1");
    expect(markup).toContain("2");
    expect(markup).toContain("3");
    expect(markup).toContain("4");
    // Not flattened
    expect(markup).not.toContain("{1, 2, 3, 4}");
  });

  // 3. Global array vs local array rendering consistency
  it("renders global arrays and local arrays using the same structured row/element visual format", async () => {
    setSource(`
      int g_arr[3] = {1, 2, 3};
      int main() {
          int l_arr[3] = {4, 5, 6};
          return 0;
      }
    `);

    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");

    const markup = renderToStaticMarkup(<DeclarationsPanel />);
    expect(markup).toContain("g_arr");
    expect(markup).toContain("l_arr");
    // Both render slot markers [0], [1], [2]
    expect(markup).toContain("[0]");
    expect(markup).toContain("[1]");
    expect(markup).toContain("[2]");
  });

  // 4, 5, 6. Completed -> Step, Completed -> Run again, Reset -> Run
  it("handles Completed -> Step, Completed -> Run again, and Reset -> Run without crashing", async () => {
    setSource(`
      int main() {
          int count = 5;
          return 0;
      }
    `);

    // Initial run
    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");
    expect(useExecutionStore.getState().status).toBe("completed");

    // Completed -> Step
    stepExecution();
    expect(useExecutionStore.getState().status).toBe("paused");
    expect(() => renderToStaticMarkup(<App />)).not.toThrow();

    // Completed -> Run again
    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");
    expect(useExecutionStore.getState().status).toBe("completed");
    expect(() => renderToStaticMarkup(<App />)).not.toThrow();

    // Reset -> Run
    resetExecution();
    expect(useExecutionStore.getState().status).toBe("idle");
    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");
    expect(useExecutionStore.getState().status).toBe("completed");
    expect(() => renderToStaticMarkup(<App />)).not.toThrow();
  });

  // 7. Graph cycle termination
  it("terminates safely on graph cycles without unbounded loops", () => {
    const heap: HeapBlock[] = [
      { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
      { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
      { address: { space: "heap", id: 3, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
    ];
    // 1 -> 2 -> 3 -> 1 (Cycle) plus cross edge 2 -> 1
    const relationships: PointerRelationship[] = [
      { pointerName: "H1->next", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetAddress: { space: "heap", id: 2, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
      { pointerName: "H2->next", pointerAddress: { space: "heap", id: 2, slot: 1 }, targetAddress: { space: "heap", id: 3, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
      { pointerName: "H3->next", pointerAddress: { space: "heap", id: 3, slot: 1 }, targetAddress: { space: "heap", id: 1, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
      { pointerName: "H2->extra", pointerAddress: { space: "heap", id: 2, slot: 0 }, targetAddress: { space: "heap", id: 1, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
    ];
    const stackVars = [
      { name: "root", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "Node *", target: { space: "heap", id: 1, slot: 0 } } as ExecutionValue, isArray: false },
    ];

    const start = Date.now();
    const result = detectPointerViewGraph(heap, relationships, stackVars, 200, 50, new Set());
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
    expect(result.detectedGraph).not.toBeNull();
    expect(result.allPlacedGraphNodes.length).toBe(3);
  });

  // 8. Graph self-loop handling
  it("handles self-loops safely", () => {
    const heap: HeapBlock[] = [
      { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
    ];
    // Self-loop 1 -> 1
    const relationships: PointerRelationship[] = [
      { pointerName: "H1->next", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetAddress: { space: "heap", id: 1, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
    ];
    const stackVars = [
      { name: "node", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "Node *", target: { space: "heap", id: 1, slot: 0 } } as ExecutionValue, isArray: false },
    ];

    const result = detectPointerViewGraph(heap, relationships, stackVars, 200, 50, new Set());
    expect(result.detectedGraph).not.toBeNull();
    expect(result.allPlacedGraphNodes.length).toBe(1);
  });

  // 9. Graph shared destination
  it("handles shared destination (multiple incoming edges to one node)", () => {
    const heap: HeapBlock[] = [
      { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
      { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
      { address: { space: "heap", id: 3, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [] },
    ];
    // 1 -> 3 and 2 -> 3 (shared target 3)
    const relationships: PointerRelationship[] = [
      { pointerName: "H1->next", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetAddress: { space: "heap", id: 3, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
      { pointerName: "H2->next", pointerAddress: { space: "heap", id: 2, slot: 1 }, targetAddress: { space: "heap", id: 3, slot: 0 }, targetRegion: "heap", status: "valid", chainDepth: 0 },
    ];
    const stackVars = [
      { name: "p1", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "Node *", target: { space: "heap", id: 1, slot: 0 } } as ExecutionValue, isArray: false },
      { name: "p2", address: { space: "stack", id: 2, slot: 0 }, value: { kind: "pointer", type: "Node *", target: { space: "heap", id: 2, slot: 0 } } as ExecutionValue, isArray: false },
    ];

    const result = detectPointerViewGraph(heap, relationships, stackVars, 200, 50, new Set());
    expect(result.detectedGraph).not.toBeNull();
    expect(result.allPlacedGraphNodes.length).toBe(3);
  });

  // 10. Normal 2D array not incorrectly classified as graph
  it("does not classify normal 2D binary matrix 'arr' or 'matrix' as a graph", () => {
    const normalMatrixVal: ExecutionValue = {
      kind: "array",
      type: "int[4][4]",
      length: 16,
      dimensions: [4, 4],
      values: [
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
      ],
    };

    const stepWithArr: ExecutionStep = {
      line: 1,
      column: 0,
      endLine: 1,
      endColumn: 20,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "normal array",
      variables: {},
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 1,
          parameters: {},
          locals: {
            arr: normalMatrixVal,
          },
          addresses: {
            arr: { space: "stack", id: 1, slot: 0 },
          },
          isActive: true,
        },
      ],
      heap: [],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
      stepAccesses: [],
    };

    const modelsArr = detectGraphModels(stepWithArr);
    expect(modelsArr.some((m) => m.representation === "adjacency-matrix")).toBe(false);

    // Also test 'matrix'
    const stepWithMatrix: ExecutionStep = {
      ...stepWithArr,
      callStack: [
        {
          ...stepWithArr.callStack[0],
          locals: {
            matrix: normalMatrixVal,
          },
        },
      ],
    };
    const modelsMatrix = detectGraphModels(stepWithMatrix);
    expect(modelsMatrix.some((m) => m.representation === "adjacency-matrix")).toBe(false);

    // But if named 'adjMatrix' or 'graph', it qualifies
    const stepWithGraph: ExecutionStep = {
      ...stepWithArr,
      callStack: [
        {
          ...stepWithArr.callStack[0],
          locals: {
            adjMatrix: normalMatrixVal,
          },
        },
      ],
    };
    const modelsGraph = detectGraphModels(stepWithGraph);
    expect(modelsGraph.some((m) => m.representation === "adjacency-matrix")).toBe(true);
  });

  // 8. Hook ordering stability across execution state transitions
  it("renders NewVisualizationPanel and DeclarationsPanel across idle, active, and completed transitions without throwing", async () => {
    // 1. Initial idle state (currentStep = null)
    useExecutionStore.setState({ status: "idle", currentStep: null });
    expect(() => renderToStaticMarkup(<DeclarationsPanel />)).not.toThrow();
    expect(() => renderToStaticMarkup(<NewVisualizationPanel />)).not.toThrow();

    // 2. Active execution with graph & variables
    setSource(`
      int main() {
          int adjMatrix[3][3] = {{0, 1, 0}, {1, 0, 1}, {0, 1, 0}};
          return 0;
      }
    `);
    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");

    // 3. Render DeclarationsPanel & NewVisualizationPanel with completed step
    expect(() => renderToStaticMarkup(<DeclarationsPanel />)).not.toThrow();
    expect(() => renderToStaticMarkup(<NewVisualizationPanel />)).not.toThrow();

    // 4. Reset execution back to idle (currentStep = null)
    resetExecution();
    expect(useExecutionStore.getState().currentStep).toBeNull();
    expect(() => renderToStaticMarkup(<DeclarationsPanel />)).not.toThrow();
    expect(() => renderToStaticMarkup(<NewVisualizationPanel />)).not.toThrow();

    // 5. Run again to verify re-entry
    runExecution();
    await waitFor(() => useExecutionStore.getState().status === "completed");
    expect(() => renderToStaticMarkup(<DeclarationsPanel />)).not.toThrow();
    expect(() => renderToStaticMarkup(<NewVisualizationPanel />)).not.toThrow();
  });
});
