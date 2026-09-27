import { describe, it, expect } from "vitest";
import { extractStructureGraph } from "../../../src/visualization/detectors/structureDetector";
import { layoutTreeStructures } from "../../../src/visualization/layout/treeLayout";
import type {
  ExecutionStep,
  StackFrame,
  HeapBlock,
} from "../../../src/execution/models/executionTypes";

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

describe("Phase 6.4: Tree & BST Visualization Detection", () => {
  it("detects a 3-node binary tree with data, left, and right pointers", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 3, slot: 0 } },
        ],
      },
      {
        address: { space: "heap", id: 2, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 5 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 15 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: {
            root: { space: "stack", id: 1, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);

    // Should detect a tree structure
    const treeItems = graph.structures.filter((s) => s.kind === "tree");
    expect(treeItems.length).toBe(1);

    const tree = treeItems[0];
    expect(tree.nodes.length).toBe(3);
    expect(tree.links.length).toBeGreaterThanOrEqual(4); // 2 valid links + at least 2 null links

    // Root node should have data = 10
    const rootNode = tree.nodes[0];
    expect(rootNode.slots[0].value).toEqual({ kind: "scalar", type: "int", value: 10 });
    expect(rootNode.slots[0].name).toBe("data");
    expect(rootNode.slots[1].name).toBe("left");
    expect(rootNode.slots[2].name).toBe("right");

    // Should have "root ➔" tag on the root node
    expect(rootNode.slots[0].activeIndexTags).toContain("root ➔");

    // Verify left and right links
    const validLinks = tree.links.filter((l) => l.status === "valid");
    expect(validLinks.length).toBe(2);

    const leftLink = validLinks.find((l) => l.label === "left");
    const rightLink = validLinks.find((l) => l.label === "right");
    expect(leftLink).toBeDefined();
    expect(rightLink).toBeDefined();
  });

  it("validates BST property correctly (valid BST: 5 < 10 < 15)", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 3, slot: 0 } },
        ],
      },
      {
        address: { space: "heap", id: 2, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 5 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 15 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: {
            root: { space: "stack", id: 1, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const treeItems = graph.structures.filter((s) => s.kind === "tree");
    expect(treeItems.length).toBe(1);

    // Name should indicate valid BST
    expect(treeItems[0].name).toContain("BST");
    expect(treeItems[0].name).toContain("Valid BST");
  });

  it("detects invalid BST ordering (left child > root)", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 3, slot: 0 } },
        ],
      },
      {
        address: { space: "heap", id: 2, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 20 }, // 20 > 10, invalid for left child
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 15 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: { root: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const treeItems = graph.structures.filter((s) => s.kind === "tree");
    expect(treeItems.length).toBe(1);

    // Should NOT say Valid BST — should say Binary Tree
    expect(treeItems[0].name).toContain("Binary Tree");
    expect(treeItems[0].name).not.toContain("Valid BST");
  });

  it("tree nodes are not misdetected as linked list nodes", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: { root: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);

    // Should NOT have any linked list
    const linkedLists = graph.structures.filter((s) => s.kind === "linked-list");
    expect(linkedLists.length).toBe(0);

    // Should have a tree
    const trees = graph.structures.filter((s) => s.kind === "tree");
    expect(trees.length).toBe(1);
  });

  it("handles active traversal pointer tags (curr ▾, parent ▾)", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
      {
        address: { space: "heap", id: 2, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 5 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
            curr: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          },
          addresses: {
            root: { space: "stack", id: 1, slot: 0 },
            curr: { space: "stack", id: 2, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const treeItems = graph.structures.filter((s) => s.kind === "tree");
    expect(treeItems.length).toBe(1);

    const tree = treeItems[0];

    // Root node should have "root ➔" tag
    const rootNode = tree.nodes.find((n) => n.slots[0].value.kind === "scalar" && n.slots[0].value.value === 10);
    expect(rootNode).toBeDefined();
    expect(rootNode!.slots[0].activeIndexTags).toContain("root ➔");

    // Curr node should have "curr ▾" tag
    const currNode = tree.nodes.find((n) => n.slots[0].value.kind === "scalar" && n.slots[0].value.value === 5);
    expect(currNode).toBeDefined();
    expect(currNode!.slots[0].activeIndexTags).toContain("curr ▾");
  });

  it("handles single-node tree (root with both children NULL)", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 42 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: { root: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const trees = graph.structures.filter((s) => s.kind === "tree");
    expect(trees.length).toBe(1);
    expect(trees[0].nodes.length).toBe(1);

    // Should have 2 null links (left and right)
    const nullLinks = trees[0].links.filter((l) => l.status === "null");
    expect(nullLinks.length).toBe(2);
  });
});

