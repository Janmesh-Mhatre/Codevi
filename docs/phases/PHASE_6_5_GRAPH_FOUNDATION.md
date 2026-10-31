# PHASE 6.5: GRAPH VISUALIZATION SYSTEM

## Overview
Phase 6.5 establishes the comprehensive Graph Visualization system for Codevi, spanning:
- **Phase 6.5 V1:** Foundational `GraphModel`, normalization pipeline, and deterministic layered layout.
- **Phase 6.5.2:** Pointer-based graph detection (multi-target nodes, shared destinations, cycles, self-loops).
- **Phase 6.5.3:** Adjacency matrix graph detection ($N \times N$ 2D arrays, DFS cycle detection) and **Targeted Edge-Node Clearance Routing**.

## Execution Pipeline
```
C Source
  ↓
Monaco Editor
  ↓
Tree-sitter C / WASM AST
  ↓
Custom C Interpreter & Simulated Memory
  ↓
Execution Engine Snapshots (ExecutionStep)
  ↓
Graph Detection (Pointer Graphs & Adjacency Matrices)
  ↓
Normalized GraphModel (graphTypes.ts)
  ↓
Deterministic Graph Layout with Obstacle Avoidance (graphLayout.ts)
  ↓
Unified Visualization Panel (NewVisualizationPanel.tsx)
```

## Supported Source Representations
1. **Pointer-Based Graphs (Phase 6.5.2)**:
   - Discovered from runtime pointer relationships and heap blocks.
   - Characterized by multi-target relationships, shared destinations ($in\text{-}degree \ge 2$), cycles, cross-edges, or self-loops.
   - Disambiguation heuristics strictly prevent misclassifying linear linked lists or binary trees.
2. **Adjacency Matrix Graphs (Phase 6.5.3)**:
   - $N \times N$ 2D square arrays ($2 \le N \le 16$) containing binary or weighted connectivity entries across global and stack scopes.
   - Identified via naming conventions (`graph`, `adj`, `matrix`, `g`, `g1`, etc.) and non-zero connectivity.
   - Scopes node identifiers as `${varName}_v_${i}` with alphanumeric display labels (`Node A`, `Node B`, ...).
   - Cleanly replaces the raw 2D array representation in `StructureGraph` with the interactive graph structure.
   - Directed cycle detection computed using 3-color DFS.
3. **Adjacency List (Phase 7 - Planned)**:
   - Arrays of struct pointer heads (`struct Node *adj[N]`) traversing neighbor vertex chains.

## Normalized GraphModel (`src/visualization/models/graphTypes.ts`)
All graph representations normalize into a single domain model:
- `GraphNode`: stable ID, display label, optional simulated address, value payload, type, metadata.
- `GraphEdge`: source ID, target ID, directed flag, label (e.g. edge weight), metadata.
- `GraphModel`: nodes, edges, directed flag, representation kind, and representation badge (`Representation: Pointer Graph`, `Representation: Adjacency Matrix`).
- `graphModelToStructureItem()`: converts GraphModel into `StructureItem` for unified diffing and rendering.

## Deterministic Graph Layout with Obstacle Avoidance (`src/visualization/layout/graphLayout.ts`)
- **Collision-Free Layering:** BFS/DFS topological layering with horizontal (`GRAPH_H_GAP = 44px`) and vertical (`GRAPH_LEVEL_V_GAP = 64px`) spacing prevents node overlaps.
- **Targeted Edge-Node Clearance (Phase 6.5.3 Fix):**
  - **Same-Layer Forward Edges ($B \to D$ across $C$):** Routes cleanly **above** intermediate obstacle node(s) with $yArch = \min(y_{obs}) - (26 + pairIndex \times 14)\text{px}$.
  - **Same-Layer Backward Edges ($D \to B$ across $C$):** Routes cleanly **below** intermediate obstacle node(s) with $yArch = \max(y_{obs} + h) + (26 + loopAllowance + pairIndex \times 14)\text{px}$, accounting for obstacle self-loops.
  - **Adjacent Same-Layer Edges ($B \to C$, $C \to D$):** Maintained as direct connectors in the horizontal gap.
  - **Skip-Layer Downward Cross-Edges:** Intermediate nodes inside vertical corridors trigger outer right perimeter routing.
  - **Upward Cycle Back-Edges:** Corridors expand outside all intermediate nodes ($minLeft - 26\text{px}$ or $maxRight + 26\text{px}$).
- **Self-Loops:** Positioned smoothly below the node bottom boundary without colliding with incoming edges.
- **Disconnected Components:** Positioned with clear separation margins (`GRAPH_COMPONENT_GAP = 60px`).

## UI Integration
- Rendered in `NewVisualizationPanel.tsx` (under the "Visualization" tab) and `StructureVisualizationPanel.tsx`.
- Reuses Codevi's established Heap node cards: borders, surfaces, typography, address badges (`H001`, `H002`), metadata tags, and color palette.
- Displays representation badge in the column header (e.g. `Representation: Pointer Graph`, `Representation: Adjacency Matrix`).
- Reuses SVG connector arrows with directional marker heads (`arrow-valid`, `arrow-active`, `arrow-stack-heap`).

## Regression Safety & Non-Classification
Strict disqualification rules ensure existing data structures remain unaffected:
- Ordinary linear linked lists remain classified as **Linked List**.
- Binary trees and BSTs remain classified as **Tree**.
- Array-backed Stacks and Queues remain classified as **Stack DS** and **Queue DS**.
- Standard arrays remain classified as **Array**.

## Test Verification
- `tests/unit/visualization/adjacencyMatrixGraph.test.ts`: 12 tests covering Phase 6.5.3 matrix detection, multi-matrix scopes, cycle DFS, self-loops, shared destinations, 2D array non-classification, reactive mutation, and dense $K_4$ clearance $\ge 20\text{px}$.
- `tests/unit/visualization/pointerGraphModel.test.ts`: 11 tests covering pointer-based graph detection, multi-target fan-out, shared destinations, and disambiguation.
- `tests/unit/visualization/graphVisualization.test.ts`: 13 tests covering GraphModel creation, deterministic layout, cycles, and back-edges.
- `tests/unit/ui/pointerViewGraph.test.tsx`: 6 tests covering end-to-end ExecutionEngine execution, static HTML rendering, DAGs, cycles, self-loops, and regressions.
- `tests/unit/ui/newVisualizationGraph.test.tsx`: 15 tests covering end-to-end visualization panel graph interactions.
- Full project test suite: **500 tests passed across 45 test files (100% pass rate)**.
