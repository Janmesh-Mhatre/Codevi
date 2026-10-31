# Codevi Architecture

Codevi is structured into decoupled, unidirectional architectural layers designed to ensure that execution, memory simulation, and visualization can run deterministically in client-side WebAssembly and JavaScript without server dependencies.

---

## 1. System Layers

```
┌─────────────────────────────────────────────────────────┐
│                       1. UI Layer                       │
│  - AppShell Workbench with Resizable Splitters          │
│  - Curated 9-Theme Design System (LocalStorage sync)    │
│  - Toolbar (Run, Pause, Step Forward, Reset)            │
│  - Console Panel (Stdout, Stdio prompt, Diagnostics)    │
│  - Explanation Bar (Per-step educational narration)     │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  2. Monaco Code Editor                  │
│  - Offline Monaco Editor Integration (?worker)          │
│  - Debounced Text Change Stream (120ms)                 │
│  - Inline Syntax Diagnostic Markers                     │
│  - Execution Read-Only Locking & Line Highlight Decor   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  3. Parser Subsystem                    │
│  - web-tree-sitter WASM Engine (Offline bundled)        │
│  - tree-sitter-c C Grammar WASM                         │
│  - Incremental Reparsing with CRLF/LF Normalization     │
│  - Serializable AstNode Tree & SyntaxDiagnostic Collec  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                4. Interpreter Subsystem                 │
│  - In-Browser Generator-Based C AST Interpreter         │
│  - Lexical Scope Hierarchy (Block scoping)              │
│  - Value System: Scalars, Pointers, Arrays, Structs     │
│  - Control Flow: If/Else, Loops, Switch/Case, Functions │
│  - Stdio & Dynamic Memory Emulation (malloc/free)       │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│             5. Simulated Memory Engine                  │
│  - Deterministic Address Space (S001, H001[slot])       │
│  - Unified Address-to-Cell Storage Registry             │
│  - Memory Event Telemetry (Reads, Writes, Allocations)  │
│  - Memory Safety Diagnostics (Use-after-free, Double)   │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                6. Execution Engine                      │
│  - Execution State Machine (Idle, Running, Paused)      │
│  - Time-Sliced Stepping Budget (12ms / 60 FPS)          │
│  - Infinite Loop Step Ceiling (200k steps)              │
│  - Plain Serializable Snapshot Conversion               │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│               7. Visualization Engine                   │
│  - Detectors: Arrays, Linked Lists, ADTs, Trees, Graphs │
│  - Layouts: Reingold-Tilford (Trees), Layered (Graphs)  │
│  - SVG Routing: Obstacle Clearance, Tiered Beziers, Loops│
│  - Unified Workspace: NewVisualizationPanel             │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles

1. **Unidirectional Data Flow:**
   The UI never drives the interpreter directly. Instead, UI interactions trigger actions on the `ExecutionEngine`, which advances the generator, captures state, derives visualization models, and atomically updates the Zustand store.
2. **Decoupled Engine Core:**
   The parser, interpreter, memory model, and execution engine have zero dependencies on React or Monaco. They produce plain, serializable TypeScript interfaces (`ExecutionStep`, `StackFrame`, `HeapBlock`).
3. **Deterministic Simulated Memory:**
   Hardware memory addresses and byte layouts are not simulated. Instead, Codevi uses deterministic, prefixed symbolic addresses (`S001`, `S002` for stack cells; `H001`, `H002` for heap blocks) with indexed slots (`S001[0]`, `H001[1]`).
4. **Offline by Default:**
   All third-party assets—including Tree-sitter WASM runtimes, Monaco editor workers, and IBM Plex fonts—are bundled locally through Vite, allowing complete offline execution.
5. **Phase-by-Phase Extensibility:**
   Visualizers for new data structures (trees, graphs) hook into the unified `StructureGraph` data model without altering the underlying interpreter or memory engine.

---

## 3. Related Documentation

- [`docs/PROJECT_ANALYSIS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/PROJECT_ANALYSIS.md) — Exhaustive technical analysis of all subsystems.
- [`docs/FEATURE_STATUS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/FEATURE_STATUS.md) — Comprehensive feature implementation matrix.
- [`docs/ROADMAP.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/ROADMAP.md) — Multi-phase project development roadmap.
