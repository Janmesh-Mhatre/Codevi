import { describe, it, expect } from "vitest";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { layoutLinkedListStructures } from "../../../src/visualization/layout/linkedListLayout";
import { diffExecutionSteps } from "../../../src/visualization/diff/structureDiff";
import type {
  ExecutionStep,
  StackFrame,
  HeapBlock,
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

describe("Phase 6.2: Linked List Visualization & Layout", () => {
  it("detects a 3-node linked list with data, next pointers, and traversal tags", () => {
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

    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 1,
      parameters: {},
      locals: {
        head: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
        curr: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
      },
      addresses: {
        head: { space: "stack", id: 10, slot: 0 },
        curr: { space: "stack", id: 11, slot: 0 },
      },
      isActive: true,
    };

    const step = makeStep({ callStack: [frame], heap });
    const graph = extractStructureGraph(step);

    // Should contain 1 linked list structure
    const llStruct = graph.structures.find((s) => s.kind === "linked-list");
    expect(llStruct).toBeDefined();
    expect(llStruct!.nodes).toHaveLength(3);

    // Node 0 should have value 10 and head tag
    const node0 = llStruct!.nodes[0];
    expect(node0.slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(node0.slots[0].activeIndexTags).toContain("head ➔");

    // Node 1 should have value 20 and curr tag
    const node1 = llStruct!.nodes[1];
    expect(node1.slots[0].value).toEqual({ kind: "scalar", type: "int", value: 20 });
    expect(node1.slots[0].activeIndexTags).toContain("curr ▾");

    // Node 2 should have value 30 and terminal link to NULL
    const node2 = llStruct!.nodes[2];
    expect(node2.slots[0].value).toEqual({ kind: "scalar", type: "int", value: 30 });

    const nullLink = llStruct!.links.find((l) => l.status === "null");
    expect(nullLink).toBeDefined();
    expect(nullLink!.sourceNodeId).toBe(node2.id);

    // Ensure generic heap arrays were not created for these nodes
    const heapArrays = graph.structures.filter((s) => s.kind === "array" && s.id.startsWith("heap-array"));
    expect(heapArrays).toHaveLength(0);
  });

  it("handles circular linked lists without infinite loops", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 100 },
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
          { kind: "scalar", type: "int", value: 200 },
          // Cycle: points back to node 1!
          { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
        ],
      },
    ];

    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 1,
      parameters: {},
      locals: {
        head: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
      },
      addresses: {
        head: { space: "stack", id: 10, slot: 0 },
      },
      isActive: true,
    };

    const step = makeStep({ callStack: [frame], heap });
    const graph = extractStructureGraph(step);

    const llStruct = graph.structures.find((s) => s.kind === "linked-list");
    expect(llStruct).toBeDefined();
    expect(llStruct!.nodes).toHaveLength(2);

    // Cycle link should be recorded
    const cycleLink = llStruct!.links.find((l) => l.label?.includes("cycle"));
    expect(cycleLink).toBeDefined();
    expect(cycleLink!.routingStyle).toBe("outward-loop");
  });

  it("computes horizontal layout with dual compartments and NULL badge", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 5 },
          { kind: "pointer", type: "struct Node*", target: null },
        ],
      },
    ];
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 1,
      parameters: {},
      locals: {
        head: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
      },
      addresses: { head: { space: "stack", id: 1, slot: 0 } },
      isActive: true,
    };
    const step = makeStep({ callStack: [frame], heap });
    const graph = extractStructureGraph(step);
    const llStruct = graph.structures.find((s) => s.kind === "linked-list")!;

    const layout = layoutLinkedListStructures(llStruct.nodes, llStruct.links, 20, 20);
    expect(layout.placedNodes).toHaveLength(1);
    expect(layout.nullNodeRect).toBeDefined();
    expect(layout.nullNodeRect!.w).toBeGreaterThan(0);
    expect(layout.placedLinks).toHaveLength(1);
    expect(layout.placedLinks[0].link.status).toBe("null");
  });

  it("diffExecutionSteps detects linked list data writes and updates highlights", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 42 },
          { kind: "pointer", type: "struct Node*", target: null },
        ],
      },
    ];
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 1,
      parameters: {},
      locals: {
        head: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
      },
      addresses: { head: { space: "stack", id: 1, slot: 0 } },
      isActive: true,
    };

    const step = makeStep({
      callStack: [frame],
      heap,
      stepAccesses: [
        { kind: "write", address: { space: "heap", id: 1, slot: 0 } },
      ],
    });

    const graph = extractStructureGraph(step);
    const changes = diffExecutionSteps(null, step, graph);

    expect(changes.some((c) => c.type === "write" && c.targetNodeId === "ll:node:H001")).toBe(true);
    const node = graph.structures.find((s) => s.kind === "linked-list")!.nodes[0];
    expect(node.highlight).toBe("write");
    expect(node.slots[0].highlight).toBe("write");
  });
});
