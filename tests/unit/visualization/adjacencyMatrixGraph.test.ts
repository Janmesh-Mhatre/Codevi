import { describe, it, expect } from "vitest";
import { detectGraphModels } from "../../../src/visualization/detectors/graphDetector";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { layoutGraphStructures } from "../../../src/visualization/layout/graphLayout";
import { graphModelToStructureItem } from "../../../src/visualization/models/graphTypes";
import type {
  ExecutionStep,
  StackFrame,
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

function makeMatrixVal(
  rows: number,
  cols: number,
  flat: number[],
  typeName = `int[${rows}][${cols}]`,
): ExecutionValue & { kind: "array" } {
  return {
    kind: "array",
    type: typeName,
    length: rows * cols,
    dimensions: [rows, cols],
    values: flat.map((v) => ({ kind: "scalar", type: "int", value: v })),
  };
}

describe("Phase 6.5.3: Adjacency Matrix Graphs Unit Tests", () => {
  // -------------------------------------------------------------------------
  // Test 1: Basic directed graph (A -> B, B -> C)
  // -------------------------------------------------------------------------
  it("Test 1: detects basic directed graph A -> B, B -> C", () => {
    // 0 1 0
    // 0 0 1
    // 0 0 0
    const matrixVal = makeMatrixVal(3, 3, [
      0, 1, 0,
      0, 0, 1,
      0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: matrixVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);

    const model = models[0];
    expect(model.representation).toBe("adjacency-matrix");
    expect(model.name).toBe("Graph: graph (3 vertices)");
    expect(model.nodes).toHaveLength(3);
    expect(model.nodes[0].label).toBe("Node A");
    expect(model.nodes[1].label).toBe("Node B");
    expect(model.nodes[2].label).toBe("Node C");

    expect(model.edges).toHaveLength(2);
    expect(model.edges[0].source).toBe("graph_v_0");
    expect(model.edges[0].target).toBe("graph_v_1");
    expect(model.edges[1].source).toBe("graph_v_1");
    expect(model.edges[1].target).toBe("graph_v_2");

    expect(model.metadata?.hasSelfLoops).toBe(false);
    expect(model.metadata?.hasCycles).toBe(false);

    // Verify pipeline to StructureItem replaces the raw array
    const structGraph = extractStructureGraph(step);
    expect(structGraph.structures.some((s) => s.kind === "graph")).toBe(true);
    expect(structGraph.structures.some((s) => s.id === "array:graph")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 2: Branching graph (A -> B, A -> C, B -> D, C -> D)
  // -------------------------------------------------------------------------
  it("Test 2: detects branching graph A -> B, A -> C, B -> D, C -> D", () => {
    // 0 1 1 0
    // 0 0 0 1
    // 0 0 0 1
    // 0 0 0 0
    const matrixVal = makeMatrixVal(4, 4, [
      0, 1, 1, 0,
      0, 0, 0, 1,
      0, 0, 0, 1,
      0, 0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { adj: matrixVal },
          addresses: { adj: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);

    const model = models[0];
    expect(model.nodes).toHaveLength(4);
    expect(model.edges).toHaveLength(4);

    const edgePairs = model.edges.map((e) => `${e.source}->${e.target}`);
    expect(edgePairs).toContain("adj_v_0->adj_v_1"); // A -> B
    expect(edgePairs).toContain("adj_v_0->adj_v_2"); // A -> C
    expect(edgePairs).toContain("adj_v_1->adj_v_3"); // B -> D
    expect(edgePairs).toContain("adj_v_2->adj_v_3"); // C -> D

    // Verify layout coordinates are collision-free
    const item = graphModelToStructureItem(model);
    const layout = layoutGraphStructures(item.nodes, item.links, 20, 20);
    expect(layout.placedNodes).toHaveLength(4);

    for (let i = 0; i < layout.placedNodes.length; i++) {
      for (let j = i + 1; j < layout.placedNodes.length; j++) {
        const n1 = layout.placedNodes[i];
        const n2 = layout.placedNodes[j];
        const overlap =
          n1.x < n2.x + n2.w &&
          n1.x + n1.w > n2.x &&
          n1.y < n2.y + n2.h &&
          n1.y + n1.h > n2.y;
        expect(overlap).toBe(false);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: Cycle (A -> B -> C -> A)
  // -------------------------------------------------------------------------
  it("Test 3: detects cycle A -> B -> C -> A and flags hasCycles: true", () => {
    // 0 1 0
    // 0 0 1
    // 1 0 0
    const matrixVal = makeMatrixVal(3, 3, [
      0, 1, 0,
      0, 0, 1,
      1, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: matrixVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    expect(models[0].edges).toHaveLength(3);
    expect(models[0].metadata?.hasCycles).toBe(true);
    expect(models[0].metadata?.hasSelfLoops).toBe(false);

    // Layout should handle cycle without crashing or infinite loop
    const item = graphModelToStructureItem(models[0]);
    const layout = layoutGraphStructures(item.nodes, item.links, 20, 20);
    expect(layout.placedNodes).toHaveLength(3);
    expect(layout.placedLinks).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Test 4: Self-loop (A -> A, A -> B, B -> C)
  // -------------------------------------------------------------------------
  it("Test 4: detects diagonal self-loop A -> A and flags hasSelfLoops: true", () => {
    // 1 1 0
    // 0 0 1
    // 0 0 0
    const matrixVal = makeMatrixVal(3, 3, [
      1, 1, 0,
      0, 0, 1,
      0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: matrixVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    expect(models[0].metadata?.hasSelfLoops).toBe(true);

    const selfLoopEdge = models[0].edges.find(
      (e) => e.source === "graph_v_0" && e.target === "graph_v_0",
    );
    expect(selfLoopEdge).toBeDefined();

    // Verify StructureItem routingStyle is self-loop
    const item = graphModelToStructureItem(models[0]);
    const selfLoopLink = item.links.find(
      (l) => l.sourceNodeId === "graph:node:graph_v_0" && l.targetNodeId === "graph:node:graph_v_0",
    );
    expect(selfLoopLink?.routingStyle).toBe("self-loop");

    // Layout should route self-loop below the node's bottom boundary
    const layout = layoutGraphStructures(item.nodes, item.links, 20, 20);
    const placedSelfLoop = layout.placedLinks.find(
      (pl) => pl.link.sourceNodeId === pl.link.targetNodeId,
    );
    expect(placedSelfLoop).toBeDefined();
    expect(placedSelfLoop?.labelY).toBeGreaterThan(layout.placedNodes[0].y + layout.placedNodes[0].h);
  });

  // -------------------------------------------------------------------------
  // Test 5: Disconnected components (A -> B) and (C -> D)
  // -------------------------------------------------------------------------
  it("Test 5: preserves all disconnected components without dropping components", () => {
    // 0 1 0 0
    // 0 0 0 0
    // 0 0 0 1
    // 0 0 0 0
    const matrixVal = makeMatrixVal(4, 4, [
      0, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 1,
      0, 0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { network: matrixVal },
          addresses: { network: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    expect(models[0].nodes).toHaveLength(4);
    expect(models[0].edges).toHaveLength(2);

    const item = graphModelToStructureItem(models[0]);
    const layout = layoutGraphStructures(item.nodes, item.links, 20, 20);
    expect(layout.placedNodes).toHaveLength(4);
    expect(layout.placedLinks).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Test 6: Shared destination (A -> C, B -> C)
  // -------------------------------------------------------------------------
  it("Test 6: preserves single node identity for shared destination (A -> C, B -> C)", () => {
    // 0 0 1
    // 0 0 1
    // 0 0 0
    const matrixVal = makeMatrixVal(3, 3, [
      0, 0, 1,
      0, 0, 1,
      0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: matrixVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    expect(models[0].nodes).toHaveLength(3); // Exactly one Node C

    const cNodes = models[0].nodes.filter((n) => n.label === "Node C");
    expect(cNodes).toHaveLength(1);

    const edgesToC = models[0].edges.filter((e) => e.target === "graph_v_2");
    expect(edgesToC).toHaveLength(2);
    expect(edgesToC.map((e) => e.source).sort()).toEqual(["graph_v_0", "graph_v_1"]);
  });

  // -------------------------------------------------------------------------
  // Test 7: Normal 2D arrays (must NOT become graphs)
  // -------------------------------------------------------------------------
  it("Test 7: preserves normal 2D arrays as ordinary arrays without converting them to graphs", () => {
    // Non-square matrix
    const marksVal = makeMatrixVal(2, 3, [80, 90, 70, 75, 85, 95], "int[2][3]");
    // Square matrix without graph naming
    const dataVal = makeMatrixVal(3, 3, [10, 20, 30, 40, 50, 60, 70, 80, 90], "int[3][3]");
    const matrixVal = makeMatrixVal(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1], "int[3][3]");

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: {
            marks: marksVal,
            data: dataVal,
            matrix: matrixVal,
          },
          addresses: {
            marks: { space: "stack", id: 1, slot: 0 },
            data: { space: "stack", id: 1, slot: 6 },
            matrix: { space: "stack", id: 1, slot: 15 },
          },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(0);

    const structGraph = extractStructureGraph(step);
    expect(structGraph.structures.some((s) => s.kind === "graph")).toBe(false);
    expect(structGraph.structures.filter((s) => s.kind === "array")).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Test 8: Multiple matrix graphs (g1, g2)
  // -------------------------------------------------------------------------
  it("Test 8: detects multiple valid adjacency matrices simultaneously without discarding either", () => {
    const g1Val = makeMatrixVal(3, 3, [
      0, 1, 0,
      0, 0, 1,
      0, 0, 0,
    ]);
    const g2Val = makeMatrixVal(3, 3, [
      0, 0, 1,
      1, 0, 0,
      0, 1, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: {
            g1: g1Val,
            g2: g2Val,
          },
          addresses: {
            g1: { space: "stack", id: 1, slot: 0 },
            g2: { space: "stack", id: 2, slot: 0 },
          },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(2);

    const m1 = models.find((m) => m.id === "matrix:g1");
    const m2 = models.find((m) => m.id === "matrix:g2");

    expect(m1).toBeDefined();
    expect(m2).toBeDefined();

    // Node IDs must be scoped by variable name to prevent collisions
    expect(m1!.nodes[0].id).toBe("g1_v_0");
    expect(m2!.nodes[0].id).toBe("g2_v_0");

    // Both raw arrays must be replaced in StructureGraph
    const structGraph = extractStructureGraph(step);
    expect(structGraph.structures.filter((s) => s.kind === "graph")).toHaveLength(2);
    expect(structGraph.structures.some((s) => s.id === "array:g1")).toBe(false);
    expect(structGraph.structures.some((s) => s.id === "array:g2")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 9: Empty/no-edge matrix
  // -------------------------------------------------------------------------
  it("Test 9: empty all-zero matrix follows repository conservative policy (remains normal array)", () => {
    // 0 0 0
    // 0 0 0
    // 0 0 0
    const emptyGraphVal = makeMatrixVal(3, 3, [
      0, 0, 0,
      0, 0, 0,
      0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: emptyGraphVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    // An all-zero matrix without non-zero edges remains an inactive memory buffer
    const models = detectGraphModels(step);
    expect(models).toHaveLength(0);

    const structGraph = extractStructureGraph(step);
    expect(structGraph.structures.some((s) => s.id === "array:graph")).toBe(true);
    expect(structGraph.structures.some((s) => s.kind === "graph")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 10: Matrix with self-loop + normal edges (A -> A, A -> B, B -> C)
  // -------------------------------------------------------------------------
  it("Test 10: matrix with self-loop + normal edges routes and renders properly", () => {
    const matrixVal = makeMatrixVal(3, 3, [
      1, 1, 0,
      0, 0, 1,
      0, 0, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: matrixVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);

    const item = graphModelToStructureItem(models[0]);
    const layout = layoutGraphStructures(item.nodes, item.links, 24, 24);

    expect(layout.placedNodes).toHaveLength(3);
    expect(layout.placedLinks).toHaveLength(3);

    // Verify self loop placed link has valid SVG curve
    const loopLink = layout.placedLinks.find((pl) => pl.link.sourceNodeId === pl.link.targetNodeId);
    expect(loopLink).toBeDefined();
    expect(loopLink?.pathD).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? C/);

    // Normal downward edge
    const normalLink = layout.placedLinks.find((pl) => pl.link.sourceNodeId !== pl.link.targetNodeId);
    expect(normalLink).toBeDefined();
    expect(normalLink?.pathD).toMatch(/^M \d+(\.\d+)? \d+(\.\d+)? C/);
  });

  // -------------------------------------------------------------------------
  // Test 11: Execution state mutation & lifecycle updates
  // -------------------------------------------------------------------------
  it("Test 11: updates reactively across execution steps and clears cleanly on reset", () => {
    // 1. Initial step before initialization: empty locals
    const step0 = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 1,
          parameters: {},
          locals: {},
          addresses: {},
          isActive: true,
        },
      ],
    });
    expect(detectGraphModels(step0)).toHaveLength(0);

    // 2. Step with initial 1-edge matrix
    const step1 = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 2,
          parameters: {},
          locals: {
            graph: makeMatrixVal(3, 3, [
              0, 1, 0,
              0, 0, 0,
              0, 0, 0,
            ]),
          },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });
    const models1 = detectGraphModels(step1);
    expect(models1).toHaveLength(1);
    expect(models1[0].edges).toHaveLength(1);

    // 3. Step after mutation: graph[1][2] = 1 (second edge added)
    const step2 = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 3,
          parameters: {},
          locals: {
            graph: makeMatrixVal(3, 3, [
              0, 1, 0,
              0, 0, 1,
              0, 0, 0,
            ]),
          },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });
    const models2 = detectGraphModels(step2);
    expect(models2).toHaveLength(1);
    expect(models2[0].edges).toHaveLength(2);

    // 4. Reset step: null or empty state produces 0 models
    expect(detectGraphModels(null)).toHaveLength(0);
    expect(detectGraphModels(step0)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 12: Dense graph K4 targeted edge-node clearance (B -> D around C)
  // -------------------------------------------------------------------------
  it("Test 12: dense graph K4 routes edges around intermediate nodes with clearance >= 20px", () => {
    // Dense complete directed graph on 4 vertices:
    // {0, 1, 1, 1},
    // {1, 0, 1, 1},
    // {1, 1, 0, 1},
    // {1, 1, 1, 0}
    const matrixVal = makeMatrixVal(4, 4, [
      0, 1, 1, 1,
      1, 0, 1, 1,
      1, 1, 0, 1,
      1, 1, 1, 0,
    ]);

    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: { graph: matrixVal },
          addresses: { graph: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
    });

    const models = detectGraphModels(step);
    expect(models).toHaveLength(1);
    const model = models[0];
    expect(model.nodes).toHaveLength(4);
    expect(model.edges).toHaveLength(12);

    const item = graphModelToStructureItem(model);
    const layout = layoutGraphStructures(item.nodes, item.links, 24, 24);

    expect(layout.placedNodes).toHaveLength(4);
    const nodeA = layout.placedNodes.find((n) => n.node.id === "graph:node:graph_v_0")!;
    const nodeB = layout.placedNodes.find((n) => n.node.id === "graph:node:graph_v_1")!;
    const nodeC = layout.placedNodes.find((n) => n.node.id === "graph:node:graph_v_2")!;
    const nodeD = layout.placedNodes.find((n) => n.node.id === "graph:node:graph_v_3")!;

    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
    expect(nodeC).toBeDefined();
    expect(nodeD).toBeDefined();

    // In K4, root is A (layer 0). B, C, D are on layer 1 (same Y coordinate)
    expect(nodeB.y).toBe(nodeC.y);
    expect(nodeC.y).toBe(nodeD.y);
    expect(nodeB.x).toBeLessThan(nodeC.x);
    expect(nodeC.x).toBeLessThan(nodeD.x);

    // 1. Edge B -> D (forward across intermediate node C):
    // Must route above C with clearance >= 20px
    const linkBtoD = layout.placedLinks.find(
      (l) =>
        l.link.sourceNodeId === "graph:node:graph_v_1" &&
        l.link.targetNodeId === "graph:node:graph_v_3",
    );
    expect(linkBtoD).toBeDefined();

    // Parse Bézier control points from pathD: M x1 y1 C c1x c1y, c2x c2y, x2 y2
    const bToDMatch = linkBtoD!.pathD.match(
      /M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)/,
    );
    expect(bToDMatch).not.toBeNull();
    const [, , , , c1yBtoD, , c2yBtoD] = bToDMatch!.map(Number);
    // Control points should be above node C by at least 20px
    expect(nodeC.y - c1yBtoD).toBeGreaterThanOrEqual(20);
    expect(nodeC.y - c2yBtoD).toBeGreaterThanOrEqual(20);

    // 2. Edge D -> B (backward across intermediate node C):
    // Must route below C with clearance >= 20px
    const linkDtoB = layout.placedLinks.find(
      (l) =>
        l.link.sourceNodeId === "graph:node:graph_v_3" &&
        l.link.targetNodeId === "graph:node:graph_v_1",
    );
    expect(linkDtoB).toBeDefined();

    const dToBMatch = linkDtoB!.pathD.match(
      /M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)/,
    );
    expect(dToBMatch).not.toBeNull();
    const [, , , , c1yDtoB, , c2yDtoB] = dToBMatch!.map(Number);
    // Control points should be below node C's bottom boundary by at least 20px
    const nodeCBottom = nodeC.y + nodeC.h;
    expect(c1yDtoB - nodeCBottom).toBeGreaterThanOrEqual(20);
    expect(c2yDtoB - nodeCBottom).toBeGreaterThanOrEqual(20);

    // 3. Adjacent edges B -> C and C -> D:
    // Have no intermediate obstacles on this layer
    const linkBtoC = layout.placedLinks.find(
      (l) =>
        l.link.sourceNodeId === "graph:node:graph_v_1" &&
        l.link.targetNodeId === "graph:node:graph_v_2",
    );
    expect(linkBtoC).toBeDefined();
    // B -> C connects between the adjacent nodes
    const bToCMatch = linkBtoC!.pathD.match(
      /M\s+([\d.-]+)\s+([\d.-]+)\s+C\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+),\s+([\d.-]+)\s+([\d.-]+)/,
    );
    expect(bToCMatch).not.toBeNull();
    const bToC_x1 = Number(bToCMatch![1]);
    const bToC_x2 = Number(bToCMatch![7]);
    expect(bToC_x1).toBeCloseTo(nodeB.x + nodeB.w, 0);
    expect(bToC_x2).toBeCloseTo(nodeC.x, 0);
  });
});

