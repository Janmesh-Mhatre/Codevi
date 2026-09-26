# Codevi

An educational, browser-based interactive execution visualizer for C programs — built with React, TypeScript, Tailwind CSS, Monaco Editor, WebAssembly (Tree-sitter), and Tauri.

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
- **Data Structure Detection:** Automatic recognition of singly linked lists, circular linked lists, array-backed Stacks (`top` variable), and array-backed Queues (`front`/`rear` or `head`/`tail`).
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

1. **Pointer View (`PointerViewPanel`):**
   - Bipartite layout: Stack variables on the left, Heap allocations on the right, centered `NULL` terminal card.
   - Outward tiered stack-to-stack connector routing preventing card overlap.
   - Stack-to-heap smooth bezier routing.
   - Heap-to-heap adjacent, reverse, and circular closing connectors.
   - Heap block ordering based on actual linked list `next` traversal order.
   - Interactive sidebar displaying address, target, region, status, and pointer chain depth.
2. **Variable & Array View (`VariableArrayViewPanel`):**
   - Scalar variable table with simulated address badges (`@S001`).
   - 1D array slot cards showing elements, indices, and active pointer/index cues (`i ▾`, `p ➔`).
   - 2D array grid matrices with coordinate labels (`[r][c]`) and read/write highlighting.
   - Array-backed Stack ADT visualization with `Top` position indicators.
   - Array-backed Queue ADT visualization with `Front` and `Rear` indicators.
3. **Stack Frames Panel (`StackPanel`):**
   - Active call stack frames displaying function name, call depth, line number, parameters, and locals.
4. **Memory Grid Panel (`MemoryPanel`):**
   - Uniform view of all stack cells and heap blocks with pointer resolution chains (`pp → p → x`).
5. **AST Viewer (`AstViewerPanel`):**
   - Expandable syntax tree viewer with node counts and parse time metrics.

---

## Supported C Features

### Verified Implemented Features
- **Data Types:** `int`, `float`, `double`, `char`.
- **Variables & Scope:** Local variables, global variables, block scoping `{ ... }`, multi-variable declarations.
- **Arrays:** 1D and 2D stack arrays, partial initialization, subscripting (`arr[i]`, `matrix[r][c]`), array decay to pointer, element address-of (`&arr[i]`), dynamic heap arrays (`malloc(n * sizeof(int))`).
- **Pointers:** Address-of (`&`), dereferencing read/write (`*p`, `*p = val`), pointer-to-pointer (`**pp`), pointer arithmetic (`+`, `-`, `++`, `--`, `+=`, `-=`), pointer subtraction (`q - p`), pointer comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`).
- **Structs:** Definitions (`struct Node { int data; struct Node *next; };`), stack struct variables (`struct Node n;`), heap struct allocations (`malloc(sizeof(struct Node))`), direct access (`n.data`), arrow dereference (`p->next`), self-referential linked list structs.
- **Dynamic Memory:** `malloc`, `calloc`, `realloc`, `free` (including safe `free(NULL)`), use-after-free and double-free error detection, allocation leak reporting.
- **Standard I/O:** `printf` (`%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`), `scanf` (interactive input prompt), `puts`, `putchar`, `getchar`.
- **Control Flow:** `if` / `else`, `while`, `do { ... } while (...)`, `for`, `switch` / `case` / `default` (with fallthrough and duplicate case validation), `break`, `continue`, `return`.
- **Functions:** User-defined functions, mutual and recursive calls (up to depth 200), parameter passing by value and by pointer.

### Current Language Limitations & Unsupported Features
- **String Variables:** General string variables (`char str[] = "hello"` or `char *s = "text"`) are not supported; string literals are only supported as direct arguments to `printf`/`puts`.
- **Bit-Level / Overflow Semantics:** All numbers are backed by JavaScript IEEE 754 floats; integer overflow wrap-around is not simulated.
- **Unions, Enums, Typedefs:** `union`, `enum`, and `typedef` are not supported.
- **Function Pointers & Goto:** Function pointers and `goto` labels are not supported.
- **Data Structure Limitations:** Stacks and Queues are supported via array backing only (linked-list-backed ADT detection is unsupported); Trees and Graphs are planned.

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
│   └── unit/                        # 31 test files, 365 tests (100% passing)
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

**Test Suite Status:** **31 test files, 365 tests passing cleanly (0 failures)**.

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

For desktop distribution, native builds are supported via Tauri:
```bash
npm run tauri dev
npm run tauri build
```
*(Note: Native desktop packaging is optional; the browser web application is the primary active platform).*

---

## Documentation

- [`docs/PROJECT_ANALYSIS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/PROJECT_ANALYSIS.md) — Comprehensive master analysis of all subsystems, architecture, and memory models.
- [`docs/FEATURE_STATUS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/FEATURE_STATUS.md) — Detailed feature status matrix.
- [`docs/ROADMAP.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/ROADMAP.md) — Multi-phase project roadmap and current completion status.
- [`docs/DEVELOPMENT_GUIDELINES.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/DEVELOPMENT_GUIDELINES.md) — Code conventions and phase rules.
- [`docs/phases/`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/phases/) — Historical design documents for individual phases.

---

## Current Status

- **Phases 0 through 6.3 Completed:** Core project foundation, WASM parser, generator interpreter, memory model, stdio, pointers, 1D/2D arrays, linked lists, array-backed stacks/queues, and the 9-theme design system are fully implemented and verified with 365 unit tests.
- **Active Areas & Next Steps:** Binary search trees, graph data structure detection and layout, and reverse step execution ("Step Back").
