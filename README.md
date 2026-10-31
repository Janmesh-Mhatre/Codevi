# Codevi

An educational, browser-based interactive execution visualizer for C programs — built with React, TypeScript, Tailwind CSS, Monaco Editor, and WebAssembly (Tree-sitter).

Codevi enables students and programmers to see how C code actually executes: stepping through control flow, watching variables change across lexical scopes, tracing simulated memory layouts across stack and heap regions, and visualizing pointers and data structures in real time.

---

## Features

- **Offline WebAssembly C Parser:** Powered by Tree-sitter (`web-tree-sitter` and `tree-sitter-c`) bundled locally; delivers instant syntax validation and AST generation with zero network dependencies.
- **Pausable Generator-Based Interpreter:** In-browser C AST interpreter running on JavaScript generators (`function*` / `yield`), providing full control over execution (Run, Pause, Step Forward, and Reset).
- **Scope & Frame Tracking:** Scope-correct call stack tracking supporting function calls, nested block scopes, recursion (up to 200 levels), and separate inspection of parameters and local variables.
- **Deterministic Simulated Memory Model:** Eliminates confusing hardware addresses in favor of deterministic labels (`S001`, `S002` for stack cells; `H001`, `H002` for heap allocations).
- **Memory Safety Diagnostics:** Runtime detection of use-after-free, double-free, invalid frees, null-pointer dereferences, and allocation leaks.
- **Interactive SVG Pointer View:** Live visual graph displaying stack variables, heap blocks, NULL sentinel, and directional animated connectors with collision-free bezier routing.
- **Dedicated Variable & Array View:** Tabular scalar view, 1D array boxes, 2D matrix grids with cell-level read/write highlighting, active index variable badges (`i ▾`), and boundary cues.
- **Data Structure Detection:** Automatic recognition of singly linked lists, circular linked lists, array-backed Stacks (`top` variable), array-backed Queues (`front`/`rear` or `head`/`tail`), binary trees / binary search trees (BSTs), pointer-based graphs, and adjacency matrix graphs.
- **Tree & Graph Visualization:** Interactive hierarchical layout for binary trees with depth/balance metrics, and layered collision-free graph layout supporting cycles, outer perimeter back-edges, self-loops, and dense adjacency matrices with targeted edge-node clearance routing.
- **Interactive Standard I/O:** Emulated `printf` (with `%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`), `puts`, `putchar`, and interactive execution-pausing `scanf` and `getchar`.
- **9-Theme Design System:** Curated palette (Dark Modern, Light Modern, One Dark Pro, GitHub Dark, Tokyo Night, Catppuccin Mocha, Dracula, Nord, Ayu Mirage) with `localStorage` persistence and dynamic Monaco Editor synchronization.

---

## Architecture

Codevi follows a strict unidirectional, decoupled architecture:

```text
C Source Code (Monaco Editor)
       ↓  (Debounced TextChange stream)
Tree-sitter WASM Parser (parserService.ts)
       ↓  (CST / AstNode representation)
Generator-Based Interpreter (interpreter.ts)
  ├── Lexical Scope Manager (scope.ts)
  └── Simulated Memory Model (memory.ts)
       ↓  (Yields internal InterpreterStep)
Execution Engine (ExecutionEngine.ts)
  ├── Plain data conversion (ExecutionStep)
  ├── Pointer relationship derivation
  └── Per-step memory access telemetry
       ↓
Zustand Store Mirror (executionStore.ts, uiStore.ts)
       ↓
UI & Visualization Panels (React 19 + SVG)
```

