import { describe, it, expect } from "vitest";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { diffExecutionSteps } from "../../../src/visualization/diff/structureDiff";
import type {
  ExecutionStep,
  StackFrame,
  StepMemoryAccess,
} from "../../../src/execution/models/executionTypes";

// Helper to create a minimal mock ExecutionStep
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

function makeArrayFrame(
  vars: Record<string, { values: number[]; id: number }>,
  scalars: Record<string, { value: number; id: number }> = {},
): StackFrame {
  const locals: Record<string, any> = {};
  const addresses: Record<string, any> = {};

  for (const [name, arr] of Object.entries(vars)) {
    locals[name] = {
      kind: "array",
      type: `int[${arr.values.length}]`,
      address: { space: "stack", id: arr.id, slot: 0 },
      length: arr.values.length,
      values: arr.values.map((v) => ({ kind: "scalar", type: "int", value: v })),
    };
    addresses[name] = { space: "stack", id: arr.id, slot: 0 };
  }

  for (const [name, scl] of Object.entries(scalars)) {
    locals[name] = { kind: "scalar", type: "int", value: scl.value };
    addresses[name] = { space: "stack", id: scl.id, slot: 0 };
  }

  return {
    functionName: "main",
    callDepth: 1,
    line: 5,
    parameters: {},
    locals,
    addresses,
    isActive: true,
  };
}

