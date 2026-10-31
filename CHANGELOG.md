# Changelog

All notable changes to Codevi are documented here.

---

## Phase 6.5.3 — Adjacency Matrix Graphs & Targeted Edge-Node Clearance

### Added
- **Adjacency Matrix Detection** (`src/visualization/detectors/graphDetector.ts`):
  - Automatically identifies $N \times N$ 2D square arrays ($2 \le N \le 16$) representing graph adjacency matrices across globals and active stack frames.
  - Recognizes semantic naming patterns (`graph`, `adj`, `matrix`, `g`, `g1`, `network`, etc.) with conservative validation (non-zero edge counts, non-square rejection).
  - Normalizes detected matrices into the unified `GraphModel`, scoping vertex IDs as `${varName}_v_${i}` with alphanumeric display labels (`Node A`, `Node B`, ...).
  - Seamlessly integrates into `StructureGraph` extraction, cleanly replacing the raw 2D array representation with an interactive graph in `NewVisualizationPanel`.
  - Directed cycle detection using 3-color DFS marking `hasCycles` and `hasSelfLoops` metadata.
- **Targeted Edge-Node Clearance Routing** (`src/visualization/layout/graphLayout.ts`):
  - **Same-layer obstacle avoidance:** Detects intermediate nodes positioned between source and target on horizontal layers. Forward edges ($B \to D$) arch upward above intermediate nodes ($yArch = \min(y_{obs}) - 26\text{px}$); backward edges ($D \to B$) arch downward below intermediate nodes ($yArch = \max(y_{obs} + h) + 26\text{px}$ + self-loop allowance).
  - **Skip-layer downward corridor clearance:** Scans for intermediate nodes within vertical/horizontal corridors and routes skip-layer cross-edges along the outer perimeter.
  - **Upward cycle back-edge clearance:** Expands outer perimeter routing corridors beyond all intermediate nodes between source and target levels ($minLeft - 26\text{px}$ or $maxRight + 26\text{px}$).
- **Automated Verification:**
  - 12 comprehensive unit tests in `tests/unit/visualization/adjacencyMatrixGraph.test.ts` verifying basic directed graphs, branching graphs, cycles, diagonal self-loops, disconnected components, shared destinations, 2D array non-classification, multi-matrix detection, reactive mutations across execution steps, and dense $K_4$ clearance $\ge 20\text{px}$.

---

## Phase 6.5.2 — Pointer-Based Graphs

### Added
- **Pointer Graph Detection** (`src/visualization/detectors/graphDetector.ts` & `pointerGraphLayout.ts`):
  - Automatically discovers pointer-based graph topologies formed by heap blocks and pointer relationships.
  - Heuristically identifies graph structures through multi-target node fan-outs, shared destinations ($in\text{-}degree \ge 2$), directed cycles, cross-edges, and self-loops.
  - Strict disambiguation rules prevent misclassifying linear linked lists or binary trees as graphs.
- **Layered Deterministic Layout:**
  - Cycle-breaking BFS/DFS node layering preventing infinite loops.
  - Collision-free node placement with horizontal spacing (`GRAPH_H_GAP = 44px`) and level spacing (`GRAPH_LEVEL_V_GAP = 64px`).
  - Outward curved back-edge routing for cyclic connections.
- **Automated Verification:**
  - 11 unit tests in `tests/unit/visualization/pointerGraphModel.test.ts` and 6 UI integration tests in `tests/unit/ui/pointerViewGraph.test.tsx`.

---

## Phase 6.5 V1 — Graph Visualization Foundation

### Added
- **Unified Graph Architecture** (`src/visualization/models/graphTypes.ts`):
  - Defines the core `GraphModel`, `GraphNode`, and `GraphEdge` domain types.
  - Normalizes disparate graph representations (`pointer-based`, `adjacency-matrix`, `adjacency-list`) into a single internal representation.
  - `graphModelToStructureItem()` adapter converting GraphModels into Codevi `StructureItem` nodes and links for unified diffing, filtering, and rendering.
- **Graph Layout Engine** (`src/visualization/layout/graphLayout.ts`):
  - Layered hierarchical layout engine computing collision-free coordinates for arbitrary directed graphs.
  - Deterministic component separation (`GRAPH_COMPONENT_GAP = 60px`) for disconnected subgraphs.
  - Self-loop routing generating smooth arcs positioned cleanly below node bottom boundaries.
