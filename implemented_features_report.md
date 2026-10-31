# Codevi - Implemented Features Report

This report outlines all the features and systems that have been successfully implemented in the **Codevi** project, up to and including **Phase 6.5.3**. 

---

## 1. Project Foundation (Phase 1)
- **Tech Stack**: Pure client-side application built with React 19, TypeScript, Tailwind CSS, Monaco Editor, and WebAssembly.
- **Code Editor**: Integrated Monaco Editor with C syntax highlighting, offline configuration, and smart-edit handlers (bracket auto-close, smart backspace, angle-bracket `#include` completion).
- **Workbench Layout**: Functional layout featuring Toolbar, Editor, Visualization, Variable, Memory, Explanation, and Console panels.
- **State Management**: Zustand state management for editor, UI layout, execution, memory, and visualization.
- **Theming**: A robust 9-theme design system (Dark Modern, Light Modern, One Dark Pro, GitHub Dark, Tokyo Night, Catppuccin Mocha, Dracula, Nord, Ayu Mirage) with localStorage persistence and Monaco Editor synchronization.
- **UI Components**: Blueprint design system, custom error dialogs, and toast notifications.

## 2. Parser Integration (Phase 2)
- **Tree-Sitter Engine**: Fully offline Tree-sitter WASM runtime and C grammar (`tree-sitter-c`).
- **AST Services**: Parser service capable of incremental parsing, AST node coordinate translation, and syntax diagnostic collection.
- **AST Viewer**: Interactive, expandable AST viewer panel for inspecting the parsed structure of the C code.

## 3. Execution Engine (Phase 3)
- **Interpreter**: In-browser generator-based C AST interpreter capable of evaluating expressions and statements.
- **Execution Controls**: Full debugging playback controls: Run, Pause, Step Forward, Step Into, and Reset.
- **Scope Management**: Proper lexical scope management for C variables during execution.

## 4. Visualization & I/O (Phase 4 & 4.1)
- **Stack & Variables Visualization**: 
  - Call stack tracking and frame visualization (`StackPanel`).
  - Active frame local and parameter variable inspection (`VariablePanel`).
- **Memory Visualization**: 
  - Execution change highlighting for tracked variables.
- **Standard I/O**:
  - Support for `printf`, `scanf`, `puts`, `putchar`, `getchar`.
  - Proper format specifiers implemented: `%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`.
  - Interactive console input requests that pause generator execution.

## 5. Pointers & Dynamic Memory (Phase 5)
- **Pointer Semantics**: 
  - Address-of (`&`) and dereference (`*`) operations.
  - Support for pointer-to-pointer (e.g., `int **`).
  - NULL initialization and comparison.
- **Dynamic Memory Management**: 
  - Implementations for `malloc`, `calloc`, `realloc`, and `free` (including safe `free(NULL)`).
- **Memory Safety Diagnostics**: 
  - Runtime detection for use-after-free and double-free errors.
- **Memory Model**: 
  - Simulated deterministic address space model (e.g., stack `S001`, heap `H001`).
- **Memory Evaluation**: 
  - `sizeof` evaluation for basic types and expressions.

## 6. Pointer & Data Structure Visualization (Phase 6 - 6.3)
- **Interactive SVG Pointer View**: Visual graph showing stack variables on the left, heap allocations on the right, NULL node, and animated directional connectors demonstrating "what points to what".
- **Advanced Connector Routing**: Outward curved stack-to-stack connector routing avoiding card collisions, and stack-to-heap animated bezier connector routing.
- **Simulated Locations**: 
  - Pointer variable locations displayed accurately via `printf("%p")` (distinguishing a pointer's target vs. its own address).
  - Simulated address badges (`@S001`, `@S002`) integrated into the Variables panel and Pointer View cards.
- **Pointer Detail Sidebar**: Displays pointer name, own address, target address/name, region, status (`valid`, `null`, `freed`, `invalid`), and pointer chain depth.
- **Arrays & Active Index Tracking (Phase 6.1)**: 
  - 1D and 2D stack arrays with row/column coordinate layouts.
  - Active index markers annotating slots (`i ▾`, `p ➔`) and cell-level read/write access highlighting.
- **Linked Lists & Structs (Phase 6.2)**:
  - Struct definitions, direct (`.`) and arrow (`->`) field access.
  - Singly linked list and circular linked list detection with heap block ordering by traversal.
- **Stacks & Queues (Phase 6.3)**:
  - Array-backed Stack (`top` indicator) and Queue (`front`/`rear` indicators) detection and visualization.

## 7. Trees & Graphs (Phase 6.4 - 6.5.3)
- **Binary Tree & BST Visualization (Phase 6.4)**:
  - Automatic detection of binary trees from heap struct nodes with `left` and `right` pointers.
  - Validation of Binary Search Tree (BST) invariant and computation of depth, size, and balance metrics.
  - Deterministic Reingold-Tilford hierarchical layout ensuring non-overlapping subtrees.
- **Graph Visualization Foundation (Phase 6.5 V1)**:
  - Unified `GraphModel` domain architecture normalizing pointer graphs and adjacency matrices.
  - Deterministic layered graph layout with component separation and outer perimeter back-edge routing.
- **Pointer-Based Graphs (Phase 6.5.2)**:
  - Detection of multi-target nodes, shared destinations ($in\text{-}degree \ge 2$), directed cycles, and self-loops.
  - Disambiguation rules preventing misclassification of trees or linked lists.
- **Adjacency Matrix Graphs & Clearance Routing (Phase 6.5.3)**:
  - Runtime detection of $N \times N$ 2D square array adjacency matrices (binary and weighted).
  - Normalization into `GraphModel` replacing the raw matrix grid with an interactive graph in `NewVisualizationPanel`.
  - 3-color DFS directed cycle detection.
  - Targeted edge-node clearance routing: same-layer forward cross-edges arch cleanly above intermediate obstacles, backward edges arch below with self-loop allowance, skip-layer downward edges bypass vertical corridors, and cycle back-edges maintain $\ge 20$–$26\text{px}$ clearance.

## 8. Testing & Quality Assurance
- **Unit Testing**: **500 automated unit tests across 45 test files (100% passing)** with Vitest.
- **Performance**: Debounced re-parsing (120ms) and editor caret remeasurement on font load and layout resize for seamless UX.
