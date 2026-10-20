import { describe, it, expect } from "vitest";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { detectGraphModels } from "../../../src/visualization/detectors/graphDetector";
import { layoutGraphStructures, GRAPH_NODE_W, GRAPH_NODE_H } from "../../../src/visualization/layout/graphLayout";
import { graphModelToStructureItem, type GraphModel } from "../../../src/visualization/models/graphTypes";
import type {
  ExecutionStep,
  StackFrame,
  HeapBlock,
  ExecutionValue,
} from "../../../src/execution/models/executionTypes";

function makeStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  const defaultFrame: StackFrame = {
    functionName: "main",
    callDepth: 1,
    line: 1,
    parameters: {},
    locals: {},
    addresses: {},
    isActive: true,
  };

  return {
    line: 1,
    column: 0,
    endLine: 1,
    endColumn: 10,
    astNodeType: "expression_statement",
    functionName: "main",
    callDepth: 1,
    description: "test step",
    variables: {},
    callStack: [defaultFrame],
    heap: [],
    pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    stepAccesses: [],
    ...overrides,
  };
}

describe("Phase 6.5 V1: Graph Visualization Foundation Unit Tests", () => {
  // -------------------------------------------------------------------------
  // 1. Normalized GraphModel & Conversion
  // -------------------------------------------------------------------------
  describe("Normalized GraphModel", () => {
    it("converts a GraphModel into a StructureItem of kind 'graph'", () => {
      const model: GraphModel = {
        id: "test_graph",
        name: "Test Graph",
        directed: true,
        representation: "pointer-based",
        nodes: [
          { id: "A", label: "Node A", value: 10 },
          { id: "B", label: "Node B", value: 20 },
        ],
        edges: [
          { id: "e1", source: "A", target: "B", directed: true, label: "next" },
        ],
        metadata: { representationBadge: "Representation: Pointer Graph" },
      };

      const item = graphModelToStructureItem(model);
      expect(item.id).toBe("graph:test_graph");
      expect(item.kind).toBe("graph");
      expect(item.nodes).toHaveLength(2);
      expect(item.nodes[0].label).toBe("Node A");
      expect(item.nodes[0].slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
      expect(item.links).toHaveLength(1);
      expect(item.links[0].sourceNodeId).toBe("graph:node:A");
      expect(item.links[0].targetNodeId).toBe("graph:node:B");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Pointer Graph Detection
  // -------------------------------------------------------------------------
  describe("Pointer Graph Detection", () => {
    it("detects shared destination graph: A -> B, A -> C, B -> D, C -> D", () => {
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 3,
          byteSize: 12,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 1 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 2, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 2 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 3, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 3 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 4, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 4 },
            { kind: "pointer", type: "struct Node*", target: null },
          ],
        },
      ];

      const step = makeStep({
        heap,
        pointerView: {
          stackVariables: [
            { name: "a", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
            { name: "b", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
            { name: "c", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
            { name: "d", address: { space: "stack", id: 1, slot: 3 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } } },
          ],
          heapBlocks: heap,
          relationships: [
            {
              pointerName: "H001->left",
              pointerAddress: { space: "heap", id: 1, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 2, slot: 0 },
              targetName: "H002",
              status: "valid",
              fieldName: "left",
            },
            {
              pointerName: "H001->right",
              pointerAddress: { space: "heap", id: 1, slot: 2 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 3, slot: 0 },
              targetName: "H003",
              status: "valid",
              fieldName: "right",
            },
            {
              pointerName: "H002->next",
              pointerAddress: { space: "heap", id: 2, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 4, slot: 0 },
              targetName: "H004",
              status: "valid",
              fieldName: "next",
            },
            {
              pointerName: "H003->next",
              pointerAddress: { space: "heap", id: 3, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 4, slot: 0 },
              targetName: "H004",
              status: "valid",
              fieldName: "next",
            },
          ],
        },
      });

      const models = detectGraphModels(step);
      expect(models.length).toBeGreaterThan(0);
      const graph = models.find((m) => m.representation === "pointer-based");
      expect(graph).toBeDefined();
      expect(graph!.nodes).toHaveLength(4);
      expect(graph!.edges).toHaveLength(4);
      expect(graph!.metadata?.representationBadge).toBe("Representation: Pointer Graph");
    });

    it("detects directed cycle: A -> B -> C -> A", () => {
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 10 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 2, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 20 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 3, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 30 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } }, // Cycle back to 1
          ],
        },
      ];

      const step = makeStep({
        heap,
        pointerView: {
          stackVariables: [
            { name: "a", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
            { name: "b", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
            { name: "c", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
          ],
          heapBlocks: heap,
          relationships: [
            {
              pointerName: "H001->next",
              pointerAddress: { space: "heap", id: 1, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 2, slot: 0 },
              targetName: "H002",
              status: "valid",
              fieldName: "next",
            },
            {
              pointerName: "H002->next",
              pointerAddress: { space: "heap", id: 2, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 3, slot: 0 },
              targetName: "H003",
              status: "valid",
              fieldName: "next",
            },
            {
              pointerName: "H003->next",
              pointerAddress: { space: "heap", id: 3, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 1, slot: 0 },
              targetName: "H001",
              status: "valid",
              fieldName: "next",
            },
          ],
        },
      });

      const models = detectGraphModels(step);
      expect(models.length).toBeGreaterThan(0);
      const graph = models.find((m) => m.representation === "pointer-based");
      expect(graph).toBeDefined();
      expect(graph!.nodes).toHaveLength(3);
      expect(graph!.edges).toHaveLength(3);
      expect(graph!.metadata?.hasCycles).toBe(true);
    });

    it("detects self-loop: A -> A", () => {
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 42 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
          ],
        },
      ];

      const step = makeStep({
        heap,
        pointerView: {
          stackVariables: [
            { name: "node", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          ],
          heapBlocks: heap,
          relationships: [
            {
              pointerName: "H001->next",
              pointerAddress: { space: "heap", id: 1, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 1, slot: 0 },
              targetName: "H001",
              status: "valid",
              fieldName: "next",
            },
          ],
        },
      });

      const models = detectGraphModels(step);
      expect(models.length).toBeGreaterThan(0);
      const graph = models.find((m) => m.representation === "pointer-based");
      expect(graph).toBeDefined();
      expect(graph!.nodes).toHaveLength(1);
      expect(graph!.edges).toHaveLength(1);
      expect(graph!.metadata?.hasSelfLoops).toBe(true);
    });

    it("detects disconnected components: (A -> B) and (C -> D)", () => {
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 1 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 2, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [{ kind: "scalar", type: "int", value: 2 }, { kind: "pointer", type: "struct Node*", target: null }],
        },
        {
          address: { space: "heap", id: 3, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 3 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 4, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [{ kind: "scalar", type: "int", value: 4 }, { kind: "pointer", type: "struct Node*", target: null }],
        },
      ];

      const step = makeStep({
        heap,
        pointerView: {
          stackVariables: [
            { name: "a", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
            { name: "c", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
          ],
          heapBlocks: heap,
          relationships: [
            {
              pointerName: "H001->next",
              pointerAddress: { space: "heap", id: 1, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 2, slot: 0 },
              targetName: "H002",
              status: "valid",
              fieldName: "next",
            },
            {
              pointerName: "H003->next",
              pointerAddress: { space: "heap", id: 3, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 4, slot: 0 },
              targetName: "H004",
              status: "valid",
              fieldName: "next",
            },
          ],
        },
      });

      const models = detectGraphModels(step);
      expect(models.length).toBeGreaterThan(0);
      const graph = models.find((m) => m.representation === "pointer-based");
      expect(graph).toBeDefined();
      expect(graph!.nodes).toHaveLength(4);
      expect(graph!.edges).toHaveLength(2);
      expect(graph!.metadata?.componentCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Adjacency Matrix Detection
  // -------------------------------------------------------------------------
  describe("Adjacency Matrix Detection", () => {
    it("detects 4x4 adjacency matrix from 2D array", () => {
      const matrixVal: ExecutionValue = {
        kind: "array",
        type: "int[4][4]",
        length: 16,
        dimensions: [4, 4],
        values: [
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 0 },

          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 0 },

          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 1 },

          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      };

      const step = makeStep({
        callStack: [
          {
            functionName: "main",
            callDepth: 1,
            line: 10,
            parameters: {},
            locals: {
              graph: matrixVal,
            },
            addresses: {
              graph: { space: "stack", id: 1, slot: 0 },
            },
            isActive: true,
          },
        ],
      });

      const models = detectGraphModels(step);
      expect(models.length).toBeGreaterThan(0);
      const matrixGraph = models.find((m) => m.representation === "adjacency-matrix");
      expect(matrixGraph).toBeDefined();
      expect(matrixGraph!.nodes).toHaveLength(4);
      // Row 0 has 2 edges, Row 1 has 2 edges, Row 2 has 3 edges, Row 3 has 1 edge = 8 edges
      expect(matrixGraph!.edges).toHaveLength(8);
      expect(matrixGraph!.metadata?.representationBadge).toBe("Representation: Adjacency Matrix");

      // Verify extractStructureGraph replaces the raw array with a graph StructureItem
      const structGraph = extractStructureGraph(step);
      expect(structGraph.structures.some((s) => s.kind === "graph")).toBe(true);
      expect(structGraph.structures.some((s) => s.id === "array:graph")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Adjacency List Detection
  // -------------------------------------------------------------------------
  describe("Adjacency List Detection", () => {
    it("detects adjacency list array of pointer heads", () => {
      // 3 vertices: 0 -> 1, 1 -> 2, 2 -> 0
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 1 }, // target vertex 1
            { kind: "pointer", type: "struct Node*", target: null },
          ],
        },
        {
          address: { space: "heap", id: 2, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 2 }, // target vertex 2
            { kind: "pointer", type: "struct Node*", target: null },
          ],
        },
        {
          address: { space: "heap", id: 3, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 0 }, // target vertex 0
            { kind: "pointer", type: "struct Node*", target: null },
          ],
        },
      ];

      const adjListVal: ExecutionValue = {
        kind: "array",
        type: "struct Node*[3]",
        length: 3,
        values: [
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } },
        ],
      };

      const step = makeStep({
        heap,
        callStack: [
          {
            functionName: "main",
            callDepth: 1,
            line: 5,
            parameters: {},
            locals: {
              adj: adjListVal,
            },
            addresses: {
              adj: { space: "stack", id: 1, slot: 0 },
            },
            isActive: true,
          },
        ],
      });

      const models = detectGraphModels(step);
      expect(models.length).toBeGreaterThan(0);
      const listGraph = models.find((m) => m.representation === "adjacency-list");
      expect(listGraph).toBeDefined();
      expect(listGraph!.nodes).toHaveLength(3);
      expect(listGraph!.edges).toHaveLength(3);
      expect(listGraph!.metadata?.representationBadge).toBe("Representation: Adjacency List");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Structure Non-Classification Regressions
  // -------------------------------------------------------------------------
  describe("Structure Non-Classification Regressions", () => {
    it("preserves ordinary linear linked list and does NOT classify it as graph", () => {
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 10 },
            { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 2, slot: 0 },
          slotCount: 2,
          byteSize: 8,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 20 },
            { kind: "pointer", type: "struct Node*", target: null },
          ],
        },
      ];

      const step = makeStep({
        heap,
        callStack: [
          {
            functionName: "main",
            callDepth: 1,
            line: 1,
            parameters: {},
            locals: {
              head: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
            },
            addresses: { head: { space: "stack", id: 1, slot: 0 } },
            isActive: true,
          },
        ],
        pointerView: {
          stackVariables: [
            { name: "head", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          ],
          heapBlocks: heap,
          relationships: [
            {
              pointerName: "H001->next",
              pointerAddress: { space: "heap", id: 1, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 2, slot: 0 },
              targetName: "H002",
              status: "valid",
              fieldName: "next",
            },
            {
              pointerName: "H002->next",
              pointerAddress: { space: "heap", id: 2, slot: 1 },
              targetRegion: "null",
              targetAddress: null,
              targetName: "NULL",
              status: "null",
              fieldName: "next",
            },
          ],
        },
      });

      const models = detectGraphModels(step);
      expect(models.some((m) => m.representation === "pointer-based")).toBe(false);

      const graph = extractStructureGraph(step);
      expect(graph.structures.some((s) => s.kind === "linked-list")).toBe(true);
      expect(graph.structures.some((s) => s.kind === "graph")).toBe(false);
    });

    it("preserves binary tree and does NOT classify it as graph", () => {
      const heap: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 3,
          byteSize: 12,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 10 },
            { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
            { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 3, slot: 0 } },
          ],
        },
        {
          address: { space: "heap", id: 2, slot: 0 },
          slotCount: 3,
          byteSize: 12,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 5 },
            { kind: "pointer", type: "struct TreeNode*", target: null },
            { kind: "pointer", type: "struct TreeNode*", target: null },
          ],
        },
        {
          address: { space: "heap", id: 3, slot: 0 },
          slotCount: 3,
          byteSize: 12,
          active: true,
          origin: "malloc",
          values: [
            { kind: "scalar", type: "int", value: 15 },
            { kind: "pointer", type: "struct TreeNode*", target: null },
            { kind: "pointer", type: "struct TreeNode*", target: null },
          ],
        },
      ];

      const step = makeStep({
        heap,
        callStack: [
          {
            functionName: "main",
            callDepth: 1,
            line: 1,
            parameters: {},
            locals: {
              root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
            },
            addresses: { root: { space: "stack", id: 1, slot: 0 } },
            isActive: true,
          },
        ],
        pointerView: {
          stackVariables: [
            { name: "root", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } } },
          ],
          heapBlocks: heap,
          relationships: [
            {
              pointerName: "H001->left",
              pointerAddress: { space: "heap", id: 1, slot: 1 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 2, slot: 0 },
              targetName: "H002",
              status: "valid",
              fieldName: "left",
            },
            {
              pointerName: "H001->right",
              pointerAddress: { space: "heap", id: 1, slot: 2 },
              targetRegion: "heap",
              targetAddress: { space: "heap", id: 3, slot: 0 },
              targetName: "H003",
              status: "valid",
              fieldName: "right",
            },
          ],
        },
      });

      const models = detectGraphModels(step);
      expect(models.some((m) => m.representation === "pointer-based")).toBe(false);

      const graph = extractStructureGraph(step);
      expect(graph.structures.some((s) => s.kind === "tree")).toBe(true);
      expect(graph.structures.some((s) => s.kind === "graph")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Deterministic Layout & Collision Avoidance
  // -------------------------------------------------------------------------
  describe("Deterministic Graph Layout", () => {
    it("places nodes deterministically without overlapping", () => {
      const model: GraphModel = {
        id: "g1",
        name: "Test Graph",
        directed: true,
        representation: "pointer-based",
        nodes: [
          { id: "A", label: "Node A", value: 1 },
          { id: "B", label: "Node B", value: 2 },
          { id: "C", label: "Node C", value: 3 },
          { id: "D", label: "Node D", value: 4 },
        ],
        edges: [
          { id: "e1", source: "A", target: "B", directed: true },
          { id: "e2", source: "A", target: "C", directed: true },
          { id: "e3", source: "B", target: "D", directed: true },
          { id: "e4", source: "C", target: "D", directed: true },
        ],
      };

      const item = graphModelToStructureItem(model);
      const res1 = layoutGraphStructures(item.nodes, item.links, 20, 20);
      const res2 = layoutGraphStructures(item.nodes, item.links, 20, 20);

      // Determinism
      expect(res1.placedNodes).toHaveLength(4);
      expect(res1.placedLinks).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(res1.placedNodes[i].x).toBe(res2.placedNodes[i].x);
        expect(res1.placedNodes[i].y).toBe(res2.placedNodes[i].y);
      }

      // Collision avoidance: check no pair of nodes overlaps
      for (let i = 0; i < res1.placedNodes.length; i++) {
        for (let j = i + 1; j < res1.placedNodes.length; j++) {
          const n1 = res1.placedNodes[i];
          const n2 = res1.placedNodes[j];

          const overlapsX = n1.x < n2.x + n2.w && n1.x + n1.w > n2.x;
          const overlapsY = n1.y < n2.y + n2.h && n1.y + n1.h > n2.y;
          const overlaps = overlapsX && overlapsY;
          expect(overlaps).toBe(false);
        }
      }

      // Shared destination: D is placed below both B and C
      const nodeA = res1.placedNodes.find((n) => n.node.id === "graph:node:A")!;
      const nodeB = res1.placedNodes.find((n) => n.node.id === "graph:node:B")!;
      const nodeC = res1.placedNodes.find((n) => n.node.id === "graph:node:C")!;
      const nodeD = res1.placedNodes.find((n) => n.node.id === "graph:node:D")!;

      expect(nodeB.y).toBeGreaterThan(nodeA.y);
      expect(nodeC.y).toBeGreaterThan(nodeA.y);
      expect(nodeD.y).toBeGreaterThan(nodeB.y);
      expect(nodeD.y).toBeGreaterThan(nodeC.y);
    });

    it("routes self-loops safely without crashing or overlapping", () => {
      const model: GraphModel = {
        id: "self_loop",
        name: "Self Loop",
        directed: true,
        representation: "pointer-based",
        nodes: [{ id: "A", label: "Node A", value: 1 }],
        edges: [{ id: "e1", source: "A", target: "A", directed: true }],
      };

      const item = graphModelToStructureItem(model);
      const res = layoutGraphStructures(item.nodes, item.links, 20, 20);

      expect(res.placedNodes).toHaveLength(1);
      expect(res.placedLinks).toHaveLength(1);
      expect(res.placedLinks[0].pathD).toContain("M ");
      expect(res.placedLinks[0].pathD).toContain("C ");
    });
  });
});