For a comprehensive technical breakdown of every layer, see [`docs/PROJECT_ANALYSIS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/PROJECT_ANALYSIS.md).

---

## Visualization

Codevi offers multiple specialized visualization panels:

1. **Unified Visualization Panel (`NewVisualizationPanel`):**
   - **Pointer & Memory View:** Bipartite layout with Stack variables on the left, Heap allocations on the right, centered `NULL` terminal card, tiered stack-to-stack connector routing, and linked-list traversal ordering.
   - **Array & Matrix View:** 1D array slot cards showing elements, indices, and active pointer/index cues (`i ▾`, `p ➔`); 2D matrix grids with coordinate labels (`[r][c]`) and read/write highlighting.
   - **Stack & Queue ADT View:** Dedicated indicators for `Top` (stacks) and `Front` / `Rear` (queues).
   - **Binary Tree & BST View (Phase 6.4):** Deterministic Reingold-Tilford hierarchical layout for binary trees and BSTs with left/right child branch routing and computed depth/balance metrics.
   - **Graph View (Phase 6.5 - 6.5.3):** Unified GraphModel visualization supporting pointer-based graphs and 2D adjacency matrices with cycle back-edge routing, self-loops, disconnected component separation, and targeted obstacle-avoidance clearance.
2. **Pointer View (`PointerViewPanel`):**
   - Detailed inspection sidebar displaying address, target, region, status, and pointer chain depth.
3. **Variable & Array View (`VariableArrayViewPanel`):**
   - Direct inspection of scalar variables, arrays, and ADTs with simulated address badges (`@S001`).
4. **Stack Frames Panel (`StackPanel`):**
   - Active call stack frames displaying function name, call depth, line number, parameters, and locals.
5. **Memory Grid Panel (`MemoryPanel`):**
   - Uniform view of all stack cells and heap blocks with pointer resolution chains (`pp → p → x`).
6. **AST Viewer (`AstViewerPanel`):**
   - Expandable syntax tree viewer with node counts and parse time metrics.

---

## Supported C Features

### Verified Implemented Features
- **Data Types:** `int`, `float`, `double`, `char`.
- **Variables & Scope:** Local variables, global variables, block scoping `{ ... }`, multi-variable declarations.
- **Arrays:** 1D and 2D stack arrays, partial initialization, subscripting (`arr[i]`, `matrix[r][c]`), array decay to pointer, element address-of (`&arr[i]`), dynamic heap arrays (`malloc(n * sizeof(int))`).
- **Pointers:** Address-of (`&`), dereferencing read/write (`*p`, `*p = val`), pointer-to-pointer (`**pp`), pointer arithmetic (`+`, `-`, `++`, `--`, `+=`, `-=`), pointer subtraction (`q - p`), pointer comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`).
- **Structs:** Definitions (`struct Node { int data; struct Node *next; };`), stack struct variables (`struct Node n;`), heap struct allocations (`malloc(sizeof(struct Node))`), direct access (`n.data`), arrow dereference (`p->next`), self-referential linked list, tree, and graph structs.
- **Data Structures:**
  - Singly linked lists and circular linked lists (cycle detection).
  - Array-backed Stacks (`top`) and Queues (`front`/`rear`).
  - Binary trees and Binary Search Trees (BSTs) with `left` and `right` child pointers.
  - Pointer-based graphs (multi-target nodes, shared destinations with $in\text{-}degree \ge 2$, cross-edges, cycles, self-loops).
  - Adjacency matrix graphs (square 2D arrays with binary or weighted edges and obstacle-avoidance routing).
- **Dynamic Memory:** `malloc`, `calloc`, `realloc`, `free` (including safe `free(NULL)`), use-after-free and double-free error detection, allocation leak reporting.
- **Standard I/O:** `printf` (`%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`), `scanf` (interactive input prompt), `puts`, `putchar`, `getchar`.
- **Control Flow:** `if` / `else`, `while`, `do { ... } while (...)`, `for`, `switch` / `case` / `default` (with fallthrough and duplicate case validation), `break`, `continue`, `return`.
- **Functions:** User-defined functions, mutual and recursive calls (up to depth 200), parameter passing by value and by pointer.

### Current Language Limitations & Unsupported Features
- **String Variables:** General string variables (`char str[] = "hello"` or `char *s = "text"`) are not supported; string literals are only supported as direct arguments to `printf`/`puts`.
- **Bit-Level / Overflow Semantics:** All numbers are backed by JavaScript IEEE 754 floats; integer overflow wrap-around is not simulated.
- **Unions, Enums, Typedefs:** `union`, `enum`, and `typedef` are not supported.
- **Function Pointers & Goto:** Function pointers and `goto` labels are not supported.
- **Data Structure Limitations:** Stacks and Queues are supported via array backing only (linked-list-backed ADT detection is unsupported); Graph adjacency lists are planned for Phase 7.

