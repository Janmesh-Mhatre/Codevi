import { vi, describe, expect, it, beforeAll, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Parser } from "web-tree-sitter";
import { getParser } from "../helpers/interpreterTestHelpers";
import { INITIAL_EXECUTION_STATE, type ExecutionState } from "../../../src/execution/models/executionTypes";

let mockTree: import("web-tree-sitter").Tree | null = null;
vi.mock("../../../src/parser/parserService", () => ({
  getCurrentTree: () => mockTree,
  getLastDiagnostics: () => [],
}));

let mockState: ExecutionState = INITIAL_EXECUTION_STATE;

vi.mock("../../../src/state/executionStore", () => ({
  useExecutionStore: (selector?: (s: ExecutionState) => any) =>
    selector ? selector(mockState) : mockState,
}));

const { ExecutionEngine } = await import("../../../src/execution/engine/ExecutionEngine");
const { PointerViewPanel } = await import("../../../src/components/panels/PointerViewPanel");

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

function getConnectorPaths(html: string): string[] {
  const allPaths = html.match(/<path[^>]*d="[^"]+"[^>]*>/g) ?? [];
  // Exclude marker def paths (<path d="M0,0 L10,3 L0,6 Z" ... />)
  return allPaths.filter((p) => !p.includes("M0,0 L10,3 L0,6 Z"));
}

describe("Phase 6.2 Fix: PointerViewPanel Heap-to-Heap Linked List Connectors", () => {
  it("renders exact 3-node linked list with stack-to-heap, heap-to-heap, and heap-to-null connectors", async () => {
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
    expect(finalState.currentStep).not.toBeNull();

    // Verify pointerView data model
    const pv = finalState.currentStep!.pointerView;
    expect(pv.heapBlocks).toHaveLength(3);
    expect(pv.relationships.length).toBeGreaterThanOrEqual(6);

    // Set mockState for React component render
    mockState = { ...finalState };

    const html = renderToStaticMarkup(<PointerViewPanel />);

    // 1. Column headers
    expect(html).toContain("STACK");
    expect(html).toContain("HEAP");

    // 2. Stack variables
    expect(html).toContain("head");
    expect(html).toContain("second");
    expect(html).toContain("third");

    // 3. Heap blocks and contents: [10, H002], [20, H003], [30, NULL]
    expect(html).toContain("H001");
    expect(html).toContain("H002");
    expect(html).toContain("H003");
    expect(html).toContain("[10, H002]");
    expect(html).toContain("[20, H003]");
    expect(html).toContain("[30, NULL]");

    // 4. NULL termination box rendered
    expect(html).toContain("NULL");

    // 5. Connectors in SVG
    // 3 stack-to-heap + 2 heap-to-heap + 1 heap-to-null = 6 connector arrows
    const connectors = getConnectorPaths(html);
    expect(connectors.length).toBe(6);

    // Verify markers used (arrow-valid for valid links, arrow-null for NULL link)
    expect(html).toContain('marker-end="url(#arrow-valid)"');
    expect(html).toContain('marker-end="url(#arrow-null)"');
  });

  it("Test A: handles reversed link correctly based on actual pointer value (third->next = second)", async () => {
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
          head->next = third;

          second->data = 20;
          second->next = NULL;

          third->data = 30;
          third->next = second;

          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();

    const pv = finalState.currentStep!.pointerView;
    // Verify third (H003) points to second (H002)
    const thirdRel = pv.relationships.find((r) => r.pointerName === "H003->next");
    expect(thirdRel).toBeDefined();
    expect(thirdRel?.targetAddress?.id).toBe(2); // points to H002
    expect(thirdRel?.status).toBe("valid");

    // Verify second (H002) points to NULL
    const secondRel = pv.relationships.find((r) => r.pointerName === "H002->next");
    expect(secondRel).toBeDefined();
    expect(secondRel?.status).toBe("null");

    mockState = { ...finalState };
    const html = renderToStaticMarkup(<PointerViewPanel />);
    expect(html).toContain("H003");
    expect(html).toContain("H002");
    expect(html).toContain("[10, H003]");
    expect(html).toContain("[20, NULL]");
    expect(html).toContain("[30, H002]");

    const connectors = getConnectorPaths(html);
    // 3 stack-to-heap + 2 heap-to-heap (H001->H003, H003->H002) + 1 heap-to-null (H002->NULL) = 6
    expect(connectors.length).toBe(6);
  });

  it("Test B: handles NULL termination on first node (head->next = NULL)", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int data;
          struct Node *next;
      };

      int main() {
          struct Node *head;
          head = malloc(sizeof(struct Node));
          head->data = 100;
          head->next = NULL;
          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
    expect(finalState.errorMessage).toBeNull();

    const pv = finalState.currentStep!.pointerView;
    const nextRel = pv.relationships.find((r) => r.pointerName === "H001->next");
    expect(nextRel).toBeDefined();
    expect(nextRel?.status).toBe("null");

    mockState = { ...finalState };
    const html = renderToStaticMarkup(<PointerViewPanel />);
    expect(html).toContain("[100, NULL]");
    expect(html).toContain("NULL");

    // Should have stack-to-heap (head->H001) and heap-to-null (H001->NULL)
    const connectors = getConnectorPaths(html);
    expect(connectors.length).toBe(2);
  });

  it("Test C: handles two-node list (head->next = second; second->next = NULL)", async () => {
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

          head->data = 1;
          head->next = second;

          second->data = 2;
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
    expect(html).toContain("[1, H002]");
    expect(html).toContain("[2, NULL]");

    // 2 stack-to-heap (head->H001, second->H002) + 1 heap-to-heap (H001->H002) + 1 heap-to-null (H002->NULL) = 4
    const connectors = getConnectorPaths(html);
    expect(connectors.length).toBe(4);
  });

  it("deduplicates identical connectors without rendering duplicates", async () => {
    setSource(`
      #include <stdio.h>
      #include <stdlib.h>

      struct Node {
          int val;
          struct Node *next;
      };

      int main() {
          struct Node *head = malloc(sizeof(struct Node));
          head->next = NULL;
          return 0;
      }
    `);

    const engine = new ExecutionEngine();
    engine.run();
    const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");

    // Manually inject duplicate relationship to verify deduplication defense in PointerViewPanel
    const pv = finalState.currentStep!.pointerView;
    const dup = { ...pv.relationships[0] };
    pv.relationships.push(dup);

    mockState = { ...finalState };
    const html = renderToStaticMarkup(<PointerViewPanel />);

    const connectors = getConnectorPaths(html);
    // Even with duplicated relationship in array, connector count should be exactly 2
    expect(connectors.length).toBe(2);
  });
});
