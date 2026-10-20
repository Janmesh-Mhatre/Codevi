# PHASE 6.5 V1: GRAPH VISUALIZATION FOUNDATION

## Overview
Phase 6.5 V1 establishes the foundational Graph Visualization system for Codevi. It enables automatic detection, normalization, layout, and rendering of graph structures originating from C source programs.

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
Graph Detection (Pointer Graph, Adjacency Matrix, Adjacency List)
  ↓
Normalized GraphModel
  ↓
Deterministic Graph Layout
  ↓
HEAP / TREE / GRAPH Structural Visualization Area
```

## Supported Source Representations
1. **Pointer-Based Graphs**:
   - Discovered from runtime pointer relationships and heap blocks.
   - Characterized by multi-target relationships, shared destinations ($in\text{-}degree \ge 2$), cycles, cross-edges, or self-loops.
2. **Adjacency Matrix**:
   - $N \times N$ 2D square arrays ($2 \le N \le 16$) containing binary or weighted connectivity entries.
   - Identified via conservative semantic evidence (variable naming conventions, binary relationship density, index access patterns).
3. **Adjacency List**:
   - Arrays of struct pointer heads (`struct Node *adj[N]`) where each list traverses neighbor vertex indices.
   - Identified via pointer array structure and linked neighbor chains.

## Normalized GraphModel (`src/visualization/models/graphTypes.ts`)
All three representations normalize into a single internal model before visualization:
- `GraphNode`: stable ID, display label, optional simulated address, value payload, type, metadata.
- `GraphEdge`: source ID, target ID, directed flag, label, metadata.
- `GraphModel`: nodes, edges, directed flag, representation kind, and representation badge (`Representation: Pointer Graph`, `Representation: Adjacency Matrix`, `Representation: Adjacency List`).

## Deterministic Graph Layout (`src/visualization/layout/graphLayout.ts` & `src/components/panels/pointerViewGraphLayout.ts`)
- **Collision-free**: Strict grid-based layering with horizontal (`H_GAP = 40px`) and vertical (`LEVEL_V_GAP = 64px`) spacing prevents node overlaps.
- **Cycles & Back-Edges**: Traversed safely without recursion or stack overflow; back-edges route smoothly along outer corridors.
- **Shared Destinations**: Placed below all reaching parents with dedicated connector landing lanes.
- **Self-Loops**: Rendered as smooth outward arcs above the node without overlapping node content.
- **Disconnected Components**: Positioned with clear separation margins (`COMPONENT_GAP = 60px`).

## UI Integration
- Located in the lower structural visualization area on the **HEAP / TREE / GRAPH** side (right column), preserving **STACK (MEMORY)** on the left column.
- Reuses Codevi's established Heap node cards: borders, surfaces, typography, address badges (`H001`, `H002`), metadata tags, and color palette.
- Displays representation badge in the column header (e.g. `Representation: Pointer Graph`).
- Reuses SVG connector arrows with directional marker heads (`arrow-valid`, `arrow-active`, `arrow-stack-heap`).

## Regression Safety & Non-Classification
Strict disqualification rules ensure existing data structures remain unaffected:
- Ordinary linear linked lists remain classified as **Linked List**.
- Binary trees and BSTs remain classified as **Tree**.
- Array-backed Stacks and Queues remain classified as **Stack DS** and **Queue DS**.
- Standard arrays remain classified as **Array**.

## Test Verification
- `tests/unit/visualization/graphVisualization.test.ts`: 11 tests covering GraphModel creation, pointer graph detection, adjacency matrix detection, adjacency list detection, non-classification regressions, and deterministic layout.
- `tests/unit/ui/pointerViewGraph.test.tsx`: 6 tests covering end-to-end ExecutionEngine execution, static HTML rendering of PointerViewPanel, DAGs with shared targets, cycles, self-loops, disconnected components, and tree/linked-list regressions.
- Full test suite: **405 tests passed across 36 test files (100% pass rate)**.
