# Codevi — Master Project Analysis

> **Date:** October 2026  
> **Repository:** Codevi (`Janmesh-Mhatre/Codevi`)  
> **Active Branch:** `main`  
> **Source of Truth:** Current Codebase Implementation  

---

## 1. Project Overview

Codevi is an educational, browser-based interactive execution visualizer for C programs. It enables students and developers to observe step-by-step program execution, inspect lexical scopes and call stack frames, visualize memory layouts across simulated stack and heap regions, and explore data structures through dynamic SVG diagrams and interactive cards.

### Core Philosophy & Operational Constraints
1. **Fully Client-Side & Offline:** Codevi runs entirely in the browser using WebAssembly (`web-tree-sitter` and `tree-sitter-c`) and an in-browser generator-based C interpreter. No backend compiler, server process, or native debugger (GDB/LLDB) is required.
2. **Deterministic Simulated Memory:** Real hardware memory addresses are not used. Instead, Codevi implements a deterministic simulated memory model with prefixed identifiers (Stack: `S001`, `S002`; Heap: `H001`, `H002`), ensuring consistent visualization and educational clarity.
3. **Pausable Execution via Generators:** Step-by-step debugging, breakpoints, and interactive input (`scanf`/`getchar`) are driven by JavaScript generator functions (`function*` / `yield`), providing execution control without worker thread complexity.
4. **Framework-Independent Engine:** The parser service, C AST interpreter, and memory engine are decoupled from the UI framework, communicating state transitions through plain serializable snapshots.

---

## 2. Current Architecture

Codevi follows a unidirectional, multi-tiered architecture:

```
┌────────────────────────────────────────────────────────┐
│                   C Source Code                        │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         Monaco Code Editor (Browser / Offline)         │
└──────────────────────────┬─────────────────────────────┘
                           │ TextChange[] (debounced 120ms)
                           ▼
┌────────────────────────────────────────────────────────┐
│    Parser Service (web-tree-sitter WASM + C grammar)   │
└──────────────────────────┬─────────────────────────────┘
                           │ Tree-sitter CST / AstNode Tree
                           ▼
┌────────────────────────────────────────────────────────┐
│   Generator-Based AST Interpreter (interpreter.ts)     │
│   ├── Lexical Scope Manager (scope.ts)                 │
│   └── Simulated Memory Model (memory.ts)               │
└──────────────────────────┬─────────────────────────────┘
                           │ yields InterpreterStep (live state)
                           ▼
┌────────────────────────────────────────────────────────┐
│   Execution Engine (ExecutionEngine.ts)                │
│   ├── Step-to-Plain Snapshot Conversion                │
│   ├── Pointer Relationship & Graph Extraction          │
│   └── Memory Access Resolution (Reads & Writes)        │
└──────────────────────────┬─────────────────────────────┘
                           │ ExecutionStep plain snapshot
                           ▼
┌────────────────────────────────────────────────────────┐
│   Zustand Stores (executionStore, uiStore, parserStore)│
└──────────────────────────┬─────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐
│     Visualization Panels      │ │         UI Components         │
│  - Variable & Array View      │ │  - AppShell & Resizable Split │
│  - Interactive Pointer View   │ │  - CodeEditor (Monaco sync)   │
│  - Stack & Call Frame Panel   │ │  - Console (I/O & Stdio)      │
│  - Memory Grid Panel          │ │  - Explanation & Step Bar     │
│  - AST Hierarchy Viewer       │ │  - Curated 9-Theme System     │
└───────────────────────────────┘ └───────────────────────────────┘
```

---

## 3. Repository Structure

The current active codebase consists of modular source files in `src/`, 45 automated test suites in `tests/` with 500 passing tests, and associated documentation:

