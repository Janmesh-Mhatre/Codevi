import { vi, describe, expect, it, beforeAll, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Parser, Tree } from "web-tree-sitter";
import { getParser } from "../helpers/interpreterTestHelpers";
import {
  INITIAL_EXECUTION_STATE,
  type ExecutionState,
  type ExecutionStep,
  type StackFrame,
  type HeapBlock,
  type ExecutionValue,
} from "../../../src/execution/models/executionTypes";
import { ExecutionEngine } from "../../../src/execution/engine/ExecutionEngine";
import { NewVisualizationPanel } from "../../../src/components/panels/NewVisualizationPanel";

let mockTree: Tree | null = null;
vi.mock("../../../src/parser/parserService", () => ({
  getCurrentTree: () => mockTree,
  getLastDiagnostics: () => [],
}));

let mockState: ExecutionState = INITIAL_EXECUTION_STATE;

vi.mock("../../../src/state/executionStore", () => ({
  useExecutionStore: (selector?: (s: ExecutionState) => any) =>
    selector ? selector(mockState) : mockState,
}));

async function waitFor(
  getState: () => ExecutionState,
  predicate: (state: ExecutionState) => boolean,
  timeoutMs = 3000,
): Promise<ExecutionState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`waitFor timed out; last state: ${JSON.stringify(getState())}`);
}

let parser: InstanceType<typeof Parser>;

beforeAll(async () => {
  parser = await getParser();
});

afterEach(() => {
  mockTree?.delete();
  mockTree = null;
  mockState = { ...INITIAL_EXECUTION_STATE };
});

function setSource(source: string): void {
  mockTree = parser.parse(source);
}

