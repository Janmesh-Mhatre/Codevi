import { describe, it, expect, beforeAll } from "vitest";
import { detectGraphModels } from "../../../src/visualization/detectors/graphDetector";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { layoutGraphStructures } from "../../../src/visualization/layout/graphLayout";
import { graphModelToStructureItem } from "../../../src/visualization/models/graphTypes";
import { detectPointerViewGraph } from "../../../src/components/panels/pointerViewGraphLayout";
import type {
  ExecutionStep,
  StackFrame,
  HeapBlock,
} from "../../../src/execution/models/executionTypes";
import { ExecutionEngine } from "../../../src/execution/engine/ExecutionEngine";
import { getParser } from "../helpers/interpreterTestHelpers";
import type { Parser } from "web-tree-sitter";

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

describe("Phase 6.5.2: Pointer-Based Graphs", () => {
  let parser: InstanceType<typeof Parser>;

  beforeAll(async () => {
    parser = await getParser();
  });

  // -------------------------------------------------------------------------
  // Test 1: Basic pointer graph: A -> B -> C
  // -------------------------------------------------------------------------
  it("Test 1: Basic pointer graph (A -> B -> C) extracts 3 nodes, 2 directed edges", () => {
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
          { kind: "pointer", type: "struct Node*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
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
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.representation).toBe("pointer-based");
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);

    // Verify node identities
    expect(graph.nodes.map((n) => n.id)).toEqual(["heap:H001", "heap:H002", "heap:H003"]);
    expect(graph.nodes.map((n) => n.label)).toEqual(["A", "B", "C"]);

    // Verify edge sources and targets
    expect(graph.edges[0].source).toBe("heap:H001");
    expect(graph.edges[0].target).toBe("heap:H002");
    expect(graph.edges[1].source).toBe("heap:H002");
    expect(graph.edges[1].target).toBe("heap:H003");

    // Integration to StructureGraph and Layout
    const item = graphModelToStructureItem(graph);
    expect(item.nodes).toHaveLength(3);
    expect(item.links).toHaveLength(2);
    const layout = layoutGraphStructures(item.nodes, item.links);
    expect(layout.placedNodes).toHaveLength(3);
    expect(layout.placedLinks).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Test 2: Multiple outgoing edges: A -> B, A -> C
  // -------------------------------------------------------------------------
  it("Test 2: Multiple outgoing edges (A -> B, A -> C) preserves all edges and distinct targets", () => {
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
        values: [{ kind: "scalar", type: "int", value: 2 }, { kind: "pointer", type: "struct Node*", target: null }],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [{ kind: "scalar", type: "int", value: 3 }, { kind: "pointer", type: "struct Node*", target: null }],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
        ],
        heapBlocks: heap,
        relationships: [
          {
            pointerName: "H001->edge1",
            pointerAddress: { space: "heap", id: 1, slot: 1 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 2, slot: 0 },
            targetName: "H002",
            status: "valid",
            fieldName: "edge1",
          },
          {
            pointerName: "H001->edge2",
            pointerAddress: { space: "heap", id: 1, slot: 2 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 3, slot: 0 },
            targetName: "H003",
            status: "valid",
            fieldName: "edge2",
          },
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);

    const aEdges = graph.edges.filter((e) => e.source === "heap:H001");
    expect(aEdges).toHaveLength(2);
    expect(aEdges.map((e) => e.target).sort()).toEqual(["heap:H002", "heap:H003"]);
  });

  // -------------------------------------------------------------------------
  // Test 3: Shared destination: A -> C, B -> C
  // -------------------------------------------------------------------------
  it("Test 3: Shared destination (A -> C, B -> C) keeps C unique with multiple incoming edges", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
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
        values: [{ kind: "scalar", type: "int", value: 30 }, { kind: "pointer", type: "struct Node*", target: null }],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
        ],
        heapBlocks: heap,
        relationships: [
          {
            pointerName: "H001->next",
            pointerAddress: { space: "heap", id: 1, slot: 1 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 3, slot: 0 },
            targetName: "H003",
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
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);

    // C must exist exactly once
    const cNodes = graph.nodes.filter((n) => n.id === "heap:H003");
    expect(cNodes).toHaveLength(1);

    // Both edges must target C
    expect(graph.edges[0].target).toBe("heap:H003");
    expect(graph.edges[1].target).toBe("heap:H003");
  });

  // -------------------------------------------------------------------------
  // Test 4: Cross-link: A -> B, A -> C, B -> C
  // -------------------------------------------------------------------------
  it("Test 4: Cross-link (A -> B, A -> C, B -> C) preserves all 3 edges without node duplication", () => {
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
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } },
        ],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [{ kind: "scalar", type: "int", value: 3 }, { kind: "pointer", type: "struct Node*", target: null }],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
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
            pointerName: "H001->cross",
            pointerAddress: { space: "heap", id: 1, slot: 2 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 3, slot: 0 },
            targetName: "H003",
            status: "valid",
            fieldName: "cross",
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
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(3);

    // Verify all 3 edges exist
    const edgePairs = graph.edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(edgePairs).toEqual([
      "heap:H001->heap:H002",
      "heap:H001->heap:H003",
      "heap:H002->heap:H003",
    ]);

    // Test A Geometric Assertions: layoutGraphStructures
    const item = graphModelToStructureItem(graph);
    const layout = layoutGraphStructures(item.nodes, item.links, 200, 50);
    const nodeB = layout.placedNodes.find((n) => n.node.id === "graph:node:heap:H002")!;
    const edgeAC = layout.placedLinks.find(
      (l) => l.link.sourceNodeId === "graph:node:heap:H001" && l.link.targetNodeId === "graph:node:heap:H003",
    )!;

    // A -> C bypasses node B on the right side
    const matchC = edgeAC.pathD.match(/C\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    expect(matchC).not.toBeNull();
    const loopX = parseFloat(matchC![1]);
    expect(loopX).toBeGreaterThan(nodeB.x + nodeB.w);

    // Test A Geometric Assertions: detectPointerViewGraph
    const pvLayout = detectPointerViewGraph(
      heap,
      step.pointerView!.relationships,
      step.pointerView!.stackVariables,
      200,
      50,
      new Set(),
    );
    expect(pvLayout.detectedGraph).not.toBeNull();
    const pvNodeB = pvLayout.allPlacedGraphNodes.find((n) => n.b.address.id === 2)!;
    const pvEdgeAC = pvLayout.detectedGraph!.graphLinks.find(
      (l) => l.sourceId === 1 && l.targetId === 3,
    )!;
    const pvMatchC = pvEdgeAC.pathD.match(/C\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    expect(pvMatchC).not.toBeNull();
    const pvLoopX = parseFloat(pvMatchC![1]);
    expect(pvLoopX).toBeGreaterThan(pvNodeB.x + pvNodeB.w);
  });

  // -------------------------------------------------------------------------
  // Test 5: Directed cycle: A -> B -> C -> A
  // -------------------------------------------------------------------------
  it("Test 5: Directed cycle (A -> B -> C -> A) terminates safely and preserves cycle closing edge", () => {
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
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
        ],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
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
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(3);
    expect(graph.metadata?.hasCycles).toBe(true);

    const closingEdge = graph.edges.find((e) => e.source === "heap:H003" && e.target === "heap:H001");
    expect(closingEdge).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 6: Self-loop: A -> A
  // -------------------------------------------------------------------------
  it("Test 6: Self-loop (A -> A) extracts exactly one node and one self-loop edge", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 99 },
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
        ],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
        ],
        heapBlocks: heap,
        relationships: [
          {
            pointerName: "H001->self",
            pointerAddress: { space: "heap", id: 1, slot: 1 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 1, slot: 0 },
            targetName: "H001",
            status: "valid",
            fieldName: "self",
          },
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(1);
    expect(graph.metadata?.hasSelfLoops).toBe(true);
    expect(graph.edges[0].source).toBe("heap:H001");
    expect(graph.edges[0].target).toBe("heap:H001");

    // Test B Geometric Assertions: layoutGraphStructures
    const item = graphModelToStructureItem(graph);
    const layout = layoutGraphStructures(item.nodes, item.links, 200, 50);
    const nodeA = layout.placedNodes.find((n) => n.node.id === "graph:node:heap:H001")!;
    const selfLink = layout.placedLinks.find(
      (l) => l.link.sourceNodeId === "graph:node:heap:H001" && l.link.targetNodeId === "graph:node:heap:H001",
    )!;

    // Loop must start and end at node bottom boundary and loop below it
    const selfMatch = selfLink.pathD.match(/M\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+C\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    expect(selfMatch).not.toBeNull();
    const startY = parseFloat(selfMatch![2]);
    const cpY = parseFloat(selfMatch![4]);
    expect(startY).toBe(nodeA.y + nodeA.h);
    expect(cpY).toBeGreaterThan(nodeA.y + nodeA.h);
    expect(selfLink.labelY!).toBeGreaterThan(nodeA.y + nodeA.h);

    // Test B Geometric Assertions: detectPointerViewGraph
    const pvLayout = detectPointerViewGraph(
      heap,
      step.pointerView!.relationships,
      step.pointerView!.stackVariables,
      200,
      50,
      new Set(),
    );
    expect(pvLayout.detectedGraph).not.toBeNull();
    const pvNodeA = pvLayout.allPlacedGraphNodes.find((n) => n.b.address.id === 1)!;
    const pvSelfLink = pvLayout.detectedGraph!.graphLinks[0];
    expect(pvSelfLink.isSelfLoop).toBe(true);
    expect(pvSelfLink.y1).toBe(pvNodeA.y + pvNodeA.h);
    expect(pvSelfLink.labelY!).toBeGreaterThan(pvNodeA.y + pvNodeA.h);
  });

  // -------------------------------------------------------------------------
  // Test 7: Disconnected components: A -> B and C -> D
  // -------------------------------------------------------------------------
  it("Test 7: Disconnected components (A -> B, C -> D) preserves all 4 nodes, both edges, and no artificial bridge", () => {
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
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
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
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(2);
    expect(graph.metadata?.componentCount).toBe(2);

    // Verify edges are strictly intra-component
    const edgeEndpoints = graph.edges.map((e) => `${e.source}->${e.target}`);
    expect(edgeEndpoints).toContain("heap:H001->heap:H002");
    expect(edgeEndpoints).toContain("heap:H003->heap:H004");
    expect(edgeEndpoints).not.toContain("heap:H001->heap:H003");
    expect(edgeEndpoints).not.toContain("heap:H002->heap:H004");
  });

  // -------------------------------------------------------------------------
  // Test 8: Multiple references to one allocation
  // -------------------------------------------------------------------------
  it("Test 8: Multiple pointer references to one allocation creates one node and multiple incoming edges", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 1 },
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } },
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
        values: [{ kind: "scalar", type: "int", value: 100 }, { kind: "pointer", type: "struct Node*", target: null }],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
          { name: "shared", address: { space: "stack", id: 1, slot: 3 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } } },
        ],
        heapBlocks: heap,
        relationships: [
          {
            pointerName: "H001->target",
            pointerAddress: { space: "heap", id: 1, slot: 1 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 4, slot: 0 },
            targetName: "H004",
            status: "valid",
            fieldName: "target",
          },
          {
            pointerName: "H002->target",
            pointerAddress: { space: "heap", id: 2, slot: 1 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 4, slot: 0 },
            targetName: "H004",
            status: "valid",
            fieldName: "target",
          },
          {
            pointerName: "H003->target",
            pointerAddress: { space: "heap", id: 3, slot: 1 },
            targetRegion: "heap",
            targetAddress: { space: "heap", id: 4, slot: 0 },
            targetName: "H004",
            status: "valid",
            fieldName: "target",
          },
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];

    // Node H004 must exist exactly once
    const nodeH4 = graph.nodes.filter((n) => n.id === "heap:H004");
    expect(nodeH4).toHaveLength(1);

    // Exactly 3 incoming edges to H004
    const incomingToH4 = graph.edges.filter((e) => e.target === "heap:H004");
    expect(incomingToH4).toHaveLength(3);
    expect(incomingToH4.map((e) => e.source).sort()).toEqual([
      "heap:H001",
      "heap:H002",
      "heap:H003",
    ]);
  });

  // -------------------------------------------------------------------------
  // Test 9: Complex graph (branching + shared + cross-link + cycle + multi-edges)
  // -------------------------------------------------------------------------
  it("Test 9: Complex graph handles branching, shared destinations, cross-links, and cycles safely", () => {
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
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 2 },
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } },
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
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } }, // Cycle back to 1
        ],
      },
    ];

    const step = makeStep({
      heap,
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
          { name: "D", address: { space: "stack", id: 1, slot: 3 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 4, slot: 0 } } },
        ],
        heapBlocks: heap,
        relationships: [
          { pointerName: "H001->e1", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 2, slot: 0 }, targetName: "H002", status: "valid", fieldName: "e1" },
          { pointerName: "H001->e2", pointerAddress: { space: "heap", id: 1, slot: 2 }, targetRegion: "heap", targetAddress: { space: "heap", id: 3, slot: 0 }, targetName: "H003", status: "valid", fieldName: "e2" },
          { pointerName: "H002->e1", pointerAddress: { space: "heap", id: 2, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 3, slot: 0 }, targetName: "H003", status: "valid", fieldName: "e1" },
          { pointerName: "H002->e2", pointerAddress: { space: "heap", id: 2, slot: 2 }, targetRegion: "heap", targetAddress: { space: "heap", id: 4, slot: 0 }, targetName: "H004", status: "valid", fieldName: "e2" },
          { pointerName: "H003->e1", pointerAddress: { space: "heap", id: 3, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 4, slot: 0 }, targetName: "H004", status: "valid", fieldName: "e1" },
          { pointerName: "H004->e1", pointerAddress: { space: "heap", id: 4, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 1, slot: 0 }, targetName: "H001", status: "valid", fieldName: "e1" },
        ],
      },
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const graph = models[0];
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(6);
    expect(graph.metadata?.hasCycles).toBe(true);

    // Verify all nodes are unique
    const uniqueNodeIds = new Set(graph.nodes.map((n) => n.id));
    expect(uniqueNodeIds.size).toBe(4);

    // Verify layout works without infinite loops
    const item = graphModelToStructureItem(graph);
    const layout = layoutGraphStructures(item.nodes, item.links);
    expect(layout.placedNodes).toHaveLength(4);
    expect(layout.placedLinks).toHaveLength(6);
  });

  // -------------------------------------------------------------------------
  // Test 10: Execution-state update (Step N -> Step N+1)
  // -------------------------------------------------------------------------
  it("Test 10: Execution-state update dynamically updates graph relationships and removes stale elements", () => {
    // Step N: A -> B
    const stepN = makeStep({
      heap: [
        { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 1 }, { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } }] },
        { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 2 }, { kind: "pointer", type: "struct Node*", target: null }] },
      ],
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
        ],
        heapBlocks: [
          { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 1 }, { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } }] },
          { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 2 }, { kind: "pointer", type: "struct Node*", target: null }] },
        ],
        relationships: [
          { pointerName: "H001->next", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 2, slot: 0 }, targetName: "H002", status: "valid", fieldName: "next" },
        ],
      },
    });

    const graphN = detectGraphModels(stepN)[0];
    expect(graphN.nodes).toHaveLength(2);
    expect(graphN.edges).toHaveLength(1);
    expect(graphN.edges[0].target).toBe("heap:H002");

    // Step N+1: A's next pointer updated to point to newly allocated C instead of B, and B freed
    const stepNPlus1 = makeStep({
      heap: [
        { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 1 }, { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } }] },
        { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: false, origin: "malloc", values: [] }, // Freed!
        { address: { space: "heap", id: 3, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 3 }, { kind: "pointer", type: "struct Node*", target: null }] },
      ],
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "C", address: { space: "stack", id: 1, slot: 2 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } } },
        ],
        heapBlocks: [
          { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 1 }, { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } }] },
          { address: { space: "heap", id: 3, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 3 }, { kind: "pointer", type: "struct Node*", target: null }] },
        ],
        relationships: [
          { pointerName: "H001->next", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 3, slot: 0 }, targetName: "H003", status: "valid", fieldName: "next" },
        ],
      },
    });

    const graphNPlus1 = detectGraphModels(stepNPlus1)[0];
    expect(graphNPlus1.nodes).toHaveLength(2);
    expect(graphNPlus1.edges).toHaveLength(1);
    expect(graphNPlus1.edges[0].target).toBe("heap:H003");
    // Ensure freed node H002 is completely absent from updated graph
    expect(graphNPlus1.nodes.some((n) => n.id === "heap:H002")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 11: Execution reset
  // -------------------------------------------------------------------------
  it("Test 11: Execution reset correctly clears and rebuilds deterministic pointer graph state", () => {
    const activeStep = makeStep({
      heap: [
        { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 1 }, { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } }] },
        { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 2 }, { kind: "pointer", type: "struct Node*", target: null }] },
      ],
      pointerView: {
        stackVariables: [
          { name: "A", address: { space: "stack", id: 1, slot: 0 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } } },
          { name: "B", address: { space: "stack", id: 1, slot: 1 }, value: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } } },
        ],
        heapBlocks: [
          { address: { space: "heap", id: 1, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 1 }, { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } }] },
          { address: { space: "heap", id: 2, slot: 0 }, slotCount: 2, byteSize: 8, active: true, origin: "malloc", values: [{ kind: "scalar", type: "int", value: 2 }, { kind: "pointer", type: "struct Node*", target: null }] },
        ],
        relationships: [
          { pointerName: "H001->next", pointerAddress: { space: "heap", id: 1, slot: 1 }, targetRegion: "heap", targetAddress: { space: "heap", id: 2, slot: 0 }, targetName: "H002", status: "valid", fieldName: "next" },
        ],
      },
    });

    const initialStep = makeStep({
      heap: [],
      pointerView: { stackVariables: [], heapBlocks: [], relationships: [] },
    });

    // 1. Initial empty state has no graph models
    expect(detectGraphModels(initialStep)).toHaveLength(0);

    // 2. Active step has pointer graph
    const models1 = detectGraphModels(activeStep);
    expect(models1).toHaveLength(1);
    expect(models1[0].nodes).toHaveLength(2);

    // 3. Resetting back to initial step has 0 models
    expect(detectGraphModels(initialStep)).toHaveLength(0);

    // 4. Executing again reproduces the exact deterministic graph model
    const models2 = detectGraphModels(activeStep);
    expect(models2).toHaveLength(1);
    expect(models2[0].nodes).toEqual(models1[0].nodes);
    expect(models2[0].edges).toEqual(models1[0].edges);
  });
});