```text
codevi/
├── .env.example
├── CHANGELOG.md                     # Root project changelog
├── README.md                        # Master project entry point
├── index.html                       # Vite HTML entry point
├── package.json                     # NPM configuration & dependencies
├── tsconfig.json                    # TypeScript compiler configuration
├── tsconfig.node.json               # Node-specific TypeScript config
├── vite.config.ts                   # Vite bundler configuration (Tailwind v4)
├── vitest.config.ts                 # Vitest configuration (fileParallelism: false)
│
├── docs/                            # Project documentation
│   ├── CHANGELOG.md                 # Documentation-level changelog
│   ├── DEVELOPMENT_GUIDELINES.md    # Development conventions & phase rules
│   ├── FEATURE_STATUS.md            # Verified feature status matrix
│   ├── PROJECT_ANALYSIS.md          # This master architecture document
│   ├── PROJECT_CONTEXT.md           # Core assumptions & desktop roadmap
│   ├── ROADMAP.md                   # 14-phase development roadmap
│   ├── architecture/
│   │   ├── ARCHITECTURE.md          # High-level subsystem summary
│   │   └── PHASE_0_ARCHITECTURE.md  # Original blueprint and design decisions
│   └── phases/
│       ├── PHASE_2_PARSER.md        # Parser subsystem design
│       ├── PHASE_3_EXECUTION.md     # Interpreter & execution engine
│       ├── PHASE_4_VISUALIZATION.md # Stack & Variable visualization
│       ├── PHASE_4_1_STDIO.md       # Interactive C Standard I/O
│       ├── PHASE_5_POINTERS.md      # Pointers & dynamic memory
│       └── PHASE_6_POINTER_VISUALIZATION.md # Pointer view, memory graph, themes
│
├── public/                          # Static assets
│   └── .gitkeep
│
├── src/                             # Application source code
│   ├── app/
│   │   ├── App.tsx                  # Root React component
│   │   └── main.tsx                 # DOM mount entry point
│   ├── components/
│   │   ├── common/                  # ErrorDialog, PanelShell, ResizeHandle, Tabs, Toast
│   │   ├── editor/                  # CodeEditor (Monaco integration & markers)
│   │   ├── layout/                  # AppShell (workbench layout)
│   │   ├── panels/
│   │   │   ├── AstTreeNode.tsx      # Recursive AST tree renderer
│   │   │   ├── AstViewerPanel.tsx   # Interactive AST hierarchy inspector
│   │   │   ├── ConsolePanel.tsx     # Stdout console, input prompt, diagnostics
│   │   │   ├── ExplanationPanel.tsx # Step explanation bar
│   │   │   ├── MemoryPanel.tsx      # Simulated stack/heap memory grid
│   │   │   ├── PointerViewPanel.tsx # Interactive SVG pointer graph
│   │   │   ├── StackPanel.tsx       # Call stack frames & parameters
│   │   │   ├── VariableArrayViewPanel.tsx # Variables, 1D/2D arrays, stacks, queues
│   │   │   ├── VariablePanel.tsx    # Scope-aware variable table
│   │   │   └── VisualizationPanel.tsx # Dual-column Stack & Heap memory view
│   │   └── toolbar/
│   │       ├── ThemeDropdown.tsx    # Curated 9-theme dropdown selector
│   │       └── Toolbar.tsx          # Execution playback controls
│   ├── execution/
│   │   ├── engine/
│   │   │   └── ExecutionEngine.ts   # Execution scheduler, input handling, step mapping
│   │   ├── models/
│   │   │   └── executionTypes.ts    # Plain data snapshot interfaces
│   │   └── utils/
│   │       ├── formatValue.ts       # ExecutionValue string formatter
│   │       └── useChangedKeys.ts    # React hook for change-highlight tracking
│   ├── hooks/
│   │   ├── useCParser.ts            # Parser lifecycle and debounce manager
│   │   └── useTheme.ts              # UI theme hook
│   ├── interpreter/
│   │   ├── interpreter.ts           # Generator-based C AST interpreter
│   │   ├── scope.ts                 # Lexical block scoping & symbol tables
│   │   ├── types.ts                 # Runtime frames, signals, struct definitions
│   │   └── values.ts                # CValue runtime representations & operators
│   ├── memory/
│   │   └── memory.ts                # Simulated memory model (stack, heap, events)
│   ├── parser/
│   │   ├── astConvert.ts            # Tree-sitter CST to AstNode converter
│   │   ├── astTypes.ts              # Serializable AstNode & diagnostic types
│   │   └── parserService.ts         # WASM Tree-sitter manager & incremental parse
│   ├── state/
│   │   ├── editorStore.ts           # Editor code buffer
│   │   ├── executionStore.ts        # Zustand bridge for ExecutionEngine
│   │   ├── memoryStore.ts           # Legacy inert Phase 1 store
│   │   ├── parserStore.ts           # AST, syntax diagnostics, parse timing
│   │   ├── uiStore.ts               # Layout dimensions, panel visibility, themes
│   │   └── visualizationStore.ts    # Modular structure visualization state
│   ├── stdlib/
│   │   └── stdio.ts                 # printf/scanf formatting, parsing & emulation
│   ├── themes/
│   │   ├── applyTheme.ts            # CSS variable injection & Monaco theme sync
│   │   ├── themes.ts                # Palette token definitions for 9 themes
│   │   └── themeTypes.ts            # Theme interfaces and IDs
│   ├── types/
│   │   └── index.ts                 # Early phase skeleton types
│   ├── utils/
│   │   └── logger.ts                # Scoped logging utility
│   ├── visualization/
│   │   ├── components/              # Modular structure visualization components
│   │   │   ├── StructureCanvas.tsx
│   │   │   ├── StructureControls.tsx
│   │   │   ├── StructureDetailSidebar.tsx
│   │   │   ├── StructureNodeCard.tsx
│   │   │   └── StructureVisualizationPanel.tsx
│   │   ├── connectors/
│   │   │   └── connectorRouting.ts  # SVG curve routers & heap block ordering
│   │   ├── detectors/
│   │   │   └── structureDetector.ts # Extractors for arrays, linked lists, stacks, queues
│   │   ├── diff/
│   │   │   └── structureDiff.ts     # Step-to-step structural mutation detection
│   │   ├── layout/
│   │   │   ├── arrayLayout.ts       # Horizontal/grid layout math
│   │   │   ├── linkedListLayout.ts  # Linear linked list layout
│   │   │   └── pointerGraphLayout.ts# Two-column bipartite graph layout
│   │   └── models/
│   │       └── structureTypes.ts    # Unified StructureGraph & StructureNode types
│   ├── index.css                    # Tailwind CSS v4 directives & theme tokens
│   └── vite-env.d.ts                # Vite environment typings
│
└── tests/                           # Unit and integration test suite (31 files, 365 tests)
```

