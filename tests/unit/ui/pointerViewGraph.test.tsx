import { vi, describe, expect, it, beforeAll, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Parser, Tree } from "web-tree-sitter";
import { getParser } from "../helpers/interpreterTestHelpers";
import { INITIAL_EXECUTION_STATE, type ExecutionState } from "../../../src/execution/models/executionTypes";
import { ExecutionEngine } from "../../../src/execution/engine/ExecutionEngine";
import { PointerViewPanel } from "../../../src/components/panels/PointerViewPanel";

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

describe("Pointer View: Graph Visualization Foundation", () => {
  // Test 1: Pointer Graph with shared destination
  it("renders a 4-node DAG graph with shared destination and representation badge", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
          struct Node *other;
      };

      int main() {
          struct Node *a;
          struct Node *b;
          struct Node *c;
          struct Node *d;

          a = malloc(sizeof(struct Node));
          b = malloc(sizeof(struct Node));
          c = malloc(sizeof(struct Node));
          d = malloc(sizeof(struct Node));

          a->data = 10;
          b->data = 20;
          c->data = 30;
          d->data = 40;

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

    const html = renderToStaticMarkup(<PointerViewPanel />);

    // 1. Column headers
    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");

    // 2. Representation badge
    expect(html).toContain("Representation: Pointer Graph");

    // 3. Stack variables and Heap nodes
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
    expect(html).toContain("H004");

    // 4. Graph connector classes
    expect(html).toContain("graph-connectors");
    expect(html).toContain("graph-edge");
    expect(html).toContain("graph-edge-directed");
  });

  // Test 2: Cycle: A -> B -> C -> A
  it("renders a 3-node cycle without crashing or stack overflow", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *a;
          struct Node *b;
          struct Node *c;

          a = malloc(sizeof(struct Node));
          b = malloc(sizeof(struct Node));
          c = malloc(sizeof(struct Node));

          a->data = 1;
          b->data = 2;
          c->data = 3;

          a->next = b;
          b->next = c;
          c->next = a; // cycle

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);

    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");
    expect(html).toContain("Representation: Pointer Graph");
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
    expect(html).toContain("graph-connectors");
  });

  // Test 3: Self-loop: A -> A
  it("renders a self-loop safely", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *a;
          a = malloc(sizeof(struct Node));
          a->data = 99;
          a->next = a; // self loop

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);

    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");
    expect(html).toContain("Representation: Pointer Graph");
    expect(html).toContain("H001");
    expect(html).toContain("graph-edge-self-loop");
  });

  // Test 4: Disconnected Components: A -> B and C -> D
  it("renders disconnected graph components cleanly", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *a;
          struct Node *b;
          struct Node *c;
          struct Node *d;

          a = malloc(sizeof(struct Node));
          b = malloc(sizeof(struct Node));
          c = malloc(sizeof(struct Node));
          d = malloc(sizeof(struct Node));

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

    const html = renderToStaticMarkup(<PointerViewPanel />);

    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
    expect(html).toContain("H004");
  });

  // Test 5: Regression: Ordinary Linked List remains Linked List, NOT Graph
  it("preserves ordinary linked list and does NOT show Representation: Pointer Graph", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *head;
          struct Node *second;

          head = malloc(sizeof(struct Node));
          second = malloc(sizeof(struct Node));

          head->data = 10;
          head->next = second;
          second->data = 20;
          second->next = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);

    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");
    expect(html).not.toContain("Representation: Pointer Graph");
    expect(html).not.toContain("graph-connectors");
  });

  // Test 6: Regression: Binary Tree remains Tree with tree connectors, NOT Graph
  it("preserves binary tree and renders with tree connectors, NOT Graph", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *left;
          struct Node *right;
      };

      int main() {
          struct Node *root;
          struct Node *n1;
          struct Node *n2;

          root = malloc(sizeof(struct Node));
          n1 = malloc(sizeof(struct Node));
          n2 = malloc(sizeof(struct Node));

          root->data = 10;
          root->left = n1;
          root->right = n2;

          n1->data = 5;
          n1->left = NULL;
          n1->right = NULL;

          n2->data = 15;
          n2->left = NULL;
          n2->right = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);

    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");
    expect(html).toContain("tree-connectors");
    expect(html).toContain("tree-branch-left");
    expect(html).toContain("tree-branch-right");
    expect(html).not.toContain("Representation: Pointer Graph");
    expect(html).not.toContain("graph-connectors");
  });
});
