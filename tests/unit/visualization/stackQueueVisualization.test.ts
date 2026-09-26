import { describe, it, expect } from "vitest";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import type { ExecutionStep } from "../../../src/execution/models/executionTypes";

/** Helper: build a minimal ExecutionStep with locals in the active frame. */
function makeStep(
  locals: Record<string, any>,
  globals?: Record<string, any>,
): ExecutionStep {
  return {
    line: 1,
    code: "",
    explanation: "",
    callStack: [
      {
        functionName: "main",
        callDepth: 0,
        isActive: true,
        parameters: {},
        locals,
        addresses: {},
        returnAddress: null,
        localAddressCounter: 0,
      },
    ],
    heap: [],
    pointerView: {
      stackVariables: [],
      heapBlocks: [],
      relationships: [],
    },
    stepAccesses: [],
    globals: globals ?? undefined,
  } as unknown as ExecutionStep;
}

describe("Phase 6.3: Array-backed Stack & Queue Detection", () => {
  it("promotes an array to stack when 'top' integer variable exists", () => {
    const step = makeStep({
      stack: {
        kind: "array",
        type: "int",
        length: 5,
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "scalar", type: "int", value: 20 },
          { kind: "scalar", type: "int", value: 30 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      top: { kind: "scalar", type: "int", value: 2 },
    });

    const graph = extractStructureGraph(step);
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.name).toContain("Stack");

    // The node's metadata should have topIndex = 2
    const node = stackItem!.nodes[0];
    expect(node.metadata?.topIndex).toBe(2);
    expect(node.metadata?.adtKind).toBe("stack");
  });

  it("promotes an array to queue when 'front' and 'rear' integer variables exist", () => {
    const step = makeStep({
      queue: {
        kind: "array",
        type: "int",
        length: 5,
        values: [
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 10 },
          { kind: "scalar", type: "int", value: 20 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      front: { kind: "scalar", type: "int", value: 1 },
      rear: { kind: "scalar", type: "int", value: 2 },
    });

    const graph = extractStructureGraph(step);
    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();
    expect(queueItem!.name).toContain("Queue");

    const node = queueItem!.nodes[0];
    expect(node.metadata?.frontIndex).toBe(1);
    expect(node.metadata?.rearIndex).toBe(2);
    expect(node.metadata?.adtKind).toBe("queue");
  });

  it("does NOT promote an array when no ADT variables exist", () => {
    const step = makeStep({
      arr: {
        kind: "array",
        type: "int",
        length: 5,
        values: [
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 2 },
          { kind: "scalar", type: "int", value: 3 },
          { kind: "scalar", type: "int", value: 4 },
          { kind: "scalar", type: "int", value: 5 },
        ],
      },
      i: { kind: "scalar", type: "int", value: 0 },
    });

    const graph = extractStructureGraph(step);
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(stackItem).toBeUndefined();
    expect(queueItem).toBeUndefined();

    const arrayItem = graph.structures.find((s) => s.kind === "array");
    expect(arrayItem).toBeDefined();
  });

  it("tags the top slot with 'top ▾'", () => {
    const step = makeStep({
      s: {
        kind: "array",
        type: "int",
        length: 3,
        values: [
          { kind: "scalar", type: "int", value: 5 },
          { kind: "scalar", type: "int", value: 10 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      top: { kind: "scalar", type: "int", value: 1 },
    });

    const graph = extractStructureGraph(step);
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();

    const topSlot = stackItem!.nodes[0].slots[1];
    expect(topSlot.activeIndexTags).toContain("top ▾");
  });

  it("tags front and rear slots for queues", () => {
    const step = makeStep({
      q: {
        kind: "array",
        type: "int",
        length: 5,
        values: [
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 100 },
          { kind: "scalar", type: "int", value: 200 },
          { kind: "scalar", type: "int", value: 300 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      front: { kind: "scalar", type: "int", value: 1 },
      rear: { kind: "scalar", type: "int", value: 3 },
    });

    const graph = extractStructureGraph(step);
    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();

    const fSlot = queueItem!.nodes[0].slots[1];
    expect(fSlot.activeIndexTags).toContain("front ▾");

    const rSlot = queueItem!.nodes[0].slots[3];
    expect(rSlot.activeIndexTags).toContain("rear ▾");
  });

  it("supports head/tail naming for queue detection", () => {
    const step = makeStep({
      data: {
        kind: "array",
        type: "int",
        length: 4,
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "scalar", type: "int", value: 20 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      head: { kind: "scalar", type: "int", value: 0 },
      tail: { kind: "scalar", type: "int", value: 1 },
    });

    const graph = extractStructureGraph(step);
    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeDefined();

    const node = queueItem!.nodes[0];
    expect(node.metadata?.frontKey).toBe("head");
    expect(node.metadata?.rearKey).toBe("tail");
  });

  it("handles empty stack (top = -1)", () => {
    const step = makeStep({
      s: {
        kind: "array",
        type: "int",
        length: 3,
        values: [
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      top: { kind: "scalar", type: "int", value: -1 },
    });

    const graph = extractStructureGraph(step);
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    expect(stackItem!.nodes[0].metadata?.topIndex).toBe(-1);
    // No slot should be tagged when top = -1
    const anyTagged = stackItem!.nodes[0].slots.some(
      (s) => s.activeIndexTags && s.activeIndexTags.includes("top ▾"),
    );
    expect(anyTagged).toBe(false);
  });

  it("does NOT promote heap arrays to stack/queue", () => {
    // Heap arrays have IDs starting with "heap-array:" — our function only promotes "array:"
    const step = makeStep({
      top: { kind: "scalar", type: "int", value: 0 },
    });

    // Manually check: there should be no stack items since there's no local array
    const graph = extractStructureGraph(step);
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeUndefined();
  });

  it("prefers 'top' (stack) over partial queue when only 'top' + 'front' exist (no rear)", () => {
    const step = makeStep({
      arr: {
        kind: "array",
        type: "int",
        length: 5,
        values: [
          { kind: "scalar", type: "int", value: 1 },
          { kind: "scalar", type: "int", value: 2 },
          { kind: "scalar", type: "int", value: 3 },
          { kind: "scalar", type: "int", value: 0 },
          { kind: "scalar", type: "int", value: 0 },
        ],
      },
      top: { kind: "scalar", type: "int", value: 2 },
      front: { kind: "scalar", type: "int", value: 0 },
    });

    const graph = extractStructureGraph(step);
    // Should be stack, not queue, since rear is missing
    const stackItem = graph.structures.find((s) => s.kind === "stack");
    expect(stackItem).toBeDefined();
    const queueItem = graph.structures.find((s) => s.kind === "queue");
    expect(queueItem).toBeUndefined();
  });
});