---

## 4. Core Subsystems

### 4.1 Parser Subsystem
- **Implementation:** [`src/parser/parserService.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/parser/parserService.ts), [`src/parser/astConvert.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/parser/astConvert.ts), [`src/parser/astTypes.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/parser/astTypes.ts).
- **Technology:** `web-tree-sitter` (WASM) with prebuilt `tree-sitter-c.wasm`.
- **Packaging:** Both WASM binaries are bundled locally as static assets via Vite (`?url`), ensuring 100% offline functionality.
- **Incremental Reparsing:** Single-character or single-range edits leverage Tree-sitter's `tree.edit()` API with CRLF/LF normalized coordinate tracking (`advancePosition()`). Multi-cursor edits and initial parses fall back to full parsing.
- **Error Recovery:** Collects `ERROR` and `MISSING` nodes into clean `SyntaxDiagnostic` entries, avoiding nested duplicate diagnostic noise.
- **AST Generation:** Converts the raw CST into a serializable `AstNode` hierarchy containing only named nodes for structural inspection in the AST Viewer.

### 4.2 Simulated Memory Model
- **Implementation:** [`src/memory/memory.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/memory/memory.ts).
- **Address Representation:**
  ```typescript
  export interface Address {
    space: "stack" | "heap";
    id: number;
    slot: number;
  }
  ```
  Addresses are formatted via `formatAddress()`:
  - Stack: `S001`, `S002`, `S003` (or `S001[i]` for array slots)
  - Heap: `H001`, `H002` (or `H001[i]` for multi-slot blocks)
- **Memory Cells:** `MemoryCell` pairs an `Address` with a `CValue` and an educational string label (e.g., `x`, `arr[0]`, `heap block H001[0]`).
- **Stack Allocation:**
  - `allocateStackCell(label, initialValue)`: Allocates single variable cell.
  - `allocateStackArray(label, slotCount, fill, dimensions)`: Allocates contiguous cells sharing the same `id` with distinct `slot` indices `0..slotCount-1`.
