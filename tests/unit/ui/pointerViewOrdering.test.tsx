import { vi, describe, expect, it, beforeAll, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Parser } from "web-tree-sitter";
import { getParser } from "../helpers/interpreterTestHelpers";
import { INITIAL_EXECUTION_STATE, type ExecutionState } from "../../../src/execution/models/executionTypes";
import {
  orderHeapBlocks,
  getFieldColor,
  routeAdjacentHeap,
  routeCircularClosing,
  routeReverseHeap,
} from "../../../src/visualization/connectors/connectorRouting";
import type { HeapBlock, PointerRelationship, PointerViewVariable } from "../../../src/execution/models/executionTypes";

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
  return allPaths.filter((p) => !p.includes("M0,0 L10,3 L0,6 Z"));
}

describe("Codevi Pointer View: Linked-List Ordering & Connector Routing", () => {
  describe("Unit: orderHeapBlocks Algorithm Priority Rules", () => {
    it("Test C: orders nodes according to actual pointer traversal rather than simulated address (H003 -> H007 -> H004 -> H005)", () => {
      // Unsorted address IDs: 3, 4, 5, 7
      const blocks: HeapBlock[] = [
        { address: { space: "heap", id: 3 }, size: 2, rawValues: [1, 7], formattedValues: ["1", "H007"], active: true },
        { address: { space: "heap", id: 4 }, size: 2, rawValues: [3, 5], formattedValues: ["3", "H005"], active: true },
        { address: { space: "heap", id: 5 }, size: 2, rawValues: [4, 3], formattedValues: ["4", "H003"], active: true },
        { address: { space: "heap", id: 7 }, size: 2, rawValues: [2, 4], formattedValues: ["2", "H004"], active: true },
      ];

      const relationships: PointerRelationship[] = [
        { pointerName: "H003->next", pointerAddress: { space: "heap", id: 3 }, targetAddress: { space: "heap", id: 7 }, status: "valid", fieldName: "next" },
        { pointerName: "H007->next", pointerAddress: { space: "heap", id: 7 }, targetAddress: { space: "heap", id: 4 }, status: "valid", fieldName: "next" },
        { pointerName: "H004->next", pointerAddress: { space: "heap", id: 4 }, targetAddress: { space: "heap", id: 5 }, status: "valid", fieldName: "next" },
        { pointerName: "H005->next", pointerAddress: { space: "heap", id: 5 }, targetAddress: { space: "heap", id: 3 }, status: "valid", fieldName: "next" },
      ];

      const stackVars: PointerViewVariable[] = [
        { name: "head", address: { space: "stack", frameIndex: 0, offset: 0 }, type: "struct Node*", value: { kind: "pointer", address: { space: "stack", frameIndex: 0, offset: 0 }, target: { space: "heap", id: 3 }, targetType: "struct Node" } },
      ];

      const ordered = orderHeapBlocks(blocks, relationships, stackVars);
      const orderedIds = ordered.map((b) => b.address.id);

      // Must be H003 -> H007 -> H004 -> H005 (not H003, H004, H005, H007)
      expect(orderedIds).toEqual([3, 7, 4, 5]);
    });

    it("Test D: places freed heap allocations below all active blocks, sorted by address", () => {
      const blocks: HeapBlock[] = [
        { address: { space: "heap", id: 1 }, size: 2, rawValues: [], formattedValues: [], active: false }, // freed
        { address: { space: "heap", id: 2 }, size: 2, rawValues: [20, 0], formattedValues: ["20", "NULL"], active: true },
        { address: { space: "heap", id: 6 }, size: 2, rawValues: [], formattedValues: [], active: false }, // freed
        { address: { space: "heap", id: 3 }, size: 2, rawValues: [10, 2], formattedValues: ["10", "H002"], active: true },
      ];

      const relationships: PointerRelationship[] = [
        { pointerName: "H003->next", pointerAddress: { space: "heap", id: 3 }, targetAddress: { space: "heap", id: 2 }, status: "valid", fieldName: "next" },
        { pointerName: "H002->next", pointerAddress: { space: "heap", id: 2 }, targetAddress: null, status: "null", fieldName: "next" },
      ];

      const stackVars: PointerViewVariable[] = [
        { name: "head", address: { space: "stack", frameIndex: 0, offset: 0 }, type: "struct Node*", value: { kind: "pointer", address: { space: "stack", frameIndex: 0, offset: 0 }, target: { space: "heap", id: 3 }, targetType: "struct Node" } },
      ];

      const ordered = orderHeapBlocks(blocks, relationships, stackVars);
      const activeIds = ordered.filter((b) => b.active).map((b) => b.address.id);
      const freedIds = ordered.filter((b) => !b.active).map((b) => b.address.id);

      // Active: H003 -> H002
      expect(activeIds).toEqual([3, 2]);
      // Freed: H001, H006 at the bottom in address order
      expect(freedIds).toEqual([1, 6]);
      expect(ordered.map((b) => b.address.id)).toEqual([3, 2, 1, 6]);
    });

    it("Test E: follows next chain until NULL, keeping unrelated active allocations in address order", () => {
      const blocks: HeapBlock[] = [
        { address: { space: "heap", id: 1 }, size: 1, rawValues: [42], formattedValues: ["42"], active: true },
        { address: { space: "heap", id: 2 }, size: 1, rawValues: [99], formattedValues: ["99"], active: true },
        { address: { space: "heap", id: 3 }, size: 2, rawValues: [10, 7], formattedValues: ["10", "H007"], active: true },
        { address: { space: "heap", id: 4 }, size: 2, rawValues: [30, 0], formattedValues: ["30", "NULL"], active: true },
        { address: { space: "heap", id: 5 }, size: 1, rawValues: [123], formattedValues: ["123"], active: true },
        { address: { space: "heap", id: 7 }, size: 2, rawValues: [20, 4], formattedValues: ["20", "H004"], active: true },
      ];

      const relationships: PointerRelationship[] = [
        { pointerName: "H003->next", pointerAddress: { space: "heap", id: 3 }, targetAddress: { space: "heap", id: 7 }, status: "valid", fieldName: "next" },
        { pointerName: "H007->next", pointerAddress: { space: "heap", id: 7 }, targetAddress: { space: "heap", id: 4 }, status: "valid", fieldName: "next" },
        { pointerName: "H004->next", pointerAddress: { space: "heap", id: 4 }, targetAddress: null, status: "null", fieldName: "next" },
      ];

      const stackVars: PointerViewVariable[] = [
        { name: "head", address: { space: "stack", frameIndex: 0, offset: 0 }, type: "struct Node*", value: { kind: "pointer", address: { space: "stack", frameIndex: 0, offset: 0 }, target: { space: "heap", id: 3 }, targetType: "struct Node" } },
      ];

      const ordered = orderHeapBlocks(blocks, relationships, stackVars);
      const orderedIds = ordered.map((b) => b.address.id);

      // Traversal chain first: H003 -> H007 -> H004
      // Then remaining active blocks by address order: H001, H002, H005
      expect(orderedIds).toEqual([3, 7, 4, 1, 2, 5]);
    });
  });

  describe("Unit: Connector Routing Geometry & Distinguishability", () => {
    it("Test F & G: assigns distinct stable colors and non-overlapping routes for next and prev", () => {
      const nextColor = getFieldColor("next", "valid");
      const prevColor = getFieldColor("prev", "valid");

      expect(nextColor).not.toEqual(prevColor);
      expect(nextColor).toBe("var(--color-accent)");
      expect(prevColor).toBe("var(--color-active)");

      // Forward route and reverse route must produce different paths
      const x1 = 500, y1 = 100, x2 = 500, y2 = 180;
      const forwardPath = routeAdjacentHeap(x1, y1, x2, y2, 32);
      const reversePath = routeReverseHeap(x1, y2, x2, y1, 54);

      expect(forwardPath).not.toEqual(reversePath);
      // Lane offsets differ to prevent complete overlap
      expect(forwardPath).toContain("532");
      expect(reversePath).toContain("554");
    });

    it("Test H: circular closing edge uses an outer route with larger offset that clears intermediate cards", () => {
      const x1 = 500, y1 = 300, x2 = 500, y2 = 50;
      const circularPath = routeCircularClosing(x1, y1, x2, y2, 95);

      // Must arch outward at x + 95 = 595
      expect(circularPath).toContain("595");
      // Direct adjacent heap curve would only arch to ~532
      const adjacentPath = routeAdjacentHeap(x1, y1, x2, y2, 32);
      expect(adjacentPath).toContain("532");
    });
  });

  describe("End-to-End: ExecutionEngine + PointerViewPanel", () => {
    it("Test A: Singly linked list (H001 -> H002 -> H003 -> NULL) renders equal-length adjacent connectors and terminal NULL", async () => {
      setSource(`
        #include <stdlib.h>
        struct Node {
            int val;
            struct Node *next;
        };
        int main() {
            struct Node *head = malloc(sizeof(struct Node));
            head->val = 1;
            head->next = malloc(sizeof(struct Node));
            head->next->val = 2;
            head->next->next = malloc(sizeof(struct Node));
            head->next->next->val = 3;
            head->next->next->next = NULL;
            return 0;
        }
      `);

      const engine = new ExecutionEngine();
      engine.run();
      const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
      expect(finalState.errorMessage).toBeNull();

      const pv = finalState.currentStep!.pointerView;
      expect(pv.heapBlocks.map((b) => b.address.id)).toEqual([1, 2, 3]);

      mockState = { ...finalState };
      const html = renderToStaticMarkup(<PointerViewPanel />);

      // Cards rendered in sequence
      expect(html).toContain("H001");
      expect(html).toContain("H002");
      expect(html).toContain("H003");
      expect(html).toContain("NULL");

      const connectors = getConnectorPaths(html);
      // 1 stack-to-heap (head->H001) + 2 heap-to-heap (H001->H002, H002->H003) + 1 heap-to-null (H003->NULL) = 4
      expect(connectors.length).toBe(4);
    });

    it("Test B: Circular linked list (H001 -> H002 -> H003 -> H001) terminates cycle and renders closing outer route", async () => {
      setSource(`
        #include <stdlib.h>
        struct Node {
            int val;
            struct Node *next;
        };
        int main() {
            struct Node *head = malloc(sizeof(struct Node));
            head->val = 10;
            head->next = malloc(sizeof(struct Node));
            head->next->val = 20;
            head->next->next = malloc(sizeof(struct Node));
            head->next->next->val = 30;
            head->next->next->next = head;
            return 0;
        }
      `);

      const engine = new ExecutionEngine();
      engine.run();
      const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
      expect(finalState.errorMessage).toBeNull();

      const pv = finalState.currentStep!.pointerView;
      // Cycle detection stopped traversal: exactly 3 blocks, ordered 1, 2, 3
      expect(pv.heapBlocks.map((b) => b.address.id)).toEqual([1, 2, 3]);

      mockState = { ...finalState };
      const html = renderToStaticMarkup(<PointerViewPanel />);

      // Connectors: 1 stack-to-heap + 2 adjacent heap + 1 circular closing = 4
      const connectors = getConnectorPaths(html);
      expect(connectors.length).toBe(4);

      // Verify the circular closing loop exists in SVG (wide outer arc at x=656 bypassing intermediate nodes)
      const hasOuterArc = connectors.some((p) => p.includes("656"));
      expect(hasOuterArc).toBe(true);
    });

    it("Test D: Renders FREED divider and segregates freed blocks at bottom", async () => {
      setSource(`
        #include <stdlib.h>
        struct Node {
            int val;
            struct Node *next;
        };
        int main() {
            struct Node *a = malloc(sizeof(struct Node));
            struct Node *b = malloc(sizeof(struct Node));
            a->val = 1;
            b->val = 2;
            free(a);
            return 0;
        }
      `);

      const engine = new ExecutionEngine();
      engine.run();
      const finalState = await waitFor(() => engine.getState(), (s) => s.status === "completed");
      expect(finalState.errorMessage).toBeNull();

      mockState = { ...finalState };
      const html = renderToStaticMarkup(<PointerViewPanel />);

      expect(html).toContain("FREED ALLOCATIONS");
      expect(html).toContain(">H001<");
      expect(html).toContain(">H002<");

      // Verify H002 (active) comes before FREED divider, and H001 (freed) comes after divider
      const idxH002 = html.indexOf(">H002<");
      const idxFreed = html.indexOf("FREED ALLOCATIONS");
      const idxH001 = html.indexOf(">H001<");

      expect(idxH002).toBeLessThan(idxFreed);
      expect(idxFreed).toBeLessThan(idxH001);
    });
  });
});
