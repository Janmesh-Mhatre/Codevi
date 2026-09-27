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

describe("Pointer View: Binary Tree & BST Visualization", () => {
  // Test 1: Full 7-node BST (Test 2 from user request)
  it("renders a 7-node BST hierarchically with Valid BST indicator", async () => {
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
          struct Node *n5;
          struct Node *n15;
          struct Node *n3;
          struct Node *n7;
          struct Node *n12;
          struct Node *n20;

          root = malloc(sizeof(struct Node));
          n5 = malloc(sizeof(struct Node));
          n15 = malloc(sizeof(struct Node));
          n3 = malloc(sizeof(struct Node));
          n7 = malloc(sizeof(struct Node));
          n12 = malloc(sizeof(struct Node));
          n20 = malloc(sizeof(struct Node));

          root->data = 10;
          root->left = n5;
          root->right = n15;

          n5->data = 5;
          n5->left = n3;
          n5->right = n7;

          n15->data = 15;
          n15->left = n12;
          n15->right = n20;

          n3->data = 3;
          n3->left = NULL;
          n3->right = NULL;

          n7->data = 7;
          n7->left = NULL;
          n7->right = NULL;

          n12->data = 12;
          n12->left = NULL;
          n12->right = NULL;

          n20->data = 20;
          n20->left = NULL;
          n20->right = NULL;

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

    // 2. Stack variables
    expect(html).toContain("root");
    expect(html).toContain("n5");
    expect(html).toContain("n15");
    expect(html).toContain("n3");
    expect(html).toContain("n7");
    expect(html).toContain("n12");
    expect(html).toContain("n20");

    // 3. Heap blocks and contents
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
    expect(html).toContain("H004");
    expect(html).toContain("H005");
    expect(html).toContain("H006");
    expect(html).toContain("H007");

    expect(html).toContain("[10, H002, H003]");
    expect(html).toContain("[5, H004, H005]");
    expect(html).toContain("[15, H006, H007]");
    expect(html).toContain("[3, NULL, NULL]");
    expect(html).toContain("[7, NULL, NULL]");
    expect(html).toContain("[12, NULL, NULL]");
    expect(html).toContain("[20, NULL, NULL]");

    // 4. Valid BST indicator inside H001
    expect(html).toContain("Valid BST");

    // 5. Tree connectors
    expect(html).toContain("tree-branch-left");
    expect(html).toContain("tree-branch-right");

    // 6. Stack -> Heap connectors with dedicated color #818cf8 and arrow-stack-heap marker
    const stackHeapArrows = html.match(/marker-end="url\(#arrow-stack-heap\)"/g) ?? [];
    expect(stackHeapArrows).toHaveLength(7);
    expect(html).toContain("#818cf8");

    // Verify connectors do not create multi-bend large loops around the tree
    const stackHeapPaths = html.match(/<path[^>]*#arrow-stack-heap[^>]*>/g) ?? [];
    expect(stackHeapPaths).toHaveLength(7);
    for (const p of stackHeapPaths) {
      // Ensure no multi-curve complex looping paths (no more than 2 C commands per path)
      const cCount = (p.match(/ C /g) ?? []).length;
      expect(cCount).toBeLessThanOrEqual(2);
    }
  });

  // Test 2: Invalid BST
  it("displays BST: Invalid when binary tree violates BST ordering", async () => {
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
          struct Node *a;
          struct Node *b;

          root = malloc(sizeof(struct Node));
          a = malloc(sizeof(struct Node));
          b = malloc(sizeof(struct Node));

          root->data = 10;
          root->left = a;
          root->right = b;

          a->data = 20; // Invalid: left child 20 > root 10
          a->left = NULL;
          a->right = NULL;

          b->data = 15;
          b->left = NULL;
          b->right = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);
    expect(html).toContain("H001");
    expect(html).toContain("[10, H002, H003]");
    expect(html).toContain("BST: Invalid");
  });

  // Test 3: Left-skewed tree
  it("renders a left-skewed tree", async () => {
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
          struct Node *a;
          struct Node *b;

          root = malloc(sizeof(struct Node));
          a = malloc(sizeof(struct Node));
          b = malloc(sizeof(struct Node));

          root->data = 30;
          root->left = a;
          root->right = NULL;

          a->data = 20;
          a->left = b;
          a->right = NULL;

          b->data = 10;
          b->left = NULL;
          b->right = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);
    expect(html).toContain("Valid BST");
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
  });

  // Test 4: Right-skewed tree
  it("renders a right-skewed tree", async () => {
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
          struct Node *a;
          struct Node *b;

          root = malloc(sizeof(struct Node));
          a = malloc(sizeof(struct Node));
          b = malloc(sizeof(struct Node));

          root->data = 10;
          root->left = NULL;
          root->right = a;

          a->data = 20;
          a->left = NULL;
          a->right = b;

          b->data = 30;
          b->left = NULL;
          b->right = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);
    expect(html).toContain("Valid BST");
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
  });

  // Test 5: Active pointer (curr ▾) targeting a node
  it("displays active pointer indicator when curr points to a node", async () => {
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
          struct Node *curr;

          root = malloc(sizeof(struct Node));
          root->data = 10;
          root->left = NULL;
          root->right = NULL;

          curr = root;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);
    expect(html).toContain("curr ▾");
  });

  // Test 6: Linked list regression
  it("preserves linear linked list visualization for struct with next pointer", async () => {
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
          struct Node *third;

          head = malloc(sizeof(struct Node));
          second = malloc(sizeof(struct Node));
          third = malloc(sizeof(struct Node));

          head->data = 10;
          head->next = second;

          second->data = 20;
          second->next = third;

          third->data = 30;
          third->next = NULL;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);
    // Should NOT contain tree branch classes or BST indicator
    expect(html).not.toContain("Valid BST");
    expect(html).not.toContain("tree-branch-left");
    expect(html).toContain("[10, H002]");
    expect(html).toContain("[20, H003]");
    expect(html).toContain("[30, NULL]");
  });
});