- **Heap Allocation:**
  - `allocateHeap(slotCount, elementSize, origin, fill)`: Tracks allocations via `HeapAllocation` (`active: boolean`, `byteSize`, `origin: "malloc" | "calloc" | "realloc"`).
  - Allocation limit: Enforces a safety ceiling of 500 active heap blocks (`MAX_HEAP_BLOCKS`).
- **Safety Diagnostics:**
  - **Use-After-Free:** Checked on pointer reads, writes, and arrow dereferences (`->`).
  - **Double-Free:** Explicitly detected in `free()`.
  - **Invalid Free:** Throws if freeing non-heap memory or non-zero slot offsets.
  - **Safe `free(NULL)`:** Handled as a valid no-op.
- **Memory Event Logging:** Bounded log of 200 events (`allocate`, `deallocate`, `pointer-assign`, `dereference`, `read`, `write`). `markStepStart()` and `getStepAccesses()` provide per-step access telemetry.

### 4.3 Type System & Runtime Values
- **Implementation:** [`src/interpreter/values.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/interpreter/values.ts), [`src/interpreter/types.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/interpreter/types.ts).
- **Supported Value Kinds:**
  - **Scalar:** `CScalarValue` (`int`, `float`, `double`, `char`), stored as JavaScript numbers.
  - **Pointer:** `CPointerValue` (`pointerType`, `target: Address | null`, `dimensions?`).
  - **Array:** `CArrayValue` (`elementType`, `baseAddress: Address`, `length`, `dimensions?`).
  - **Struct:** Stored as contiguous stack or heap slots; struct variables evaluate to a pointer to their base address.
- **Pointer Types:** Recursive `CPointerType` supporting arbitrary depth (`int*`, `int**`, `int***`) and struct pointees (`CStructPointee: { kind: "struct", name: string }`).

### 4.4 Lexical Scope Management
- **Implementation:** [`src/interpreter/scope.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/interpreter/scope.ts).
- Scopes are chained hierarchically (`parent: Scope | null`).
- Variables map names to `Address` instances (not values directly). Both direct reads/writes and pointer dereferences mutate the exact same underlying memory cell.
- Tracks declared array names and struct definitions across nested scopes.

### 4.5 Interpreter
- **Implementation:** [`src/interpreter/interpreter.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/interpreter/interpreter.ts).
- **Execution Strategy:** Mutually recursive generator functions (`Step<T> = Generator<InterpreterStep, T, InputResumeValue | undefined>`).
- **Program Entry:** `interpretProgram(rootNode)` finds all function definitions and top-level declarations, executes global variable initializations, verifies the presence of `main()`, and invokes `callFunction(mainFn)`.
- **Supported Statements:**
  - `compound_statement` (`{ ... }`)
  - `declaration` (scalars, pointers, arrays, structs, multi-variable declarations)
  - `expression_statement`
  - `if_statement` (with optional `else` / `alternative`)
  - `while_statement`
  - `do_statement` (`do ... while (...)`)
  - `for_statement` (with declaration or expression initializer, condition, update)
  - `switch_statement` (with `case_statement`, `default`, fallthrough, duplicate case validation)
  - `break_statement` (throws internal `BreakSignal`)
  - `continue_statement` (throws internal `ContinueSignal`)
  - `return_statement` (throws internal `ReturnSignal`)
  - `comment`, `preproc_include`, `preproc_def` (no-op passes)
- **Supported Expressions:**
  - Literals: integer, float, double, character constants, `NULL` macro.
  - Binary arithmetic: `+`, `-`, `*`, `/`, `%`.
  - Bitwise operations: `&`, `|`, `^`, `<<`, `>>`, `~`.
  - Relational & equality: `<`, `>`, `<=`, `>=`, `==`, `!=` (scalars and pointers).
  - Logical operations: `&&`, `||`, `!` (with short-circuit evaluation).
  - Unary operations: `-`, `+`, `!`, `~`, `sizeof`.
  - Pointer operations: `&` (address-of variable or subscript), `*` (dereference read/write).
  - Update expressions: `++`, `--` (prefix and postfix, scalars and pointers).
  - Assignments: `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=`.
  - Subscript expressions: `arr[i]` (1D) and `matrix[r][c]` (2D) with bounds checking.
  - Struct field access: `.` (direct) and `->` (pointer dereference).
  - Type cast expressions: `(type)val` (including struct pointer casts).
