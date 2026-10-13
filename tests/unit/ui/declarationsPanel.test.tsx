import { describe, expect, it, beforeEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_EXECUTION_STATE, type ExecutionState, type ExecutionStep, type StackFrame } from "../../../src/execution/models/executionTypes";

let mockState: ExecutionState = INITIAL_EXECUTION_STATE;

vi.mock("../../../src/state/executionStore", () => ({
  useExecutionStore: (selector?: (s: ExecutionState) => any) =>
    selector ? selector(mockState) : mockState,
}));

const { DeclarationsPanel } = await import("../../../src/components/panels/DeclarationsPanel");

describe("DeclarationsPanel (Phase 6.4.1)", () => {
  beforeEach(() => {
    mockState = { ...INITIAL_EXECUTION_STATE };
  });

  it("renders idle empty state when execution has not started", () => {
    const html = renderToStaticMarkup(<DeclarationsPanel />);
    expect(html).toContain("Declarations");
    expect(html).toContain("Runtime declarations, scope variables, and array objects will appear here");
  });

  it("renders stack frame declarations with function name, parameters, line, and variables", () => {
    const frame: StackFrame = {
      functionName: "compute",
      callDepth: 1,
      line: 12,
      parameters: {
        val: { kind: "scalar", type: "int", value: 10 },
      },
      locals: {
        count: { kind: "scalar", type: "int", value: 42 },
        ptr: {
          kind: "pointer",
          type: "int",
          target: { space: "stack", id: 1, slot: 0 },
        },
      },
      addresses: {
        val: { space: "stack", id: 1, slot: 0 },
        count: { space: "stack", id: 2, slot: 0 },
        ptr: { space: "stack", id: 3, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 12,
      column: 0,
      endLine: 12,
      endColumn: 10,
      astNodeType: "declaration",
      functionName: "compute",
      callDepth: 1,
      description: "declared count",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [
        { kind: "write", address: { space: "stack", id: 2, slot: 0 } },
      ],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<DeclarationsPanel />);
    expect(html).toContain("compute(val=10)");
    expect(html).toContain("line 13");
    expect(html).toContain("active");
    expect(html).toContain("count");
    expect(html).toContain("42");
    expect(html).toContain("ptr");
    expect(html).toContain("int *");
    expect(html).toContain("@S002");
  });

  it("renders 1D and 2D array declarations using existing array rendering behavior", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        nums: {
          kind: "array",
          type: "int",
          length: 3,
          address: { space: "stack", id: 10, slot: 0 },
          values: [
            { kind: "scalar", type: "int", value: 10 },
            { kind: "scalar", type: "int", value: 20 },
            { kind: "scalar", type: "int", value: 30 },
          ],
        },
        matrix: {
          kind: "array",
          type: "int",
          length: 4,
          dimensions: [2, 2],
          address: { space: "stack", id: 20, slot: 0 },
          values: [
            { kind: "scalar", type: "int", value: 1 },
            { kind: "scalar", type: "int", value: 2 },
            { kind: "scalar", type: "int", value: 3 },
            { kind: "scalar", type: "int", value: 4 },
          ],
        },
      },
      addresses: {
        nums: { space: "stack", id: 10, slot: 0 },
        matrix: { space: "stack", id: 20, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 5,
      column: 0,
      endLine: 5,
      endColumn: 10,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "arrays declared",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<DeclarationsPanel />);
    // 1D array checks
    expect(html).toContain("nums");
    expect(html).toContain("3 elements");
    expect(html).toContain("[0]");
    expect(html).toContain("[1]");
    expect(html).toContain("[2]");
    expect(html).toContain("10");
    expect(html).toContain("20");
    expect(html).toContain("30");

    // 2D array checks
    expect(html).toContain("matrix");
    expect(html).toContain("2 × 2 matrix");
    expect(html).toContain("Row 0");
    expect(html).toContain("Row 1");
    expect(html).toContain("[0][0]");
    expect(html).toContain("[1][1]");
  });

  it("renders global declarations section when globals exist", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 3,
      parameters: {},
      locals: {},
      addresses: {},
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 3,
      column: 0,
      endLine: 3,
      endColumn: 10,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "step",
      variables: {},
      globals: {
        globalCounter: { kind: "scalar", type: "int", value: 100 },
      },
      globalAddresses: {
        globalCounter: { space: "stack", id: 99, slot: 0 },
      },
      callStack: [frame],
      heap: [],
      stepAccesses: [],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<DeclarationsPanel />);
    expect(html).toContain("Global Declarations");
    expect(html).toContain("globalCounter");
    expect(html).toContain("100");
  });

  it("renders Stack and Heap side-by-side with heap allocation information", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 4,
      parameters: {},
      locals: {
        arr: {
          kind: "pointer",
          type: "int",
          target: { space: "heap", id: 1, slot: 0 },
        },
      },
      addresses: {
        arr: { space: "stack", id: 1, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 4,
      column: 0,
      endLine: 4,
      endColumn: 10,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "malloc heap block",
      variables: {},
      callStack: [frame],
      heap: [
        {
          address: { space: "heap", id: 1, slot: 0 },
          byteSize: 16,
          slotCount: 2,
          origin: "malloc(16)",
          active: true,
          values: [
            { kind: "scalar", type: "int", value: 42 },
            { kind: "scalar", type: "int", value: 99 },
          ],
        },
      ],
      stepAccesses: [],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<DeclarationsPanel />);
    // Column headers
    expect(html).toContain("Stack");
    expect(html).toContain("Heap");
    // Stack variable and pointer to heap
    expect(html).toContain("arr");
    expect(html).toContain("→ H001");
    // Heap block details
    expect(html).toContain("H001");
    expect(html).toContain("16 bytes");
    expect(html).toContain("malloc(16)");
    expect(html).toContain("2 slots");
    expect(html).toContain("← arr");
    expect(html).toContain("42, 99");
    expect(html).toContain("active");
  });
});