describe("Phase 6.4: Tree Layout Engine", () => {
  it("lays out a 3-node tree with non-overlapping positions", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 10 },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 3, slot: 0 } },
        ],
      },
      {
        address: { space: "heap", id: 2, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 5 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
      {
        address: { space: "heap", id: 3, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 15 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: { root: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const treeItems = graph.structures.filter((s) => s.kind === "tree");
    expect(treeItems.length).toBe(1);

    const result = layoutTreeStructures(treeItems[0].nodes, treeItems[0].links);

    // Should place 3 nodes
    expect(result.placedNodes.length).toBe(3);

    // Root should be at level 0 (topmost Y)
    const rootPlaced = result.placedNodes[0];
    const leftPlaced = result.placedNodes[1];
    const rightPlaced = result.placedNodes[2];

    // Root is above children
    expect(rootPlaced.y).toBeLessThan(leftPlaced.y);
    expect(rootPlaced.y).toBeLessThan(rightPlaced.y);

    // Left is to the left of right
    expect(leftPlaced.x).toBeLessThan(rightPlaced.x);

    // Children are at the same level
    expect(leftPlaced.y).toBe(rightPlaced.y);

    // Should have placed links
    expect(result.placedLinks.length).toBeGreaterThan(0);

    // Should have positive dimensions
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("produces null badges for leaf nodes", () => {
    const heap: HeapBlock[] = [
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 42 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 5,
          parameters: {},
          locals: {
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 1, slot: 0 } },
          },
          addresses: { root: { space: "stack", id: 1, slot: 0 } },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const trees = graph.structures.filter((s) => s.kind === "tree");
    const result = layoutTreeStructures(trees[0].nodes, trees[0].links);

    // Should have null badges for the 2 null children
    expect(result.nullBadges.length).toBe(2);
  });
});

describe("Phase 6.4: Array-Backed Binary Heap Detection", () => {
  it("detects a min-heap array", () => {
    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 20,
          parameters: {},
          locals: {
            heap: {
              kind: "array",
              type: "int[7]",
              address: { space: "stack", id: 1, slot: 0 },
              length: 7,
              values: [
                { kind: "scalar", type: "int", value: 1 },
                { kind: "scalar", type: "int", value: 3 },
                { kind: "scalar", type: "int", value: 5 },
                { kind: "scalar", type: "int", value: 7 },
                { kind: "scalar", type: "int", value: 9 },
                { kind: "scalar", type: "int", value: 11 },
                { kind: "scalar", type: "int", value: 13 },
              ],
            },
            size: { kind: "scalar", type: "int", value: 7 },
          },
          addresses: {
            heap: { space: "stack", id: 1, slot: 0 },
            size: { space: "stack", id: 2, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);

    // Array named "heap" with min-heap property should get heap metadata
    const arrayItems = graph.structures.filter((s) => s.id.startsWith("array:"));
    expect(arrayItems.length).toBe(1);

    const heapArray = arrayItems[0];
    expect(heapArray.name).toContain("Min-Heap");

    const node = heapArray.nodes[0];
    expect(node.metadata?.adtKind).toBe("binary-heap");
    expect(node.metadata?.heapType).toBe("Min-Heap");
    expect(node.metadata?.heapSize).toBe(7);

    // Slot 0 (root) should have L:[1] and R:[2] annotations
    const rootSlot = node.slots[0];
    expect(rootSlot.activeIndexTags).toContain("L:[1]");
    expect(rootSlot.activeIndexTags).toContain("R:[2]");

    // Slot 1 should have P:[0] annotation
    const slot1 = node.slots[1];
    expect(slot1.activeIndexTags).toContain("P:[0]");
  });

  it("detects a max-heap array", () => {
    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 20,
          parameters: {},
          locals: {
            maxheap: {
              kind: "array",
              type: "int[5]",
              address: { space: "stack", id: 1, slot: 0 },
              length: 5,
              values: [
                { kind: "scalar", type: "int", value: 50 },
                { kind: "scalar", type: "int", value: 30 },
                { kind: "scalar", type: "int", value: 40 },
                { kind: "scalar", type: "int", value: 10 },
                { kind: "scalar", type: "int", value: 20 },
              ],
            },
            size: { kind: "scalar", type: "int", value: 5 },
          },
          addresses: {
            maxheap: { space: "stack", id: 1, slot: 0 },
            size: { space: "stack", id: 2, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const arrayItems = graph.structures.filter((s) => s.id.startsWith("array:"));
    expect(arrayItems.length).toBe(1);
    expect(arrayItems[0].name).toContain("Max-Heap");

    const node = arrayItems[0].nodes[0];
    expect(node.metadata?.heapType).toBe("Max-Heap");
  });

  it("does not flag an array that violates both heap properties", () => {
    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 20,
          parameters: {},
          locals: {
            heap: {
              kind: "array",
              type: "int[5]",
              address: { space: "stack", id: 1, slot: 0 },
              length: 5,
              values: [
                { kind: "scalar", type: "int", value: 3 },
                { kind: "scalar", type: "int", value: 1 },
                { kind: "scalar", type: "int", value: 5 },
                { kind: "scalar", type: "int", value: 10 },
                { kind: "scalar", type: "int", value: 2 },
              ],
            },
            size: { kind: "scalar", type: "int", value: 5 },
          },
          addresses: {
            heap: { space: "stack", id: 1, slot: 0 },
            size: { space: "stack", id: 2, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const arrayItems = graph.structures.filter((s) => s.id.startsWith("array:"));
    expect(arrayItems.length).toBe(1);

    // Should NOT have heap metadata since it violates both properties
    expect(arrayItems[0].name).not.toContain("Heap");
    expect(arrayItems[0].nodes[0].metadata?.adtKind).not.toBe("binary-heap");
  });

  it("does not promote non-heap-named arrays", () => {
    const step = makeStep({
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 20,
          parameters: {},
          locals: {
            arr: {
              kind: "array",
              type: "int[3]",
              address: { space: "stack", id: 1, slot: 0 },
              length: 3,
              values: [
                { kind: "scalar", type: "int", value: 1 },
                { kind: "scalar", type: "int", value: 2 },
                { kind: "scalar", type: "int", value: 3 },
              ],
            },
          },
          addresses: {
            arr: { space: "stack", id: 1, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);
    const arrayItems = graph.structures.filter((s) => s.id.startsWith("array:"));
    expect(arrayItems.length).toBe(1);
    expect(arrayItems[0].name).not.toContain("Heap");
  });
});

describe("Phase 6.4: Linked List / Tree Coexistence", () => {
  it("2-slot heap blocks remain linked lists, 3-slot blocks become trees", () => {
    // Mixed: linked list nodes (2 slots) and tree nodes (3 slots)
    const heap: HeapBlock[] = [
      // Linked list node
      {
        address: { space: "heap", id: 1, slot: 0 },
        slotCount: 2,
        byteSize: 8,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 100 },
          { kind: "pointer", type: "struct Node*", target: null },
        ],
      },
      // Tree node
      {
        address: { space: "heap", id: 2, slot: 0 },
        slotCount: 3,
        byteSize: 12,
        active: true,
        origin: "malloc",
        values: [
          { kind: "scalar", type: "int", value: 42 },
          { kind: "pointer", type: "struct TreeNode*", target: null },
          { kind: "pointer", type: "struct TreeNode*", target: null },
        ],
      },
    ];

    const step = makeStep({
      heap,
      callStack: [
        {
          functionName: "main",
          callDepth: 1,
          line: 10,
          parameters: {},
          locals: {
            head: { kind: "pointer", type: "struct Node*", target: { space: "heap", id: 1, slot: 0 } },
            root: { kind: "pointer", type: "struct TreeNode*", target: { space: "heap", id: 2, slot: 0 } },
          },
          addresses: {
            head: { space: "stack", id: 1, slot: 0 },
            root: { space: "stack", id: 2, slot: 0 },
          },
          isActive: true,
        },
      ],
      pointerView: { relationships: [], stackVariables: [], heapBlocks: [] },
    });

    const graph = extractStructureGraph(step);

    const linkedLists = graph.structures.filter((s) => s.kind === "linked-list");
    const trees = graph.structures.filter((s) => s.kind === "tree");

    expect(linkedLists.length).toBe(1);
    expect(trees.length).toBe(1);

    // Linked list node has value 100
    expect(linkedLists[0].nodes[0].slots[0].value).toEqual({
      kind: "scalar",
      type: "int",
      value: 100,
    });

    // Tree node has value 42
    expect(trees[0].nodes[0].slots[0].value).toEqual({
      kind: "scalar",
      type: "int",
      value: 42,
    });
  });
});