- **Standard Library Support:**
  - `printf`: `%d`, `%i`, `%c`, `%s`, `%f`, `%p` (prints simulated address like `S001`), `%ld` (pointer difference).
  - `scanf`: Interactive input pausing execution until user submits via Console.
  - `puts`: Prints string literal with trailing newline.
  - `putchar`: Emits single character to output buffer.
  - `getchar`: Requests single character interactively.
  - `malloc`: Allocates heap block; analyzes AST of size argument to infer slot count.
  - `calloc`: Allocates zero-filled heap blocks.
  - `realloc`: Resizes heap allocation preserving overlapping slots.
  - `free`: Deallocates heap block; validates active status and slot 0.

### 4.6 Execution Engine
- **Implementation:** [`src/execution/engine/ExecutionEngine.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/execution/engine/ExecutionEngine.ts).
- State Machine: `idle` → `preparing` → `running` / `paused` / `waiting-for-input` → `completed` / `error`.
- Time-Sliced Execution: Employs a 12ms burst budget (`TIME_BUDGET_MS`) yielding via `setTimeout(..., 0)` to maintain UI fluidity at 60 FPS.
- Infinite Loop Protection: Hard limit of 200,000 steps (`MAX_EXECUTION_STEPS`).
- Step Snapshot Transformation: Maps internal `InterpreterStep` (with live WASM references) to plain serializable `ExecutionStep` data.

---

## 5. Visualization Architecture

Codevi provides a unified visualization workspace inside the top-right workbench area:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Top-Right Workbench Tabs                        │
├──────────────────────┬──────────────────────┬──────────────────────────┤
│         AST          │     Declarations     │      Visualization       │
│     ViewerPanel      │        Panel         │ (NewVisualizationPanel)  │
└──────────────────────┴──────────────────────┴──────────────────────────┘
```

The active **Visualization tab** renders [`src/components/panels/NewVisualizationPanel.tsx`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/components/panels/NewVisualizationPanel.tsx), which dynamically detects, lays out, and renders data structures based on the executing program:

### 5.1 Memory & Pointer Graph
- **Layout:** Bipartite layout with stack variable cards on the left, heap allocation cards on the right, and a centralized `NULL` sentinel node.
- **Heap Block Ordering:** `orderHeapBlocks()` organizes heap cards according to actual linked-list `next` pointer traversal chains, grouping active unlinked blocks below, followed by freed blocks.
- **Connector Routing Styles:**
  1. **Stack-to-Stack Outward Loops:** Tiered cubic bezier curves arcing into the inter-column gap to prevent cutting through card bodies.
  2. **Stack-to-Heap Beziers:** Direct and smooth horizontal bezier connections between stack pointers and heap blocks with controlled single bends.
  3. **Heap-to-Heap Adjacent Links:** Direct vertical bezier links connecting consecutive struct nodes.
  4. **Heap-to-Heap Circular Links:** Arcs routing outward around the heap column to close circular linked lists.
  5. **Pointer-to-NULL:** Connectors pointing to the centered `NULL` terminal card.
- **Visual Status Coding:**
  - `valid`: Accent color (`var(--color-accent)`).
  - `null`: Muted dashed line (`var(--color-fg-muted)`).
  - `freed` / `invalid`: Danger dashed line (`var(--color-danger)`).
- **Field-Specific Colors:** Distinct colors for struct pointer fields (`next` = accent blue/cyan, `prev` = purple, custom fields = distinct palette).
- **Interactive Detail Sidebar:** Clicking any card or connector displays variable name, own address, target address, target region, validity status, and pointer chain depth.

### 5.2 Array, Matrix & ADT Views
- **Scalar Variables:** Clean tabular view showing name, type, simulated address badge (`@S001`), and formatted value.
- **1D Arrays:** Horizontal indexed slot boxes showing element values, indices (`[0]`, `[1]`), base address, active index indicators (`i ▾`, `p ➔`), and read/write highlighting.
- **2D Arrays:** Matrix grid rendering with row/column coordinate labels (`[r][c]`), dimension badges (`[2x3]`), and cell-level access indicators.
- **Array-Backed Stacks:** Automatically recognized when an array is declared alongside an integer named `top`. Displays stack elements with a dedicated `Top` pointer marker.
- **Array-Backed Queues:** Automatically recognized when an array is declared alongside integer indices named `front`/`rear` (or `head`/`tail`). Displays queue slots with `Front` and `Rear` position indicators.

### 5.3 Binary Tree & BST Visualization (Phase 6.4)
- **Implementation:** [`src/visualization/detectors/treeDetector.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/visualization/detectors/treeDetector.ts), [`src/visualization/layout/treeLayout.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/visualization/layout/treeLayout.ts), [`src/components/panels/pointerViewTreeLayout.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/components/panels/pointerViewTreeLayout.ts).
- **Tree Detection:** Identifies tree structures from heap struct nodes containing `left` and `right` pointer fields. Evaluates Binary Search Tree (BST) ordering invariants and computes tree depth, node count, and balance metrics.
- **Layout Algorithm:** Symmetrical Reingold-Tilford hierarchical layout ensuring non-overlapping subtrees with deterministic node positioning.
- **Rendering:** SVG branch connectors for left and right children with directional marker heads and depth level guides.

### 5.4 Graph Visualization (Phase 6.5 - 6.5.3)
- **Domain Model:** [`src/visualization/models/graphTypes.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/visualization/models/graphTypes.ts) provides a unified `GraphModel` normalizing pointer graphs and adjacency matrices.
- **Pointer-Based Graphs (Phase 6.5.2):** Discovered from heap allocations and pointer relationships when multi-target fan-outs, shared destinations ($in\text{-}degree \ge 2$), directed cycles, or self-loops exist.
- **Adjacency Matrix Graphs (Phase 6.5.3):** Runtime detection of $N \times N$ 2D square arrays containing binary or weighted connectivity entries across global and stack frames. Replaces the raw 2D array representation with an interactive graph.
- **Deterministic Layered Layout:** [`src/visualization/layout/graphLayout.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/visualization/layout/graphLayout.ts) layers nodes using cycle-breaking BFS/DFS.
- **Targeted Edge-Node Clearance Fix:**
  - *Same-layer cross-edges:* Forward edges ($B \to D$) arch upward with $yArch = \min(y_{obs}) - 26\text{px}$; backward edges ($D \to B$) arch downward with $yArch = \max(y_{obs} + h) + 26\text{px}$ (+ self-loop allowance).
  - *Skip-layer downward cross-edges:* Intermediate obstacles in vertical corridors trigger outer right perimeter routing.
  - *Upward cycle back-edges:* Outer perimeter corridors expand beyond all intermediate nodes ($minLeft - 26\text{px}$ or $maxRight + 26\text{px}$).
  - *Self-loops:* Smooth arcs positioned below node bottom boundaries.
  - *Disconnected components:* Positioned with clear separation margins (`GRAPH_COMPONENT_GAP = 60px`).

### 5.5 Supporting Panels
- **AST Viewer Panel (`AstViewerPanel.tsx`):** Expandable syntax tree with node counts and parse time metrics.
- **Declarations Panel (`DeclarationsPanel.tsx`):** Summary of all user declarations across scopes.
- **Stack Frames Panel (`StackPanel.tsx`):** Displays call stack hierarchy, current line number, and active vs. caller frames.
- **Memory Grid Panel (`MemoryPanel.tsx`):** Comprehensive grid of all allocated stack and heap cells, tracking allocation origins, pointer resolution paths (`pp → p → x`), and active values.

---

## 6. UI Architecture & Design System

- **Framework:** React 19 with Tailwind CSS v4.
- **Layout (`AppShell.tsx`):** Three-tier layout:
  - Header: Toolbar with execution controls and Theme selector.
  - Center: Resizable horizontal split between Monaco Code Editor (left) and Top-Right / Bottom-Right tabbed panels (right).
  - Footer: Resizable bottom split containing the Explanation bar and Console.
- **Theme System (`src/themes/`):** 9 curated, high-contrast themes:
  1. `dark-modern` (default)
  2. `light-modern`
  3. `one-dark-pro`
  4. `github-dark`
  5. `tokyo-night`
  6. `catppuccin-mocha`
  7. `dracula`
  8. `nord`
  9. `ayu-mirage`
  Themes are persisted in `localStorage`, inject CSS variables via `data-theme` on `document.documentElement`, and dynamically synchronize Monaco Editor themes without editor re-instantiation.

---

## 7. Testing Architecture

- **Test Runner:** Vitest 4.1.10.
- **Configuration:** `vitest.config.ts` sets `fileParallelism: false` to ensure deterministic sequential execution of WebAssembly-heavy tests.
- **Current Test Count:** **45 test files, 500 tests — 100% passing.**

| Test Suite / Area | Files | Tests | Verification Scope |
|---|---|---|---|
| **Parser & AST** | 1 | 19 | Tree-sitter WASM initialization, incremental parsing, diagnostic recovery |
| **Interpreter Core** | 6 | 78 | Basic expressions, scoping, functions, recursion, switch/case/break/continue |
| **Call Stack & Stdio Engine** | 2 | 12 | Call stack tracking, execution engine stdio hooks |
| **Standard I/O Subsystem** | 2 | 43 | `printf`, `scanf`, `puts`, `putchar`, `getchar`, format specifiers |
| **Pointers & Simulated Memory** | 12 | 137 | `&`, `*`, `**`, pointer arithmetic, subtraction, `malloc`/`free`, double-free, use-after-free |
| **Arrays (1D & 2D)** | 2 | 23 | 1D arrays, 2D arrays, indexing, array decay, bounds validation |
| **Linked Lists, Stacks & Queues** | 5 | 40 | Singly linked lists, cycle detection, pointer ordering, array-backed stacks/queues |
| **Trees (Phase 6.4)** | 2 | 19 | Binary trees, BST validation, metrics, Reingold-Tilford layout, UI rendering |
| **Graphs (Phase 6.5 - 6.5.3)** | 5 | 53 | GraphModel, pointer graphs, adjacency matrix graphs, cycle DFS, targeted obstacle clearance |
| **UI, Stores & Themes** | 8 | 76 | Theme switching, Monaco sync, `uiStore` resizing, variable array view, panels dropdown |
| **Total** | **45** | **500** | **All 500 tests passing cleanly (100% pass rate)** |

---

## 8. Build & Deployment Configuration

- **Development:** `npm run dev` starts Vite development server on port 1420 (strict port, HMR enabled).
- **Testing:** `npm test` runs `vitest run` sequentially across all 45 test suites.
- **Type Checking & Production Build:** `npm run build` runs `tsc && vite build`, emitting optimized assets to `dist/`:
  - `web-tree-sitter.wasm` (444.60 kB)
  - `tree-sitter-c.wasm` (175.76 kB)
  - `editor.worker.js` (bundled locally via `?worker`)
  - IBM Plex Mono & IBM Plex Sans web fonts (bundled locally)
- **Platform Target:** Browser-based React + TypeScript SPA. Desktop/Tauri wrappers have been removed to keep the architecture purely web-native.

---

## 9. Current Feature Status Summary

| Capability | Status | Verified Implementation Location |
|---|---|---|
| C Syntax Parsing (WASM) | **Implemented** | `src/parser/parserService.ts` |
| AST Viewer | **Implemented** | `src/components/panels/AstViewerPanel.tsx` |
| Scalar Variables & Scope | **Implemented** | `src/interpreter/scope.ts`, `values.ts` |
| 1D Arrays | **Implemented** | `src/memory/memory.ts`, `interpreter.ts` |
| 2D Arrays | **Implemented** | `src/memory/memory.ts`, `interpreter.ts` |
| Array Subscripting & Bounds | **Implemented** | `src/interpreter/interpreter.ts` |
| Pointers (`&`, `*`, `**`) | **Implemented** | `src/interpreter/interpreter.ts`, `values.ts` |
| Pointer Arithmetic (`+`, `-`, `++`, `--`) | **Implemented** | `src/interpreter/interpreter.ts` |
| Pointer Subtraction (`q - p`) | **Implemented** | `src/interpreter/interpreter.ts` |
| Relational Pointer Comparisons | **Implemented** | `src/interpreter/interpreter.ts` |
| Struct Definitions & Fields (`.`, `->`) | **Implemented** | `src/interpreter/interpreter.ts`, `types.ts` |
| Dynamic Memory (`malloc`, `calloc`, `realloc`, `free`) | **Implemented** | `src/memory/memory.ts`, `interpreter.ts` |
| Memory Safety (Use-after-free, Double-free) | **Implemented** | `src/memory/memory.ts` |
| Standard I/O (`printf`, `scanf`, `puts`, `putchar`, `getchar`) | **Implemented** | `src/stdlib/stdio.ts`, `interpreter.ts` |
| User-Defined Functions & Recursion | **Implemented** | `src/interpreter/interpreter.ts` |
| Switch / Case / Break / Continue | **Implemented** | `src/interpreter/interpreter.ts` |
| Interactive SVG Pointer View | **Implemented** | `src/components/panels/PointerViewPanel.tsx` |
| Linked List Detection & Heap Connectors | **Implemented** | `src/visualization/detectors/structureDetector.ts` |
| Array-Backed Stack & Queue Visualization | **Implemented** | `src/visualization/detectors/structureDetector.ts`, `VariableArrayViewPanel.tsx` |
| Binary Tree & BST Visualization | **Implemented** | `src/visualization/detectors/treeDetector.ts`, `treeLayout.ts` |
| Pointer-Based Graph Visualization | **Implemented** | `src/visualization/detectors/graphDetector.ts`, `graphLayout.ts` |
| Adjacency Matrix Graph Visualization | **Implemented** | `src/visualization/detectors/graphDetector.ts`, `graphLayout.ts` |
| Graph Edge-Node Clearance Routing | **Implemented** | `src/visualization/layout/graphLayout.ts` |
| 9-Theme Design System | **Implemented** | `src/themes/`, `uiStore.ts` |
| Linked-List Backed Stack / Queue | **Unsupported** | Not implemented (detection is array-backed only) |
| Graph Adjacency Lists | **Planned** | Array of struct pointers (`struct Node *adj[N]`); planned for Phase 7 |
| General String Variables (`char[]`, `char*`) | **Unsupported** | String literals only work in `printf`/`puts` |
| Reverse Stepping ("Step Back") | **Planned** | Button disabled in UI |

---

## 10. Known Issues, Technical Debt & Implementation Gaps

### Technical Debt & Legacy Relics
1. **Unused Legacy Stores:** [`src/state/memoryStore.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/state/memoryStore.ts) is an inert Phase 1 relic. All live memory data is maintained in `executionStore`.
2. **Skeleton Types:** [`src/types/index.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/types/index.ts) contains unused stub types from the Phase 0/1 skeleton.
3. **Modular Visualization Components:** [`src/visualization/components/StructureVisualizationPanel.tsx`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/visualization/components/StructureVisualizationPanel.tsx) is tested in unit tests; the active workbench mounts [`NewVisualizationPanel.tsx`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/components/panels/NewVisualizationPanel.tsx) under the "Visualization" tab in `AppShell.tsx`.

### Implementation Gaps
1. **Strings as Variables:** Variables cannot store strings (`char str[] = "hello"` or `char *s = "text"` are unsupported).
2. **Bit-Level / Overflow Semantics:** All numbers are represented using JavaScript IEEE 754 floating-point numbers. Real 32-bit/64-bit integer overflow and signed integer wrap-around are not simulated.
3. **Advanced C Constructs:** Unions, enums, `typedef`, function pointers, `goto`, and complex standard library functions (`string.h`, `math.h`) are unsupported.
4. **Step Back:** Reverse execution is not implemented.