- **UI & Panel Integration**:
  - Representation badges (`Representation: Pointer Graph`, `Representation: Adjacency Matrix`).
  - Interactive SVG rendering in `NewVisualizationPanel.tsx` and `StructureVisualizationPanel.tsx`.
- **Automated Verification:**
  - 13 unit tests in `tests/unit/visualization/graphVisualization.test.ts` and 15 UI integration tests in `tests/unit/ui/newVisualizationGraph.test.tsx`.

---

## Phase 6.4 — Binary Tree & BST Visualization

### Added
- **Tree Detection & Analysis** (`src/visualization/detectors/treeDetector.ts` & `pointerViewTreeLayout.ts`):
  - Discovers binary tree structures from heap struct nodes containing `left` and `right` pointer fields.
  - Classifies tree topologies: identifies roots, evaluates Binary Search Tree (BST) ordering invariants, and computes metrics (depth, node count, balance).
- **Deterministic Reingold-Tilford Layout** (`src/visualization/layout/treeLayout.ts`):
  - Symmetrical hierarchical tree placement algorithm ensuring child subtrees do not overlap.
  - Left and right branch connector routing with distinct visual cues.
- **UI Integration**:
  - Interactive Tree View embedded in `NewVisualizationPanel` and `PointerViewPanel`.
- **Automated Verification:**
  - 13 unit tests in `tests/unit/visualization/treeVisualization.test.ts` and 6 UI tests in `tests/unit/ui/pointerViewTree.test.tsx`.

---

## Architecture & Infrastructure Updates

### Changed
- **Pure Browser Architecture:** Cleanly removed legacy Tauri desktop runtime dependencies and configuration via `.gitignore` and build scripts, establishing Codevi as an uncompromised 100% client-side web application.
- **Test Suite Milestone:** Expanded automated test coverage from 31 test files / 365 tests to **45 test files / 500 tests passing cleanly (100% pass rate)**.
- **Workbench Layout:** Integrated `NewVisualizationPanel` with Top-Right tabs (AST, Declarations, Visualization) unifying memory, arrays, ADTs, trees, and graphs.

---

## Phase 6 — Pointer Visualization & Comprehensive Memory Model

### Added
- Interactive SVG **Pointer View** panel (`src/components/panels/PointerViewPanel.tsx`): graph showing stack variables on the left, heap allocations on the right, NULL node, and animated directional connectors.
- Outward curved stack-to-stack connector routing with tiered bezier paths that cleanly approach target cards from the right without intersecting card bodies.
- Simulated pointer location display: `printf("%p\n", p)` prints target address (e.g. `S001`), `printf("%p\n", &p)` prints pointer's own stack address (e.g. `S002`).
- Simulated address badges (`@S001`, `@S002`) displayed in the Variables panel and Pointer View cards.
- Pointer detail inspection sidebar displaying pointer name, own address, target address/name, region, status (`valid`, `null`, `freed`, `invalid`), and pointer chain depth.
- Array initialization slot value extraction in `ExecutionEngine.ts` displaying individual element values (`[0]=10, [1]=20, ...`) in Variables and Memory panels.
- Address-of array elements (`&arr[i]`) producing pointers with slot offsets.
- Pointer arithmetic on array elements and heap blocks (`++`, `--`, `+=`, `-=`).
- Pointer difference subtraction (`q - p`) with same-object validation and `%ld` printf specifier.
- 9-theme design system selector (Dark Modern, Light Modern, One Dark Pro, GitHub Dark, Tokyo Night, Catppuccin Mocha, Dracula, Nord, Ayu Mirage) with localStorage persistence and Monaco Editor sync.
- 110+ new automated tests across `phase6Pointers.test.ts`, `phase6Arrays.test.ts`, `phase6PointerLocations.test.ts`, and theme tests, bringing total test suite to 206 tests.
- Phase 6 design and architecture documentation (`docs/phases/PHASE_6_POINTER_VISUALIZATION.md`).

### Changed
- `VariablePanel.tsx`: enhanced to show variable locations (`@address`), pointer targets, and array slot values.
- `MemoryPanel.tsx`: extended with pointer chain resolution (`pp → p → x`).
- `CodeEditor.tsx`: fixed caret alignment drift via font remeasurement and layout sync.

---

## Phase 5 — Pointers & Dynamic Memory

