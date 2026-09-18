import { describe, it, expect, beforeEach } from "vitest";
import {
  routeBezier,
  routeOutwardLoop,
  routeSelfLoop,
  routeDirect,
  routeConnector,
  getStatusColor,
  getStatusDash,
  getMarkerId,
} from "../../../src/visualization/connectors/connectorRouting";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { diffExecutionSteps } from "../../../src/visualization/diff/structureDiff";
import { layoutArrayStructures } from "../../../src/visualization/layout/arrayLayout";
import { layoutPointerGraph } from "../../../src/visualization/layout/pointerGraphLayout";
import { useVisualizationStore } from "../../../src/state/visualizationStore";
import type { ExecutionStep, HeapBlock, StackFrame } from "../../../src/execution/models/executionTypes";
import type { StructureGraph, StructureNode } from "../../../src/visualization/models/structureTypes";

describe("Phase 6 — Data Structure Visualization Architecture", () => {
  beforeEach(() => {
    useVisualizationStore.getState().resetVisualization();
  });

  // ==========================================
  // 1. CONNECTOR ROUTING ENGINE
  // ==========================================
  describe("Connector Routing Engine", () => {
    it("generates correct cubic bezier paths for inter-column connections", () => {
      const path = routeBezier(100, 50, 300, 150);
      expect(path).toMatch(/^M 100 50 C \d+ 50, \d+ 150, 300 150$/);
      expect(path).toContain("M 100 50");
      expect(path).toContain("300 150");
    });

    it("generates tiered outward loop paths preventing card body collisions", () => {
      const loop0 = routeOutwardLoop(150, 40, 150, 120, 0);
      const loop1 = routeOutwardLoop(150, 40, 150, 120, 1);

      expect(loop0).toContain("M 150 40 C");
      expect(loop0).toContain("150 120");
      expect(loop1).toContain("M 150 40 C");

      // Tier 1 should have a strictly larger outward arch than Tier 0
      const offset0Match = loop0.match(/C (\d+) 40/);
      const offset1Match = loop1.match(/C (\d+) 40/);
      expect(offset0Match).not.toBeNull();
      expect(offset1Match).not.toBeNull();
      expect(Number(offset1Match![1])).toBeGreaterThan(Number(offset0Match![1]));
    });

    it("generates self-loop paths for pointers pointing to themselves or same coordinate", () => {
      const selfLoop = routeSelfLoop(150, 80, 0);
      expect(selfLoop).toContain("M 150 74");
      expect(selfLoop).toContain("150 86");

      // routeOutwardLoop delegates to self-loop when dy < 4
      const autoSelf = routeOutwardLoop(150, 80, 150, 81, 0);
      expect(autoSelf).toContain("M 150 74");
    });

    it("generates direct straight line paths", () => {
      const direct = routeDirect(10, 20, 50, 60);
      expect(direct).toBe("M 10 20 L 50 60");
    });

    it("routeConnector helper routes to appropriate style", () => {
      expect(routeConnector(0, 0, 10, 10, "direct")).toBe("M 0 0 L 10 10");
      expect(routeConnector(0, 0, 10, 10, "bezier")).toContain("C");
    });

    it("returns consistent colors, dashes, and markers across link statuses", () => {
      expect(getStatusColor("valid")).toBe("var(--color-accent)");
      expect(getStatusColor("null")).toBe("var(--color-fg-muted)");
      expect(getStatusColor("freed")).toBe("var(--color-danger)");

      expect(getStatusDash("valid")).toBeUndefined();
      expect(getStatusDash("freed")).toBe("6 4");

      expect(getMarkerId("valid")).toBe("arrow-valid");
      expect(getMarkerId("null")).toBe("arrow-null");
      expect(getMarkerId("freed")).toBe("arrow-danger");
    });
  });

  // ==========================================
  // 2. STRUCTURE DETECTION & EXTRACTION
  // ==========================================
  describe("Structure Detection Engine", () => {
    it("handles null steps gracefully without throwing", () => {
      const result = extractStructureGraph(null);
      expect(result.structures).toEqual([]);
      expect(result.changes).toEqual([]);
    });

    it("extracts stack arrays with slots and slot addresses", () => {
      const dummyFrame: StackFrame = {
        functionName: "main",
        callDepth: 1,
        line: 5,
        parameters: {},
        locals: {
          arr: {
            kind: "array",
            type: "int[3]",
            address: { space: "stack", id: 1, slot: 0 },
            length: 3,
            values: [
              { kind: "scalar", type: "int", value: 10 },
              { kind: "scalar", type: "int", value: 20 },
              { kind: "scalar", type: "int", value: 30 },
            ],
          },
        },
        addresses: {
          arr: { space: "stack", id: 1, slot: 0 },
        },
        isActive: true,
      };

      const dummyStep: ExecutionStep = {
        line: 5,
        column: 1,
        endLine: 5,
        endColumn: 10,
        astNodeType: "expression_statement",
        functionName: "main",
        callDepth: 1,
        description: "arr declaration",
        variables: {},
        callStack: [dummyFrame],
        heap: [],
        pointerView: {
          relationships: [],
          stackVariables: [],
          heapBlocks: [],
        },
      };

      const graph = extractStructureGraph(dummyStep);
      const arrayStruct = graph.structures.find((s) => s.kind === "array");
      expect(arrayStruct).toBeDefined();
      expect(arrayStruct?.name).toBe("Array: arr");

      const node = arrayStruct?.nodes[0];
      expect(node?.label).toBe("arr");
      expect(node?.slots).toHaveLength(3);
      expect(node?.slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
      expect(node?.slots[0].address).toEqual({ space: "stack", id: 1, slot: 0 });
      expect(node?.slots[2].address).toEqual({ space: "stack", id: 1, slot: 2 });
    });

    it("extracts multi-slot heap allocations as dynamic arrays", () => {
      const dummyHeap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 4,
          byteSize: 16,
          active: true,
          origin: "calloc",
          values: [
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
          ],
        },
      ];

      const dummyStep: ExecutionStep = {
        line: 8,
        column: 1,
        endLine: 8,
        endColumn: 10,
        astNodeType: "declaration",
        functionName: "main",
        callDepth: 1,
        description: "calloc allocation",
        variables: {},
        callStack: [],
        heap: dummyHeap,
        pointerView: {
          relationships: [],
          stackVariables: [],
          heapBlocks: dummyHeap,
        },
      };

      const graph = extractStructureGraph(dummyStep);
      const heapArray = graph.structures.find((s) => s.id.startsWith("heap-array:"));
      expect(heapArray).toBeDefined();
      expect(heapArray?.nodes[0].slots).toHaveLength(4);
      expect(heapArray?.nodes[0].slots[3].address).toEqual({ space: "heap", id: 1, slot: 3 });
    });

    it("extracts pointer relationships into structured links", () => {
      const dummyStep: ExecutionStep = {
        line: 10,
        column: 1,
        endLine: 10,
        endColumn: 15,
        astNodeType: "pointer_expression",
        functionName: "main",
        callDepth: 1,
        description: "p = &x",
        variables: {},
        callStack: [],
        heap: [],
        pointerView: {
          stackVariables: [
            {
              name: "x",
              address: { space: "stack", id: 1, slot: 0 },
              value: { kind: "scalar", type: "int", value: 42 },
              isArray: false,
            },
            {
              name: "p",
              address: { space: "stack", id: 2, slot: 0 },
              value: { kind: "pointer", type: "int*", target: { space: "stack", id: 1, slot: 0 } },
              isArray: false,
            },
          ],
          heapBlocks: [],
          relationships: [
            {
              pointerName: "p",
              pointerAddress: { space: "stack", id: 2, slot: 0 },
              targetAddress: { space: "stack", id: 1, slot: 0 },
              targetName: "x",
              targetRegion: "stack",
              status: "valid",
              chainDepth: 0,
            },
          ],
        },
      };

      const graph = extractStructureGraph(dummyStep);
      const ptrStruct = graph.structures.find((s) => s.kind === "pointer-graph");
      expect(ptrStruct).toBeDefined();
      expect(ptrStruct?.links).toHaveLength(1);

      const link = ptrStruct?.links[0];
      expect(link?.sourceNodeId).toBe("stack:p");
      expect(link?.targetNodeId).toBe("stack:x");
      expect(link?.status).toBe("valid");
      expect(link?.routingStyle).toBe("outward-loop");
    });
  });

  // ==========================================
  // 3. STEP-TO-STEP STRUCTURAL DIFFING
  // ==========================================
  describe("Structural Diffing Engine", () => {
    it("detects array slot mutations and marks highlights", () => {
      const step1: ExecutionStep = {
        line: 5,
        column: 1,
        endLine: 5,
        endColumn: 10,
        astNodeType: "declaration",
        functionName: "main",
        callDepth: 1,
        description: "init arr",
        variables: {},
        callStack: [
          {
            functionName: "main",
            callDepth: 1,
            line: 5,
            parameters: {},
            locals: {
              arr: {
                kind: "array",
                type: "int[3]",
                address: { space: "stack", id: 1, slot: 0 },
                length: 3,
                values: [
                  { kind: "scalar", type: "int", value: 10 },
                  { kind: "scalar", type: "int", value: 20 },
                  { kind: "scalar", type: "int", value: 30 },
                ],
              },
            },
            addresses: { arr: { space: "stack", id: 1, slot: 0 } },
            isActive: true,
          },
        ],
        heap: [],
        pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
      };

      const step2: ExecutionStep = {
        ...step1,
        line: 6,
        description: "arr[1] = 99",
        callStack: [
          {
            ...step1.callStack[0],
            locals: {
              arr: {
                kind: "array",
                type: "int[3]",
                address: { space: "stack", id: 1, slot: 0 },
                length: 3,
                values: [
                  { kind: "scalar", type: "int", value: 10 },
                  { kind: "scalar", type: "int", value: 99 },
                  { kind: "scalar", type: "int", value: 30 },
                ],
              },
            },
          },
        ],
      };

      const graph = extractStructureGraph(step2);
      const changes = diffExecutionSteps(step1, step2, graph);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("write");
      expect(changes[0].slotIndex).toBe(1);
      expect(changes[0].description).toContain("Written arr[1] = 99");

      // Verify visual highlight was applied to graph
      const arrNode = graph.structures[0].nodes[0];
      expect(arrNode.highlight).toBe("write");
      expect(arrNode.slots[1].highlight).toBe("write");
      expect(arrNode.slots[0].highlight).toBe("none");
    });

    it("detects heap block allocations and deallocations", () => {
      const stepBefore: ExecutionStep = {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 1,
        astNodeType: "expression",
        functionName: "main",
        callDepth: 1,
        description: "before alloc",
        variables: {},
        callStack: [],
        heap: [],
        pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
      };

      const stepAlloc: ExecutionStep = {
        ...stepBefore,
        line: 2,
        description: "malloc",
        heap: [
          {
            address: { space: "heap", id: 1, slot: 0 },
            slotCount: 1,
            byteSize: 4,
            active: true,
            origin: "malloc",
            values: [{ kind: "scalar", type: "int", value: 0 }],
          },
        ],
      };

      const gAlloc = extractStructureGraph(stepAlloc);
      const allocChanges = diffExecutionSteps(stepBefore, stepAlloc, gAlloc);
      expect(allocChanges.some((c) => c.type === "allocate")).toBe(true);

      const stepFree: ExecutionStep = {
        ...stepAlloc,
        line: 3,
        description: "free",
        heap: [
          {
            ...stepAlloc.heap[0],
            active: false,
          },
        ],
      };

      const gFree = extractStructureGraph(stepFree);
      const freeChanges = diffExecutionSteps(stepAlloc, stepFree, gFree);
      expect(freeChanges.some((c) => c.type === "deallocate")).toBe(true);
    });

    it("detects pointer redirection and unlink events", () => {
      const stepPtoX: ExecutionStep = {
        line: 5,
        column: 1,
        endLine: 5,
        endColumn: 10,
        astNodeType: "assignment_expression",
        functionName: "main",
        callDepth: 1,
        description: "p = &x",
        variables: {},
        callStack: [],
        heap: [],
        pointerView: {
          stackVariables: [],
          heapBlocks: [],
          relationships: [
            {
              pointerName: "p",
              pointerAddress: { space: "stack", id: 2, slot: 0 },
              targetAddress: { space: "stack", id: 1, slot: 0 },
              targetName: "x",
              targetRegion: "stack",
              status: "valid",
              chainDepth: 0,
            },
          ],
        },
      };

      const stepPtoNull: ExecutionStep = {
        ...stepPtoX,
        line: 6,
        description: "p = NULL",
        pointerView: {
          ...stepPtoX.pointerView,
          relationships: [
            {
              pointerName: "p",
              pointerAddress: { space: "stack", id: 2, slot: 0 },
              targetAddress: null,
              targetName: null,
              targetRegion: "none",
              status: "null",
              chainDepth: 0,
            },
          ],
        },
      };

      const g = extractStructureGraph(stepPtoNull);
      const changes = diffExecutionSteps(stepPtoX, stepPtoNull, g);
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("unlink");
      expect(changes[0].description).toContain("reset to NULL");
    });
  });

  // ==========================================
  // 4. LAYOUT ADAPTERS
  // ==========================================
  describe("Layout Adapters", () => {
    it("computes non-overlapping coordinates for array structures", () => {
      const nodeA: StructureNode = {
        id: "arr1",
        kind: "array",
        label: "arr1",
        address: { space: "stack", id: 1, slot: 0 },
        type: "int[3]",
        slots: [
          { index: 0, value: { kind: "scalar", type: "int", value: 1 }, address: { space: "stack", id: 1, slot: 0 } },
          { index: 1, value: { kind: "scalar", type: "int", value: 2 }, address: { space: "stack", id: 1, slot: 1 } },
          { index: 2, value: { kind: "scalar", type: "int", value: 3 }, address: { space: "stack", id: 1, slot: 2 } },
        ],
      };

      const nodeB: StructureNode = {
        id: "arr2",
        kind: "array",
        label: "arr2",
        address: { space: "stack", id: 2, slot: 0 },
        type: "int[2]",
        slots: [
          { index: 0, value: { kind: "scalar", type: "int", value: 10 }, address: { space: "stack", id: 2, slot: 0 } },
          { index: 1, value: { kind: "scalar", type: "int", value: 20 }, address: { space: "stack", id: 2, slot: 1 } },
        ],
      };

      const layout = layoutArrayStructures([nodeA, nodeB]);
      expect(layout.placedNodes).toHaveLength(2);
      expect(layout.placedNodes[0].y + layout.placedNodes[0].h).toBeLessThan(layout.placedNodes[1].y);
      expect(layout.width).toBeGreaterThan(150);
      expect(layout.height).toBeGreaterThan(layout.placedNodes[1].y);
    });

    it("computes pointer graph layout with separate stack and heap columns", () => {
      const stackNode: StructureNode = {
        id: "stack:p",
        kind: "pointer-graph",
        label: "p",
        address: { space: "stack", id: 1, slot: 0 },
        type: "int*",
        slots: [{ index: 0, value: { kind: "pointer", type: "int*", target: { space: "heap", id: 1, slot: 0 } }, address: { space: "stack", id: 1, slot: 0 } }],
      };

      const heapNode: StructureNode = {
        id: "heap:H001",
        kind: "pointer-graph",
        label: "H001",
        address: { space: "heap", id: 1, slot: 0 },
        type: "malloc",
        slots: [{ index: 0, value: { kind: "scalar", type: "int", value: 99 }, address: { space: "heap", id: 1, slot: 0 } }],
      };

      const link = {
        id: "link:1",
        sourceNodeId: "stack:p",
        sourceSlotIndex: 0,
        targetNodeId: "heap:H001",
        targetSlotIndex: 0,
        targetAddress: { space: "heap", id: 1, slot: 0 } as const,
        status: "valid" as const,
        routingStyle: "bezier" as const,
      };

      const result = layoutPointerGraph([stackNode, heapNode], [link]);
      expect(result.stackNodes).toHaveLength(1);
      expect(result.heapNodes).toHaveLength(1);
      expect(result.heapNodes[0].x).toBeGreaterThan(result.stackNodes[0].x + result.stackNodes[0].w);
      expect(result.placedLinks).toHaveLength(1);
      expect(result.placedLinks[0].pathD).toContain("C");
    });
  });

  // ==========================================
  // 5. VISUALIZATION STORE INTEGRATION
  // ==========================================
  describe("Visualization Store", () => {
    it("manages node selection and slot selection", () => {
      const store = useVisualizationStore.getState();
      expect(store.selectedNodeId).toBeNull();
      expect(store.selectedSlotIndex).toBeNull();

      store.setSelectedNode("stack:arr", 2);
      expect(useVisualizationStore.getState().selectedNodeId).toBe("stack:arr");
      expect(useVisualizationStore.getState().selectedSlotIndex).toBe(2);

      store.setStructureFilter("array");
      expect(useVisualizationStore.getState().structureFilter).toBe("array");

      store.resetVisualization();
      expect(useVisualizationStore.getState().selectedNodeId).toBeNull();
      expect(useVisualizationStore.getState().structureFilter).toBe("all");
    });
  });
});
