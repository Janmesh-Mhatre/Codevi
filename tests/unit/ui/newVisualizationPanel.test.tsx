import { describe, expect, it, beforeEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  INITIAL_EXECUTION_STATE,
  type ExecutionState,
  type ExecutionStep,
  type StackFrame,
  type HeapBlock,
  type PointerRelationship,
  type PointerViewVariable,
} from "../../../src/execution/models/executionTypes";

let mockState: ExecutionState = INITIAL_EXECUTION_STATE;

vi.mock("../../../src/state/executionStore", () => ({
  useExecutionStore: (selector?: (s: ExecutionState) => any) =>
    selector ? selector(mockState) : mockState,
}));

const { NewVisualizationPanel } = await import("../../../src/components/panels/NewVisualizationPanel");

describe("NewVisualizationPanel (Phase 6.4.2)", () => {
  beforeEach(() => {
    mockState = { ...INITIAL_EXECUTION_STATE };
  });

  it("renders idle empty state when execution is idle", () => {
    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    expect(html).toContain("Visualization");
    expect(html).toContain("Data structures (Arrays, Stacks, Queues) and memory allocations will appear here");
  });

  it("TEST A: renders array automatically without selectors using existing visual style", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        numbers: {
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
        numbers: { space: "stack", id: 10, slot: 0 },
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
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "numbers",
            address: { space: "stack", id: 10, slot: 0 },
            value: frame.locals.numbers,
            isArray: true,
          },
        ],
        heapBlocks: [],
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    // Array appears automatically
    expect(html).toContain("Arrays (1D &amp; 2D)");
    expect(html).toContain("numbers");
    expect(html).toContain("int[3]");
    expect(html).toContain("@S010");
    expect(html).toContain("3 elements");
    expect(html).toContain("[0] =");
    expect(html).toContain("10");
    expect(html).toContain("[1] =");
    expect(html).toContain("20");
    expect(html).toContain("[2] =");
    expect(html).toContain("30");
    // Read highlight on slot 1
    expect(html).toContain("border-[#22d3ee]");
    // No selector buttons exist
    expect(html).not.toContain("<button>Array</button>");
    expect(html).not.toContain("<button>Stack</button>");
    expect(html).not.toContain("<button>Queue</button>");
  });

  it("TEST B: renders Stack data structure automatically with top indicator", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 6,
      parameters: {},
      locals: {
        stack: {
          kind: "array",
          type: "int[5]",
          address: { space: "stack", id: 15, slot: 0 },
          length: 5,
          values: [
            { kind: "scalar", type: "int", value: 100 },
            { kind: "scalar", type: "int", value: 200 },
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
          ],
        },
        top: { kind: "scalar", type: "int", value: 1 },
      },
      addresses: {
        stack: { space: "stack", id: 15, slot: 0 },
        top: { space: "stack", id: 16, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 6,
      column: 0,
      endLine: 6,
      endColumn: 10,
      astNodeType: "assignment",
      functionName: "main",
      callDepth: 1,
      description: "stack pushed",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [
        { kind: "write", address: { space: "stack", id: 15, slot: 1 } },
      ],
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "stack",
            address: { space: "stack", id: 15, slot: 0 },
            value: frame.locals.stack,
            isArray: true,
          },
          {
            name: "top",
            address: { space: "stack", id: 16, slot: 0 },
            value: frame.locals.top,
            isArray: false,
          },
        ],
        heapBlocks: [],
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    // Stack DS header
    expect(html).toContain("Stack (LIFO)");
    expect(html).toContain("STACK");
    expect(html).toContain("top = 1");
    expect(html).toContain("5 capacity");
    expect(html).toContain("@S015");
    expect(html).toContain("← TOP");
    expect(html).toContain("push ↑ · pop ↓");
  });

  it("TEST C: renders Queue data structure automatically with front and rear pipe layout", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 7,
      parameters: {},
      locals: {
        queue: {
          kind: "array",
          type: "int[5]",
          address: { space: "stack", id: 25, slot: 0 },
          length: 5,
          values: [
            { kind: "scalar", type: "int", value: 1 },
            { kind: "scalar", type: "int", value: 2 },
            { kind: "scalar", type: "int", value: 3 },
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
          ],
        },
        front: { kind: "scalar", type: "int", value: 0 },
        rear: { kind: "scalar", type: "int", value: 2 },
      },
      addresses: {
        queue: { space: "stack", id: 25, slot: 0 },
        front: { space: "stack", id: 26, slot: 0 },
        rear: { space: "stack", id: 27, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 7,
      column: 0,
      endLine: 7,
      endColumn: 10,
      astNodeType: "assignment",
      functionName: "main",
      callDepth: 1,
      description: "queue enqueued",
      variables: {},
      callStack: [frame],
      heap: [],
      stepAccesses: [],
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "queue",
            address: { space: "stack", id: 25, slot: 0 },
            value: frame.locals.queue,
            isArray: true,
          },
        ],
        heapBlocks: [],
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    expect(html).toContain("Queue (FIFO)");
    expect(html).toContain("QUEUE");
    expect(html).toContain("front = 0 · rear = 2");
    expect(html).toContain("front ↓");
    expect(html).toContain("rear ↓");
    expect(html).toContain("← dequeue (front)");
    expect(html).toContain("enqueue (rear) →");
  });

  it("TEST D & E: renders Array, Stack DS, and Queue DS vertically in exact order", () => {
    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 10,
      parameters: {},
      locals: {
        normalArr: {
          kind: "array",
          type: "int[2]",
          address: { space: "stack", id: 30, slot: 0 },
          length: 2,
          values: [
            { kind: "scalar", type: "int", value: 11 },
            { kind: "scalar", type: "int", value: 22 },
          ],
        },
        stackArr: {
          kind: "array",
          type: "int[3]",
          address: { space: "stack", id: 40, slot: 0 },
          length: 3,
          values: [
            { kind: "scalar", type: "int", value: 33 },
            { kind: "scalar", type: "int", value: 44 },
            { kind: "scalar", type: "int", value: 0 },
          ],
        },
        top: { kind: "scalar", type: "int", value: 1 },
        queueArr: {
          kind: "array",
          type: "int[4]",
          address: { space: "stack", id: 50, slot: 0 },
          length: 4,
          values: [
            { kind: "scalar", type: "int", value: 55 },
            { kind: "scalar", type: "int", value: 66 },
            { kind: "scalar", type: "int", value: 0 },
            { kind: "scalar", type: "int", value: 0 },
          ],
        },
        front: { kind: "scalar", type: "int", value: 0 },
        rear: { kind: "scalar", type: "int", value: 1 },
      },
      addresses: {
        normalArr: { space: "stack", id: 30, slot: 0 },
        stackArr: { space: "stack", id: 40, slot: 0 },
        top: { space: "stack", id: 41, slot: 0 },
        queueArr: { space: "stack", id: 50, slot: 0 },
        front: { space: "stack", id: 51, slot: 0 },
        rear: { space: "stack", id: 52, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 10,
      column: 0,
      endLine: 10,
      endColumn: 10,
      astNodeType: "assignment",
      functionName: "main",
      callDepth: 1,
      description: "step",
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

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    const arrayPos = html.indexOf("Arrays (1D &amp; 2D)");
    const stackPos = html.indexOf("Stack (LIFO)");
    const queuePos = html.indexOf("Queue (FIFO)");

    expect(arrayPos).toBeGreaterThan(-1);
    expect(stackPos).toBeGreaterThan(-1);
    expect(queuePos).toBeGreaterThan(-1);

    // Exact vertical ordering: Array < Stack < Queue
    expect(arrayPos).toBeLessThan(stackPos);
    expect(stackPos).toBeLessThan(queuePos);
  });

  it("TEST F: renders only STACK (Memory) when no heap allocations exist and expands horizontally", () => {
    const stackVars: PointerViewVariable[] = [
      {
        name: "x",
        address: { space: "stack", id: 1, slot: 0 },
        value: { kind: "scalar", type: "int", value: 42 },
        isArray: false,
      },
      {
        name: "y",
        address: { space: "stack", id: 2, slot: 0 },
        value: { kind: "scalar", type: "int", value: 99 },
        isArray: false,
      },
    ];

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
      callStack: [],
      heap: [],
      pointerView: {
        relationships: [],
        stackVariables: stackVars,
        heapBlocks: [],
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    expect(html).toContain("STACK (Memory)");
    expect(html).not.toContain(">HEAP<");
    expect(html).not.toContain(">TREE<");
    expect(html).toContain("x");
    expect(html).toContain("42");
    expect(html).toContain("y");
    expect(html).toContain("99");
    expect(html).toContain('width="320"');
  });

  it("TEST G: renders STACK (Memory) and HEAP side-by-side when non-tree heap blocks exist", () => {
    const stackVars: PointerViewVariable[] = [
      {
        name: "head",
        address: { space: "stack", id: 1, slot: 0 },
        value: {
          kind: "pointer",
          type: "struct Node",
          target: { space: "heap", id: 1, slot: 0 },
        },
        isArray: false,
      },
    ];

    const heapBlocks: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        byteSize: 16,
        slotCount: 2,
        origin: "malloc(16)",
        active: true,
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct Node", target: null },
        ],
      },
    ];

    const rels: PointerRelationship[] = [
      {
        pointerName: "head",
        pointerAddress: { space: "stack", id: 1, slot: 0 },
        targetAddress: { space: "heap", id: 1, slot: 0 },
        targetName: "H001",
        targetRegion: "heap",
        status: "valid",
        chainDepth: 0,
      },
    ];

    const step: ExecutionStep = {
      line: 5,
      column: 0,
      endLine: 5,
      endColumn: 10,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "step",
      variables: {},
      callStack: [],
      heap: heapBlocks,
      pointerView: {
        relationships: rels,
        stackVariables: stackVars,
        heapBlocks,
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    expect(html).toContain("STACK (Memory)");
    expect(html).toContain(">HEAP<");
    expect(html).not.toContain(">TREE<");
    expect(html).toContain("head");
    expect(html).toContain("H001");
  });

  it("TEST H: renders TREE heading instead of HEAP when a tree data structure is detected", () => {
    const stackVars: PointerViewVariable[] = [
      {
        name: "root",
        address: { space: "stack", id: 1, slot: 0 },
        value: {
          kind: "pointer",
          type: "struct TreeNode",
          target: { space: "heap", id: 1, slot: 0 },
        },
        isArray: false,
      },
    ];

    const heapBlocks: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        byteSize: 24,
        slotCount: 3,
        origin: "malloc(24)",
        active: true,
        values: [
          { kind: "scalar", type: "int", value: 50 },
          { kind: "pointer", type: "struct TreeNode", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct TreeNode", target: { space: "heap", id: 3, slot: 0 } },
        ],
      },
      {
        address: { space: "heap", id: 2, slot: 0 },
        byteSize: 24,
        slotCount: 3,
        origin: "malloc(24)",
        active: true,
        values: [
          { kind: "scalar", type: "int", value: 25 },
          { kind: "pointer", type: "struct TreeNode", target: null },
          { kind: "pointer", type: "struct TreeNode", target: null },
        ],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        byteSize: 24,
        slotCount: 3,
        origin: "malloc(24)",
        active: true,
        values: [
          { kind: "scalar", type: "int", value: 75 },
          { kind: "pointer", type: "struct TreeNode", target: null },
          { kind: "pointer", type: "struct TreeNode", target: null },
        ],
      },
    ];

    const rels: PointerRelationship[] = [
      {
        pointerName: "root",
        pointerAddress: { space: "stack", id: 1, slot: 0 },
        targetAddress: { space: "heap", id: 1, slot: 0 },
        targetName: "H001",
        targetRegion: "heap",
        status: "valid",
        chainDepth: 0,
      },
      {
        pointerName: "H001->left",
        pointerAddress: { space: "heap", id: 1, slot: 1 },
        fieldName: "left",
        targetAddress: { space: "heap", id: 2, slot: 0 },
        targetName: "H002",
        targetRegion: "heap",
        status: "valid",
        chainDepth: 0,
      },
      {
        pointerName: "H001->right",
        pointerAddress: { space: "heap", id: 1, slot: 2 },
        fieldName: "right",
        targetAddress: { space: "heap", id: 3, slot: 0 },
        targetName: "H003",
        targetRegion: "heap",
        status: "valid",
        chainDepth: 0,
      },
    ];

    const step: ExecutionStep = {
      line: 10,
      column: 0,
      endLine: 10,
      endColumn: 10,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "step",
      variables: {},
      callStack: [],
      heap: heapBlocks,
      pointerView: {
        relationships: rels,
        stackVariables: stackVars,
        heapBlocks,
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);
    expect(html).toContain("STACK (Memory)");
    expect(html).toContain(">TREE<");
    expect(html).not.toContain(">HEAP<");
    expect(html).toContain("Valid BST");
  });

  describe("Phase 6.4.3: Compact Array Representation & Refinements", () => {
    it("renders array in Stack Memory compactly with ARRAY badge and type without duplicated element cells", () => {
      const frame: StackFrame = {
        functionName: "main",
        callDepth: 1,
        line: 5,
        parameters: {},
        locals: {
          arr: {
            kind: "array",
            type: "int[5]",
            address: { space: "stack", id: 10, slot: 0 },
            length: 5,
            values: [
              { kind: "scalar", type: "int", value: 100 },
              { kind: "scalar", type: "int", value: 200 },
              { kind: "scalar", type: "int", value: 300 },
              { kind: "scalar", type: "int", value: 400 },
              { kind: "scalar", type: "int", value: 500 },
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
        stepAccesses: [],
        pointerView: {
          relationships: [],
          stackVariables: [
            {
              name: "arr",
              address: { space: "stack", id: 10, slot: 0 },
              value: frame.locals.arr,
              isArray: true,
            },
          ],
          heapBlocks: [],
        },
      };

      mockState = {
        ...INITIAL_EXECUTION_STATE,
        status: "paused",
        currentStep: step,
        history: [step],
      };

      const html = renderToStaticMarkup(<NewVisualizationPanel />);

      // Stack Memory shows compact array declaration & badge
      expect(html).toContain("array-indicator-badge");
      expect(html).toContain(">ARRAY<");
      expect(html).toContain("int[5]");
      expect(html).toContain("@S010");

      // Actual Array visualization still displays all elements and values
      expect(html).toContain("Arrays (1D &amp; 2D)");
      expect(html).toContain("5 elements");
      expect(html).toContain("100");
      expect(html).toContain("500");
    });

    it("renders large 2D array compactly in Stack Memory without text overflow or spillage", () => {
      const zeros = Array.from({ length: 100 }, () => ({
        kind: "scalar" as const,
        type: "int",
        value: 0,
      }));

      const frame: StackFrame = {
        functionName: "main",
        callDepth: 1,
        line: 5,
        parameters: {},
        locals: {
          matrix: {
            kind: "array",
            type: "int",
            dimensions: [10, 10],
            address: { space: "stack", id: 20, slot: 0 },
            length: 100,
            values: zeros,
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
        description: "2D matrix declared",
        variables: {},
        callStack: [frame],
        heap: [],
        stepAccesses: [],
        pointerView: {
          relationships: [],
          stackVariables: [
            {
              name: "matrix",
              address: { space: "stack", id: 20, slot: 0 },
              value: frame.locals.matrix,
              isArray: true,
            },
          ],
          heapBlocks: [],
        },
      };

      mockState = {
        ...INITIAL_EXECUTION_STATE,
        status: "paused",
        currentStep: step,
        history: [step],
      };

      const html = renderToStaticMarkup(<NewVisualizationPanel />);

      // Compact Stack Memory representation shows int[10][10] and ARRAY
      expect(html).toContain("int[10][10]");
      expect(html).toContain(">ARRAY<");
      expect(html).toContain("@S020");

      // Matrix is displayed in dedicated Array visualization
      expect(html).toContain("10 × 10 matrix");
      expect(html).toContain("Row 0");
      expect(html).toContain("Row 9");
    });

    it("renders Heap status pill badge and MemoryStick symbol", () => {
      const heapBlocks: HeapBlock[] = [
        {
          address: { space: "heap", id: 1, slot: 0 },
          byteSize: 16,
          slotCount: 2,
          origin: "malloc(16)",
          active: true,
          values: [
            { kind: "scalar", type: "int", value: 42 },
            { kind: "scalar", type: "int", value: 84 },
          ],
        },
      ];

      const step: ExecutionStep = {
        line: 8,
        column: 0,
        endLine: 8,
        endColumn: 10,
        astNodeType: "declaration",
        functionName: "main",
        callDepth: 1,
        description: "allocated",
        variables: {},
        callStack: [],
        heap: heapBlocks,
        pointerView: {
          relationships: [],
          stackVariables: [],
          heapBlocks,
        },
      };

      mockState = {
        ...INITIAL_EXECUTION_STATE,
        status: "paused",
        currentStep: step,
        history: [step],
      };

      const html = renderToStaticMarkup(<NewVisualizationPanel />);
      expect(html).toContain("heap-status-badge");
      expect(html).toContain(">active<");
      expect(html).toContain("H001");
    });
  });
});