### Added
- Simulated address space model (`src/memory/memory.ts`) with deterministic stack (`S001`) and heap (`H001`) identifiers.
- Pointer support: `&` (address-of), `*` (dereference read/write), pointer-to-pointer (`int **`), NULL initialization & comparison.
- Dynamic memory management: `malloc`, `calloc`, `realloc`, `free` (including safe `free(NULL)`).
- Memory safety diagnostics: use-after-free and double-free detection.
- `sizeof` evaluation for basic types and expressions.
- Extended Memory panel showing stack variables, heap blocks (active and freed), and allocation origins.
- 29 unit tests covering pointer operations and dynamic memory safety.
- Phase 5 design documentation (`docs/phases/PHASE_5_POINTERS.md`).

---

## Phase 4.1 — Basic C Standard I/O

### Added
- Standard I/O support (`src/stdlib/stdio.ts`): `printf`, `scanf`, `puts`, `putchar`, `getchar`.
- Format specifiers: `%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`.
- Interactive input requests pausing generator execution for user input in Console.
- 13 stdio interpreter tests.
- Phase 4.1 documentation (`docs/phases/PHASE_4_1_STDIO.md`).

---

## Phase 4 — Memory, Variables & Stack Visualization

### Added
- Call stack tracking and frame visualization (`StackPanel.tsx`).
- Active frame local and parameter variable inspection (`VariablePanel.tsx`).
- Execution change highlighting (`useChangedKeys.ts`).
- Phase 4 documentation (`docs/phases/PHASE_4_VISUALIZATION.md`).

---

## Phase 3 — Execution Engine

### Added
- In-browser generator-based C AST interpreter (`src/interpreter/interpreter.ts`).
- Execution controls: Run, Pause, Step Forward, Step Into, Reset.
- Variable scope management (`src/interpreter/scope.ts`).
- Phase 3 documentation (`docs/phases/PHASE_3_EXECUTION.md`).

---

## Phase 2 — Parser Integration

**Merged into Phase 1 foundation.**

### Added
- Tree-sitter WASM runtime (`web-tree-sitter`) and C grammar (`tree-sitter-c`) — bundled offline
- Parser service (`src/services/parserService.ts`): `initParser()`, `parseSource()`, `getNodeAtPosition()`, incremental parsing support
- AST type definitions (`src/languages/c/astTypes.ts`): `AstNode`, `SyntaxDiagnostic`, `ParseResult`
- AST conversion utilities (`src/languages/c/astConvert.ts`): Tree-sitter → serializable AST, diagnostic collection, node counting
- Parser Zustand store (`src/state/parserStore.ts`): status, AST, diagnostics, parse timing
- `useCParser` hook (`src/hooks/useCParser.ts`): parser lifecycle management, debounced re-parse (120ms)
- AST Viewer panel (`src/components/panels/AstViewerPanel.tsx`): expandable tree view with stats
- AST tree node component (`src/components/panels/AstTreeNode.tsx`): recursive expand/collapse
- Tabs component (`src/components/common/Tabs.tsx`): generic tab switcher
- Phase 2 design documentation (`docs/PHASE_2_PARSER.md`)

### Changed
- `ConsolePanel`: now shows parser status and syntax diagnostics (still shows "Ready." when idle)
- `VisualizationPanel`: removed `PanelShell` wrapper (now lives inside Tabs container)
- `AppShell`: Visualization slot replaced with AST/Visualization tab group
- `CodeEditor`: added parser integration (useCParser hook, diagnostic markers, coordinate translation) while preserving all Phase 1 smart-edit handlers

### Dependencies Added
- `web-tree-sitter` ^0.26.11
- `tree-sitter-c` ^0.24.1

---

## Phase 1 — Project Foundation

### Added
- Tauri + React + TypeScript + Tailwind CSS + Rust project structure
- Monaco Editor with C syntax highlighting, offline configuration
- Smart-edit handlers: bracket pair auto-close, smart backspace, angle-bracket `#include` completion
- Workbench layout: Toolbar, Editor, Visualization, Variable, Memory, Explanation, Console panels
- Zustand state management: editor, UI, execution (placeholder), memory (placeholder), visualization (placeholder)
- Dark/light theme with persistence
- IBM Plex Sans + IBM Plex Mono fonts (self-hosted, offline)
- Error dialog and toast notification components
- Scoped logging utility
- Blueprint design system

---

## Phase 0 — Architecture & Planning

### Added
- Full architectural blueprint (`docs/PHASE_0_ARCHITECTURE.md`)
- 14-phase development roadmap
- Project governance documentation

---

Continue updating this file after every completed phase.