For the complete status of all features, consult [`docs/FEATURE_STATUS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/FEATURE_STATUS.md).

---

## Project Structure

```text
codevi/
├── docs/                            # Project specifications & architecture documentation
│   ├── FEATURE_STATUS.md            # Verified feature status matrix
│   ├── PROJECT_ANALYSIS.md          # Comprehensive master analysis document
│   ├── ROADMAP.md                   # Multi-phase development roadmap
│   └── phases/                      # Phase-by-phase design documents
├── src/
│   ├── app/                         # React DOM root and application container
│   ├── components/
│   │   ├── common/                  # ErrorDialog, PanelShell, ResizeHandle, Tabs, Toast
│   │   ├── editor/                  # Monaco CodeEditor, font remeasurement, markers
│   │   ├── layout/                  # AppShell workbench layout
│   │   ├── panels/                  # Panels (PointerView, VariableArrayView, Memory, etc.)
│   │   └── toolbar/                 # Execution controls and ThemeDropdown
│   ├── execution/
│   │   ├── engine/ExecutionEngine.ts# Step scheduler, time-slice loop, input suspension
│   │   ├── models/executionTypes.ts # Snapshot interfaces (ExecutionStep, StackFrame, etc.)
│   │   └── utils/                   # Value formatters and change-highlight hooks
│   ├── hooks/                       # useCParser, useTheme
│   ├── interpreter/                 # Generator-based C interpreter, scope, values, types
│   ├── memory/                      # Simulated deterministic memory model (stack & heap)
│   ├── parser/                      # Tree-sitter WASM service, AST converter, AST types
│   ├── state/                       # Zustand stores (execution, ui, parser, editor)
│   ├── stdlib/                      # C Standard I/O (printf, scanf, getchar) emulation
│   ├── themes/                      # 9-theme design system and Monaco synchronizer
│   └── visualization/               # Structure detector, connectors, layouts, diff engine
├── tests/                           # Unit and integration test suite
│   └── unit/                        # 45 test files, 500 tests (100% passing)
├── vitest.config.ts                 # Vitest test configuration
├── vite.config.ts                   # Vite bundler configuration
└── package.json                     # Dependencies & scripts
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20.x or later
- npm 10.x or later

### Installation
```bash
git clone https://github.com/Janmesh-Mhatre/Codevi.git
cd Codevi
npm install
```

---

## Development

Run the local Vite development server:
```bash
npm run dev
```

Open your browser to the local server URL (default: `http://localhost:1420`).

---

## Testing

Run the automated test suite with Vitest:
```bash
npm test
```

**Test Suite Status:** **45 test files, 500 tests passing cleanly (0 failures, 100% pass rate)**.

Tests run with `fileParallelism: false` in `vitest.config.ts` to ensure deterministic execution of WebAssembly memory across test cycles.

---

## Production Build

To perform type-checking and build the production bundle:
```bash
npm run build
```

Assets are built to `dist/` with offline WebAssembly binaries (`web-tree-sitter.wasm`, `tree-sitter-c.wasm`), Monaco workers, and self-hosted fonts.

Preview the production build locally:
```bash
npm run preview
```

---

## Deployment

Codevi is built as a static client-side web application. It can be hosted on any static hosting platform (Vercel, GitHub Pages, Netlify, Cloudflare Pages, AWS S3/CloudFront) with standard single-page app (SPA) routing to `dist/index.html`.

---

## Documentation

- [`docs/PROJECT_ANALYSIS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/PROJECT_ANALYSIS.md) — Comprehensive master analysis of all subsystems, architecture, and memory models.
- [`docs/FEATURE_STATUS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/FEATURE_STATUS.md) — Detailed feature status matrix.
- [`docs/ROADMAP.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/ROADMAP.md) — Multi-phase project roadmap and current completion status.
- [`docs/DEVELOPMENT_GUIDELINES.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/DEVELOPMENT_GUIDELINES.md) — Code conventions and phase rules.
- [`docs/phases/`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/phases/) — Historical design documents for individual phases.

---

## Current Status

- **Phases 0 through 6.5.3 Completed:** Core project foundation, WASM parser, generator interpreter, memory model, stdio, pointers, 1D/2D arrays, linked lists, array-backed stacks/queues, 9-theme design system, binary trees / BSTs (Phase 6.4), pointer-based graphs (Phase 6.5.2), and adjacency matrix graphs with targeted clearance routing (Phase 6.5.3) are fully implemented and verified with **500 unit tests across 45 suites**.
- **Active Areas & Next Steps:** Doubly linked lists, graph adjacency lists, algorithm visualization (sorting/searching), and reverse step execution ("Step Back").
