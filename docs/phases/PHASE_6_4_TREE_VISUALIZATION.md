# PHASE 6.4: BINARY TREE & BST VISUALIZATION

## Overview
Phase 6.4 introduces automated detection, structural validation, hierarchical layout, and interactive rendering for Binary Trees and Binary Search Trees (BSTs) in Codevi.

## Execution Pipeline
```
C Source Code
  ↓
Monaco Editor
  ↓
Tree-sitter C / WASM AST
  ↓
Custom C Interpreter & Simulated Memory (Heap blocks with struct fields)
  ↓
Execution Engine Snapshots (ExecutionStep)
  ↓
Tree Detector (treeDetector.ts & pointerViewTreeLayout.ts)
  ↓
Normalized TreeModel (treeTypes / structureTypes)
  ↓
Deterministic Reingold-Tilford Tree Layout (treeLayout.ts)
  ↓
Unified Visualization Panel (NewVisualizationPanel.tsx)
```

## Detection Heuristics (`src/visualization/detectors/treeDetector.ts`)
1. **Node Structure:**
   - Detects heap-allocated structs containing `left` and `right` pointer fields (e.g. `struct TreeNode { int val; struct TreeNode *left; struct TreeNode *right; };`).
2. **Root Identification:**
   - Identifies the root node as the node with in-degree 0 among tree-connected heap blocks, or by stack pointer variable reference (`root`).
3. **Cycle Guard:**
   - Cycle detection prevents infinite recursion on malformed or cyclic pointer graphs (such graphs are redirected to the Graph detector).
4. **Structural Metrics:**
   - Computes tree depth / height.
   - Computes total node count.
   - Evaluates Binary Search Tree (BST) invariant ($left.val < node.val < right.val$).
   - Computes subtree balance factors.

## Hierarchical Layout Engine (`src/visualization/layout/treeLayout.ts`)
- **Deterministic Reingold-Tilford Layout:**
  - Symmetrical positioning ensuring child subtrees never collide or overlap.
  - Consistent horizontal node spacing (`TREE_NODE_H_GAP`) and vertical level spacing (`TREE_LEVEL_V_GAP`).
  - Left children are positioned deterministically to the left of their parent; right children to the right.
- **SVG Connector Routing:**
  - Clean directional cubic bezier branch lines connecting parent cards to child cards with dedicated left/right landing ports.
  - Distinct visual styling distinguishing left child branches from right child branches.

## UI Integration
- Rendered in `NewVisualizationPanel.tsx` under the "Visualization" tab and in `PointerViewPanel.tsx`.
- Displays tree metrics badges (e.g. `Tree: Binary Search Tree`, `Depth: 3`, `Nodes: 7`).
- Retains Codevi's familiar node card styling, simulated heap address tags (`H001`), and active value highlighting.

## Automated Verification
- `tests/unit/visualization/treeVisualization.test.ts`: 13 tests verifying binary tree detection, BST classification, unbalanced tree layouts, leaf-only trees, and non-classification regressions.
- `tests/unit/ui/pointerViewTree.test.tsx`: 6 tests verifying end-to-end ExecutionEngine integration and SVG rendering.