describe("NewVisualizationPanel: Phase 6.5 V1 Graph Integration", () => {
  // TEST 1: POINTER GRAPH (User's Exact Example)
  it("TEST 1: renders pointer graph with cycles and multi-branches on right side with Heap-card style", async () => {
    setSource(`
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
          struct Node *alternate;
      };

      int main() {
          struct Node *A = malloc(sizeof(struct Node));
          struct Node *B = malloc(sizeof(struct Node));
          struct Node *C = malloc(sizeof(struct Node));

          A->data = 10;
          B->data = 20;
          C->data = 30;

          A->next = B;
          A->alternate = C;

          B->next = C;
          B->alternate = A;

          C->next = A;
          C->alternate = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    // 1. Column headers: STACK (Memory) on left, GRAPH on right
    expect(html).toContain("STACK (Memory)");
    expect(html).toContain("GRAPH");

    // 2. Representation badge
    expect(html).toContain("Representation: Pointer Graph");

    // 3. Stack variables and Heap nodes
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");

    // 4. Node values and labels
    expect(html).toContain("value:");
    expect(html).toContain("10");
    expect(html).toContain("20");
    expect(html).toContain("30");

    // 5. Connectors rendered behind cards
    expect(html).toContain("graph-connectors");
    expect(html).toContain("graph-edge");
    expect(html).toContain("graph-edge-directed");
  });

  // TEST 2: SHARED DESTINATION
  it("TEST 2: renders shared destination graph where node receives multiple incoming edges", async () => {
    setSource(`
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
          struct Node *other;
      };

      int main() {
          struct Node *a = malloc(sizeof(struct Node));
          struct Node *b = malloc(sizeof(struct Node));
          struct Node *c = malloc(sizeof(struct Node));
          struct Node *d = malloc(sizeof(struct Node));

          a->data = 1;
          b->data = 2;
          c->data = 3;
          d->data = 4;

          a->next = b;
          a->other = c;
          b->next = d;
          c->next = d;
          d->next = NULL;
          d->other = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Pointer Graph");
    expect(html).toContain("H004");
    expect(html).toContain("graph-connectors");
  });

  // TEST 3: CYCLE
  it("TEST 3: renders a 3-node cycle A -> B -> C -> A", async () => {
    setSource(`
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *a = malloc(sizeof(struct Node));
          struct Node *b = malloc(sizeof(struct Node));
          struct Node *c = malloc(sizeof(struct Node));

          a->data = 10;
          b->data = 20;
          c->data = 30;

          a->next = b;
          b->next = c;
          c->next = a;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Pointer Graph");
    expect(html).toContain("graph-connectors");
  });

  // TEST 4: SELF LOOP
  it("TEST 4: renders visible self loop A -> A without obscuring card content", async () => {
    setSource(`
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *a = malloc(sizeof(struct Node));
          a->data = 99;
          a->next = a;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Pointer Graph");
    expect(html).toContain("graph-edge-self-loop");
    expect(html).toContain("99");
    expect(html).toContain("H001");
  });

  // TEST 5: DISCONNECTED COMPONENTS
  it("TEST 5: renders disconnected components (A -> B) and (C -> D)", async () => {
    setSource(`
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *a = malloc(sizeof(struct Node));
          struct Node *b = malloc(sizeof(struct Node));
          struct Node *c = malloc(sizeof(struct Node));
          struct Node *d = malloc(sizeof(struct Node));

          a->data = 1;
          b->data = 2;
          c->data = 3;
          d->data = 4;

          a->next = b;
          b->next = NULL;

          c->next = d;
          d->next = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Pointer Graph");
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
    expect(html).toContain("H004");
  });

  // TEST 6: ADJACENCY MATRIX
  it("TEST 6: renders adjacency matrix as Graph on the right side and suppresses duplicate array card", () => {
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

    const frame: StackFrame = {
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
    };

    const step: ExecutionStep = {
      line: 10,
      column: 0,
      endLine: 10,
      endColumn: 20,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "matrix graph",
      variables: {},
      callStack: [frame],
      heap: [],
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "graph",
            address: { space: "stack", id: 1, slot: 0 },
            value: matrixVal,
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

    // 1. Structural right side identifies Graph
    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Adjacency Matrix");

    // 2. Matrix graph nodes are rendered
    expect(html).toContain("matrix-graph-node");
    expect(html).toContain("Node A");
    expect(html).toContain("Node B");
    expect(html).toContain("Node C");
    expect(html).toContain("Node D");

    // 3. Duplicate Array card is suppressed from the upper section
    expect(html).not.toContain("Arrays (1D &amp; 2D)");
  });

  // TEST 7: ADJACENCY LIST
  it("TEST 7: renders adjacency list as Graph on right side", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 1 },
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
          { kind: "scalar", type: "int", value: 2 },
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
          { kind: "scalar", type: "int", value: 0 },
          { kind: "pointer", type: "struct Node*", target: null },
        ],
      },
    ];

    const adjVal: ExecutionValue = {
      kind: "array",
      type: "struct Node*[3]",
      length: 3,
      values: [
        { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
        { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 2, slot: 0 } },
        { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 3, slot: 0 } },
      ],
    };

    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 12,
      parameters: {},
      locals: {
        adj: adjVal,
      },
      addresses: {
        adj: { space: "stack", id: 1, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 12,
      column: 0,
      endLine: 12,
      endColumn: 20,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "adjacency list",
      variables: {},
      callStack: [frame],
      heap,
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "adj",
            address: { space: "stack", id: 1, slot: 0 },
            value: adjVal,
            isArray: true,
          },
        ],
        heapBlocks: heap,
      },
    };

    mockState = {
      ...INITIAL_EXECUTION_STATE,
      status: "paused",
      currentStep: step,
      history: [step],
    };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Adjacency List");
    expect(html).toContain("matrix-graph-node");
    expect(html).toContain("Node A");
  });

  // TEST 8: LINKED LIST REGRESSION
  it("TEST 8: preserves ordinary linked list as Heap without misclassifying as Graph", async () => {
    setSource(`
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *head = malloc(sizeof(struct Node));
          struct Node *second = malloc(sizeof(struct Node));
          struct Node *third = malloc(sizeof(struct Node));

          head->data = 10;
          second->data = 20;
          third->data = 30;

          head->next = second;
          second->next = third;
          third->next = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    // Header must remain HEAP (or Tree), NOT Graph
    expect(html).toContain("HEAP");
    expect(html).not.toContain("Representation: Pointer Graph");
    expect(html).not.toContain("Representation: Adjacency Matrix");
  });

  // TEST 9: BINARY TREE REGRESSION
  it("TEST 9: preserves binary tree as Tree without misclassifying as Graph", async () => {
    setSource(`
      #include <stdlib.h>

      struct TreeNode {
          int val;
          struct TreeNode *left;
          struct TreeNode *right;
      };

      int main() {
          struct TreeNode *root = malloc(sizeof(struct TreeNode));
          struct TreeNode *l = malloc(sizeof(struct TreeNode));
          struct TreeNode *r = malloc(sizeof(struct TreeNode));

          root->val = 2;
          l->val = 1;
          r->val = 3;

          l->left = NULL;
          l->right = NULL;
          r->left = NULL;
          r->right = NULL;

          root->left = l;
          root->right = r;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    // Header must be TREE with BST badge
    expect(html).toContain("TREE");
    expect(html).toContain("Valid BST");
    expect(html).not.toContain("Representation: Pointer Graph");
  });

  // TEST 10: HEAP REGRESSION
  it("TEST 10: preserves normal malloc and free heap blocks", async () => {
    setSource(`
      #include <stdlib.h>

      int main() {
          int *p = malloc(sizeof(int));
          *p = 42;
          free(p);
          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    expect(html).toContain("HEAP");
    expect(html).toContain("freed");
    expect(html).toContain("H001");
    expect(html).not.toContain("Representation: Pointer Graph");
  });

  // TEST 11 (P0-1): EDGE LABEL POSITIONING
  it("TEST 11 (P0-1): renders edge labels derived from actual source/target layout and not at x=0, y=0", () => {
    const matrixVal: ExecutionValue = {
      kind: "array",
      type: "int[3][3]",
      length: 9,
      dimensions: [3, 3],
      values: [
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 5 }, // edge A -> B with weight 5
        { kind: "scalar", type: "int", value: 0 },

        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 8 }, // edge B -> C with weight 8

        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
      ],
    };

    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        adj: matrixVal,
      },
      addresses: {
        adj: { space: "stack", id: 1, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 5,
      column: 0,
      endLine: 5,
      endColumn: 20,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "matrix graph",
      variables: {},
      callStack: [frame],
      heap: [],
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "adj",
            address: { space: "stack", id: 1, slot: 0 },
            value: matrixVal,
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

    // Edge weights '5' and '8' must be rendered as text labels
    expect(html).toContain(">5<");
    expect(html).toContain(">8<");

    // Must NOT contain hardcoded x="0" y="0" text label coordinates
    expect(html).not.toMatch(/<text[^>]*x="0"[^>]*y="0"[^>]*>5<\/text>/);
    expect(html).not.toMatch(/<text[^>]*x="0"[^>]*y="0"[^>]*>8<\/text>/);
  });

  // TEST 12 (P0-2): HEAP + GRAPH SPATIAL COEXISTENCE
  it("TEST 12 (P0-2): renders both Heap and Graph without spatial collision when program has both", async () => {
    setSource(`
      #include <stdlib.h>

      int main() {
          int *p = malloc(sizeof(int));
          *p = 42;

          int adj[3][3] = {
              {0, 1, 0},
              {0, 0, 1},
              {1, 0, 0}
          };

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    // 1. Both HEAP and GRAPH headers must be present
    expect(html).toContain("HEAP");
    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Adjacency Matrix");

    // 2. Both heap blocks and matrix graph nodes are rendered
    expect(html).toContain("H001");
    expect(html).toContain("matrix-graph-node");
    expect(html).toContain("Node A");
    expect(html).toContain("Node B");
    expect(html).toContain("Node C");
  });

  // TEST 13 (P0-3): MULTIPLE GRAPHS
  it("TEST 13 (P0-3): renders multiple detected graph structures simultaneously without disappearing or overlapping", () => {
    const graph1Val: ExecutionValue = {
      kind: "array",
      type: "int[3][3]",
      length: 9,
      dimensions: [3, 3],
      values: [
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
      ],
    };

    const graph2Val: ExecutionValue = {
      kind: "array",
      type: "int[4][4]",
      length: 16,
      dimensions: [4, 4],
      values: [
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },

        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },

        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 1 },

        { kind: "scalar", type: "int", value: 1 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
      ],
    };

    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 10,
      parameters: {},
      locals: {
        graph1: graph1Val,
        graph2: graph2Val,
      },
      addresses: {
        graph1: { space: "stack", id: 1, slot: 0 },
        graph2: { space: "stack", id: 2, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 10,
      column: 0,
      endLine: 10,
      endColumn: 20,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "two graphs",
      variables: {},
      callStack: [frame],
      heap: [],
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "graph1",
            address: { space: "stack", id: 1, slot: 0 },
            value: graph1Val,
            isArray: true,
          },
          {
            name: "graph2",
            address: { space: "stack", id: 2, slot: 0 },
            value: graph2Val,
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

    // Both graphs must be identified and rendered
    expect(html).toContain("GRAPH: GRAPH1");
    expect(html).toContain("GRAPH: GRAPH2");
    expect(html).toContain("Representation: Adjacency Matrix");

    // Graph 1 has 3 nodes (A, B, C); Graph 2 has 4 nodes (A, B, C, D)
    expect(html).toContain("Node D");

    // Both graph variables must be accounted for and neither should show in the normal array panel
    expect(html).not.toContain("Arrays (1D &amp; 2D)");
  });

  // TEST 14 (P1): LAYER-0 SELF-LOOP / HEADER CLEARANCE
  it("TEST 14 (P1): layer-0 self loop does not collide with Graph header or badge", () => {
    const matrixWithSelfLoop: ExecutionValue = {
      kind: "array",
      type: "int[2][2]",
      length: 4,
      dimensions: [2, 2],
      values: [
        { kind: "scalar", type: "int", value: 1 }, // self-loop on node A (layer 0)
        { kind: "scalar", type: "int", value: 1 }, // A -> B
        { kind: "scalar", type: "int", value: 0 },
        { kind: "scalar", type: "int", value: 0 },
      ],
    };

    const frame: StackFrame = {
      functionName: "main",
      callDepth: 1,
      line: 5,
      parameters: {},
      locals: {
        graph: matrixWithSelfLoop,
      },
      addresses: {
        graph: { space: "stack", id: 1, slot: 0 },
      },
      isActive: true,
    };

    const step: ExecutionStep = {
      line: 5,
      column: 0,
      endLine: 5,
      endColumn: 20,
      astNodeType: "declaration",
      functionName: "main",
      callDepth: 1,
      description: "self loop on layer 0",
      variables: {},
      callStack: [frame],
      heap: [],
      pointerView: {
        relationships: [],
        stackVariables: [
          {
            name: "graph",
            address: { space: "stack", id: 1, slot: 0 },
            value: matrixWithSelfLoop,
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

    expect(html).toContain("GRAPH");
    expect(html).toContain("Representation: Adjacency Matrix");
    expect(html).toContain("matrix-graph-node");
    expect(html).toContain("Node A");
    expect(html).toContain("Node B");
  });

  // TEST 15: ORDINARY MATRIX PRESERVATION
  it("TEST 15: ordinary 2D matrix without graph naming does not get converted to a graph", async () => {
    setSource(`
      int main() {
          int matrix[3][3] = {
              {1, 2, 3},
              {4, 5, 6},
              {7, 8, 9}
          };
          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<NewVisualizationPanel />);

    // Must be rendered in Arrays panel, NOT as a Graph
    expect(html).toContain("Arrays (1D &amp; 2D)");
    expect(html).not.toContain("Representation: Adjacency Matrix");
  });
});