describe("Phase 6.1 — Array Visualization & Multi-Declaration", () => {
  // ==========================================
  // 1. ACTIVE INDEX TAG DETECTION
  // ==========================================
  describe("Active Index Tags", () => {
    it("tags a slot when an integer variable matches a valid array index", () => {
      const frame = makeArrayFrame(
        { arr: { values: [10, 20, 30], id: 1 } },
        { i: { value: 1, id: 2 } },
      );
      const step = makeStep({ callStack: [frame] });
      const graph = extractStructureGraph(step);

      const arrStruct = graph.structures.find((s) => s.kind === "array");
      expect(arrStruct).toBeDefined();
      const node = arrStruct!.nodes[0];
      // Slot 1 should have an active index tag for "i"
      expect(node.slots[1].activeIndexTags).toBeDefined();
      expect(node.slots[1].activeIndexTags!.length).toBeGreaterThan(0);
      expect(node.slots[1].activeIndexTags![0]).toContain("i");
    });

    it("does NOT tag a slot when the variable value is out of array bounds", () => {
      const frame = makeArrayFrame(
        { arr: { values: [10, 20, 30], id: 1 } },
        { i: { value: 5, id: 2 } }, // out of bounds
      );
      const step = makeStep({ callStack: [frame] });
      const graph = extractStructureGraph(step);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      // No slot should have tags
      for (const slot of node.slots) {
        expect(slot.activeIndexTags ?? []).toHaveLength(0);
      }
    });

    it("tags multiple slots when multiple index variables point to different positions", () => {
      const frame = makeArrayFrame(
        { arr: { values: [10, 20, 30, 40], id: 1 } },
        { i: { value: 0, id: 2 }, j: { value: 3, id: 3 } },
      );
      const step = makeStep({ callStack: [frame] });
      const graph = extractStructureGraph(step);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      expect(node.slots[0].activeIndexTags?.some((t) => t.includes("i"))).toBe(true);
      expect(node.slots[3].activeIndexTags?.some((t) => t.includes("j"))).toBe(true);
    });

    it("stacks tags on the same slot when two variables have the same value", () => {
      const frame = makeArrayFrame(
        { arr: { values: [10, 20, 30], id: 1 } },
        { i: { value: 1, id: 2 }, j: { value: 1, id: 3 } },
      );
      const step = makeStep({ callStack: [frame] });
      const graph = extractStructureGraph(step);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      expect(node.slots[1].activeIndexTags!.length).toBe(2);
    });
  });

  // ==========================================
  // 2. BOUNDS CUES
  // ==========================================
  describe("Bounds Cues", () => {
    it("marks first slot as 'start' and last slot as 'end'", () => {
      const frame = makeArrayFrame({ arr: { values: [1, 2, 3, 4, 5], id: 1 } });
      const step = makeStep({ callStack: [frame] });
      const graph = extractStructureGraph(step);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      expect(node.slots[0].boundsCue).toBe("start");
      expect(node.slots[4].boundsCue).toBe("end");
      // Middle slots should not have bounds cues
      expect(node.slots[2].boundsCue).toBeUndefined();
    });

    it("single-element array has both start and end on the same slot", () => {
      const frame = makeArrayFrame({ arr: { values: [42], id: 1 } });
      const step = makeStep({ callStack: [frame] });
      const graph = extractStructureGraph(step);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      // Single slot gets 'end' (set last, overwrites 'start')
      expect(node.slots[0].boundsCue).toBe("end");
    });
  });

  // ==========================================
  // 3. EVENT-DRIVEN DIFF DETECTION
  // ==========================================
  describe("Event-Driven Diff Detection", () => {
    it("detects array write events from stepAccesses", () => {
      const frame = makeArrayFrame({ arr: { values: [10, 99, 30], id: 1 } });
      const accesses: StepMemoryAccess[] = [
        {
          kind: "write",
          address: { space: "stack", id: 1, slot: 1 },
          variableName: "arr[1]",
          slotIndex: 1,
        },
      ];
      const step = makeStep({ callStack: [frame], stepAccesses: accesses });
      const graph = extractStructureGraph(step);
      const changes = diffExecutionSteps(null, step, graph);

      const writeChanges = changes.filter((c) => c.type === "write");
      expect(writeChanges.length).toBeGreaterThan(0);
      expect(writeChanges[0].targetNodeId).toBe("stack:arr:arr");
      expect(writeChanges[0].slotIndex).toBe(1);
    });

    it("detects array read events from stepAccesses", () => {
      const frame = makeArrayFrame({ arr: { values: [10, 20, 30], id: 1 } });
      const accesses: StepMemoryAccess[] = [
        {
          kind: "read",
          address: { space: "stack", id: 1, slot: 2 },
          variableName: "arr[2]",
          slotIndex: 2,
        },
      ];
      const step = makeStep({ callStack: [frame], stepAccesses: accesses });
      const graph = extractStructureGraph(step);
      const changes = diffExecutionSteps(null, step, graph);

      const readChanges = changes.filter((c) => c.type === "read");
      expect(readChanges.length).toBeGreaterThan(0);
      expect(readChanges[0].slotIndex).toBe(2);
    });

    it("detects swap pattern: two writes to distinct slots of the same array", () => {
      const frame = makeArrayFrame({ arr: { values: [30, 20, 10], id: 1 } });
      const accesses: StepMemoryAccess[] = [
        {
          kind: "write",
          address: { space: "stack", id: 1, slot: 0 },
          variableName: "arr[0]",
          slotIndex: 0,
        },
        {
          kind: "write",
          address: { space: "stack", id: 1, slot: 2 },
          variableName: "arr[2]",
          slotIndex: 2,
        },
      ];
      const step = makeStep({ callStack: [frame], stepAccesses: accesses });
      const graph = extractStructureGraph(step);
      const changes = diffExecutionSteps(null, step, graph);

      const swapChanges = changes.filter((c) => c.type === "swap");
      expect(swapChanges.length).toBe(1);
      expect(swapChanges[0].description).toContain("↔");
    });

    it("detects new array declarations", () => {
      const prevFrame = makeArrayFrame({});
      const currFrame = makeArrayFrame({ arr: { values: [0, 0, 0], id: 1 } });
      const prevStep = makeStep({ callStack: [prevFrame] });
      const currStep = makeStep({ callStack: [currFrame] });
      const graph = extractStructureGraph(currStep);
      const changes = diffExecutionSteps(prevStep, currStep, graph);

      const declChanges = changes.filter((c) => c.type === "declare");
      expect(declChanges.length).toBe(1);
      expect(declChanges[0].description).toContain("arr");
    });
  });

  // ==========================================
  // 4. HIGHLIGHT APPLICATION
  // ==========================================
  describe("Highlight Application", () => {
    it("applies write highlight to specific slots", () => {
      const frame = makeArrayFrame({ arr: { values: [10, 99, 30], id: 1 } });
      const accesses: StepMemoryAccess[] = [
        {
          kind: "write",
          address: { space: "stack", id: 1, slot: 1 },
          variableName: "arr[1]",
          slotIndex: 1,
        },
      ];
      const step = makeStep({ callStack: [frame], stepAccesses: accesses });
      const graph = extractStructureGraph(step);
      diffExecutionSteps(null, step, graph);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      expect(node.highlight).toBe("write");
      expect(node.slots[1].highlight).toBe("write");
      // Other slots should not be highlighted
      expect(node.slots[0].highlight).toBe("none");
    });

    it("applies read highlight to specific slots", () => {
      const frame = makeArrayFrame({ arr: { values: [10, 20, 30], id: 1 } });
      const accesses: StepMemoryAccess[] = [
        {
          kind: "read",
          address: { space: "stack", id: 1, slot: 0 },
          variableName: "arr[0]",
          slotIndex: 0,
        },
      ];
      const step = makeStep({ callStack: [frame], stepAccesses: accesses });
      const graph = extractStructureGraph(step);
      diffExecutionSteps(null, step, graph);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      expect(node.highlight).toBe("read");
      expect(node.slots[0].highlight).toBe("read");
    });

    it("applies active highlight on declare changes", () => {
      const prevFrame = makeArrayFrame({});
      const currFrame = makeArrayFrame({ arr: { values: [0, 0, 0], id: 1 } });
      const prevStep = makeStep({ callStack: [prevFrame] });
      const currStep = makeStep({ callStack: [currFrame] });
      const graph = extractStructureGraph(currStep);
      diffExecutionSteps(prevStep, currStep, graph);

      const node = graph.structures.find((s) => s.kind === "array")!.nodes[0];
      expect(node.highlight).toBe("active");
    });
  });

  // ==========================================
  // 5. FALLBACK VALUE-COMPARISON DIFF
  // ==========================================
  describe("Fallback Value-Comparison Diff (no stepAccesses)", () => {
    it("detects writes via value comparison when stepAccesses is empty", () => {
      const prevFrame = makeArrayFrame({ arr: { values: [10, 20, 30], id: 1 } });
      const currFrame = makeArrayFrame({ arr: { values: [10, 99, 30], id: 1 } });
      const prevStep = makeStep({ callStack: [prevFrame], stepAccesses: [] });
      const currStep = makeStep({ callStack: [currFrame], stepAccesses: [] });
      const graph = extractStructureGraph(currStep);
      const changes = diffExecutionSteps(prevStep, currStep, graph);

      const writeChanges = changes.filter((c) => c.type === "write");
      expect(writeChanges.length).toBe(1);
      expect(writeChanges[0].slotIndex).toBe(1);
    });
  });

  // ==========================================
  // 6. StepMemoryAccess INTERFACE
  // ==========================================
  describe("StepMemoryAccess field on ExecutionStep", () => {
    it("stepAccesses defaults to empty array in mock", () => {
      const step = makeStep();
      expect(step.stepAccesses).toEqual([]);
    });

    it("stepAccesses carries through when provided", () => {
      const accesses: StepMemoryAccess[] = [
        { kind: "read", address: { space: "stack", id: 1, slot: 0 } },
        { kind: "write", address: { space: "stack", id: 1, slot: 1 }, variableName: "x" },
      ];
      const step = makeStep({ stepAccesses: accesses });
      expect(step.stepAccesses).toHaveLength(2);
      expect(step.stepAccesses[0].kind).toBe("read");
      expect(step.stepAccesses[1].variableName).toBe("x");
    });
  });
});
