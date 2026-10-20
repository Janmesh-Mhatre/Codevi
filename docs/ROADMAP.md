# Codevi Roadmap

## Development Strategy

- Build phase by phase.
- Each phase must be stable and verified before continuing.
- Do not recreate the project; extend existing systems.
- Work on the existing repository only.
- Browser-first development.
- Codevi is a pure browser-based React + TypeScript web application (no native desktop runtime or Tauri wrapper).

## Phases & Progress

0.  [x] **Architecture & Planning** — Blueprint, phase strategy, governance.
1.  [x] **Project Foundation** — React 19, TypeScript, Tailwind CSS v4, Monaco Editor, workbench layout.
2.  [x] **Parser Integration** — Tree-sitter WASM (`web-tree-sitter` + `tree-sitter-c`), AST Viewer, syntax diagnostics.
3.  [x] **Execution Engine** — Generator-based C interpreter, Run / Pause / Step Forward / Reset controls, user-defined functions, recursion, switch/case/break/continue.
4.  [x] **Memory, Variables & Stack Visualization** — Call stack frames, active scope inspection, execution change highlighting.
    - [x] **Phase 4.1 Basic C stdio** — `printf`, `scanf` (interactive pause), `puts`, `putchar`, `getchar`.
5.  [x] **Pointers & Dynamic Memory** — `&`, `*`, `**`, `malloc`/`calloc`/`realloc`/`free`, simulated address space (`S001`, `H001`), safety errors (double-free, use-after-free).
6.  [x] **Pointer Visualization & Comprehensive Memory Model**
    - [x] **Phase 6.0 Core Pointer View** — Interactive SVG graph, outward stack-to-stack connector loops, `%p` location vs target address distinction, pointer arithmetic/subtraction, 9-theme design system.
    - [x] **Phase 6.1 Array Visualization** — 1D and 2D stack arrays, active index tracking (`i ▾`), boundary cues, per-step read/write access highlighting.
    - [x] **Phase 6.2 Linked List Support** — Struct definitions, field access (`.`, `->`), heap-to-heap SVG connectors, linked-list traversal ordering, circular list cycle detection.
    - [x] **Phase 6.3 Stack & Queue Visualization** — Array-backed Stack (`top` indicator) and Queue (`front`/`rear` indicators) visualization in `VariableArrayViewPanel`.
7.  [ ] **Advanced Data Structures**
    - [x] Singly Linked Lists (completed in Phase 6.2)
    - [x] Circular Linked Lists (completed in Phase 6.2)
    - [x] Array-Backed Stacks & Queues (completed in Phase 6.3)
    - [ ] Binary Search Trees (planned)
    - [ ] Graphs & Adjacency Structures (planned)
    - [ ] Doubly Linked Lists (in progress)
8.  [ ] **Algorithm Visualization** (Sorting, searching, step-by-step partition/merge)
9.  [ ] **Explanation Engine** (Dynamic step explanations, complexity hints)
10. [ ] **Debugging Tools** (Breakpoints, watch expressions, Step Back / reverse execution)
11. [ ] **AI Integration** (Optional assistance layer)
12. [ ] **Multi-language Support**
13. [ ] **Optimization & Final Desktop Release**
