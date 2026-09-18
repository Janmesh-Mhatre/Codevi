import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { INITIAL_EXECUTION_STATE, type ExecutionState, type ExecutionStep, type StackFrame } from "../../../src/execution/models/executionTypes";

let mockState: ExecutionState = INITIAL_EXECUTION_STATE;

vi.mock("../../../src/state/executionStore", () => ({
  useExecutionStore: (selector?: (s: ExecutionState) => any) =>
    selector ? selector(mockState) : mockState,
}));

// Import after mock
const { VariableArrayViewPanel } = await import("../../../src/components/panels/VariableArrayViewPanel");
const { VariablePanel } = await import("../../../src/components/panels/VariablePanel");

describe("Variable & Array View Panel and VariablePanel 2D coordinates", () => {
  beforeEach(() => {
    mockState = { ...INITIAL_EXECUTION_STATE };
  });

  it("renders idle empty state for VariableArrayViewPanel", () => {
    const html = renderToStaticMarkup(<VariableArrayViewPanel />);
    expect(html).toContain("Variable &amp; Array View");
    expect(html).toContain("Simple variables and 1D / 2D arrays will appear here");
  });

  it("renders simple scalar variables with name, type, location, and value", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        x: { kind: "scalar", type: "int", value: 42 },
        ch: { kind: "scalar", type: "char", value: 65 },
      },
      addresses: {
        x: { space: "stack", id: 1, slot: 0 },
        ch: { space: "stack", id: 2, slot: 0 },
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
      description: "declared x",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [
        { kind: "write", address: { space: "stack", id: 1, slot: 0 } },
      ],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      steps: [step],
    };

    const html = renderToStaticMarkup(<VariableArrayViewPanel />);
    expect(html).toContain("main()");
    expect(html).toContain("x");
    expect(html).toContain("42");
    expect(html).toContain("@S001");
    expect(html).toContain("ch");
    expect(html).toContain("@S002");
    // Write highlight on x
    expect(html).toContain("border-[#f59e0b]");
  });

  it("renders 1D array with [0] = 1, [1] = 2 and locations", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        arr: {
          kind: "array",
          type: "int[3]",
          address: { space: "stack", id: 10, slot: 0 },
          length: 3,
          values: [
            { kind: "scalar", type: "int", value: 10 },
            { kind: "scalar", type: "int", value: 20 },
            { kind: "scalar", type: "int", value: 30 },
          ],
        },
      },
      addresses: {
        arr: { space: "stack", id: 10, slot: 0 },
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
      description: "array declared",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [
        { kind: "read", address: { space: "stack", id: 10, slot: 1 } },
      ],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      steps: [step],
    };

    const html = renderToStaticMarkup(<VariableArrayViewPanel />);
    expect(html).toContain("arr");
    expect(html).toContain("int[3]");
    expect(html).toContain("@S010");
    // Formatted as [0] = 10, [1] = 20
    expect(html).toContain("[0] =");
    expect(html).toContain("10");
    expect(html).toContain("[1] =");
    expect(html).toContain("20");
    expect(html).toContain("[2] =");
    expect(html).toContain("30");
    // Read highlight on slot 1
    expect(html).toContain("border-[#22d3ee]");
  });

  it("renders 2D array with [0][2] = 4, dimensions, and locations", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        matrix: {
          kind: "array",
          type: "int[2][3]",
          address: { space: "stack", id: 20, slot: 0 },
          length: 6,
          dimensions: [2, 3],
          values: [
            { kind: "scalar", type: "int", value: 1 },
            { kind: "scalar", type: "int", value: 2 },
            { kind: "scalar", type: "int", value: 3 },
            { kind: "scalar", type: "int", value: 4 },
            { kind: "scalar", type: "int", value: 5 },
            { kind: "scalar", type: "int", value: 6 },
          ],
        },
      },
      addresses: {
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
      description: "matrix declared",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [
        { kind: "write", address: { space: "stack", id: 20, slot: 2 } }, // matrix[0][2]
      ],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      steps: [step],
    };

    const html = renderToStaticMarkup(<VariableArrayViewPanel />);
    expect(html).toContain("matrix");
    expect(html).toContain("int[2][3]");
    expect(html).toContain("2 × 3 matrix");
    expect(html).toContain("@S020");
    // Row headers
    expect(html).toContain("Row 0");
    expect(html).toContain("Row 1");
    // Formatted with coordinate header [r][c] and direct value (e.g. [0][0] header with value 1)
    expect(html).toContain("[0][0]");
    expect(html).not.toContain("[0][0] =");
    expect(html).toContain("1");
    expect(html).toContain("[0][2]");
    expect(html).toContain("3");
    expect(html).toContain("[1][0]");
    expect(html).toContain("4");
    expect(html).toContain("[1][2]");
    expect(html).toContain("6");
    // Slot 2 write highlight
    expect(html).toContain("border-[#f59e0b]");
  });

  it("excludes pointers and heap blocks from VariableArrayViewPanel", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        val: { kind: "scalar", type: "int", value: 100 },
        ptr: { kind: "pointer", type: "int", target: { space: "stack", id: 1, slot: 0 } },
      },
      addresses: {
        val: { space: "stack", id: 1, slot: 0 },
        ptr: { space: "stack", id: 2, slot: 0 },
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
      description: "test",
      variables: {},
      callStack: [frame],
      heap: [
        {
          address: { space: "heap", id: 1, slot: 0 },
          slotCount: 1,
          byteSize: 4,
          active: true,
          origin: "malloc",
          values: [{ kind: "scalar", type: "int", value: 999 }],
        },
      ],
      stepAccesses: [],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      steps: [step],
    };

    const html = renderToStaticMarkup(<VariableArrayViewPanel />);
    expect(html).toContain("val");
    expect(html).toContain("100");
    // ptr and heap H001 must NOT be displayed
    expect(html).not.toContain("ptr");
    expect(html).not.toContain("H001");
    expect(html).not.toContain("999");
  });

  it("VariablePanel (bottom panel) displays 2D array coordinates [0][0] = 0, [0][1] = 1 and location", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        matrix: {
          kind: "array",
          type: "int[2][3]",
          address: { space: "stack", id: 5, slot: 0 },
          length: 6,
          dimensions: [2, 3],
          values: [
            { kind: "scalar", type: "int", value: 10 },
            { kind: "scalar", type: "int", value: 20 },
            { kind: "scalar", type: "int", value: 30 },
            { kind: "scalar", type: "int", value: 40 },
            { kind: "scalar", type: "int", value: 50 },
            { kind: "scalar", type: "int", value: 60 },
          ],
        },
      },
      addresses: {
        matrix: { space: "stack", id: 5, slot: 0 },
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
      description: "matrix",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [],
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      steps: [step],
    };

    const html = renderToStaticMarkup(<VariablePanel />);
    expect(html).toContain("matrix");
    expect(html).toContain("@S005");
    // Verify 2D coordinates [0][0] = 10, [0][1] = 20, [1][2] = 60
    expect(html).toContain("[0][0] = 10");
    expect(html).toContain("[0][1] = 20");
    expect(html).toContain("[0][2] = 30");
    expect(html).toContain("[1][0] = 40");
    expect(html).toContain("[1][1] = 50");
    expect(html).toContain("[1][2] = 60");
  });
});
