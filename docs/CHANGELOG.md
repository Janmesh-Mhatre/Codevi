# Changelog

## Phase 0 — Architecture & Planning
- Architecture planned and 14-phase development blueprint created.

## Phase 1 — Project Foundation
- Tauri + React 19 + TypeScript + Tailwind CSS project structure.
- Monaco Editor integrated with offline configuration and smart edit helpers.
- Workbench layout with resizable splitters.
- Base Zustand stores initialized.

## Phase 2 — Parser Integration
- Tree-sitter WASM (`web-tree-sitter` and `tree-sitter-c`) bundled locally.
- Serialized AST generation (`AstNode`).
- Incremental reparsing and syntax diagnostics collection.
- Interactive AST Viewer panel.

## Phase 3 — Execution Engine
- In-browser generator-based C interpreter (`interpreter.ts`).
- Run / Pause / Step Forward / Reset execution controls.
- Variable scope management (`scope.ts`).
- Control flow: `if`/`else`, `while`, `do..while`, `for`, `switch`/`case`/`default`, `break`, `continue`, `return`.
- User-defined functions, recursion (up to depth 200), and parameter passing.

## Phase 4 & 4.1 — Visualization & Standard I/O
- Call stack tracking and frame visualization (`StackPanel`).
- Active frame local and parameter variable inspection (`VariablePanel`).
- Execution change highlighting (`useChangedKeys`).
- Standard I/O support (`stdio.ts`): `printf`, `scanf`, `puts`, `putchar`, `getchar`.
- Format specifiers: `%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`.
- Interactive console input requests that pause generator execution.

## Phase 5 — Pointers & Dynamic Memory
- Simulated deterministic address space model (`S001`, `H001`).
- Pointer semantics: `&` (address-of), `*` (dereference read/write), pointer-to-pointer (`**pp`).
- Dynamic memory management: `malloc`, `calloc`, `realloc`, `free` (including safe `free(NULL)`).
- Memory safety diagnostics: use-after-free and double-free detection.
- `sizeof` evaluation for basic types and expressions.

## Phase 6 — Pointer Visualization & Memory Graph
- Interactive SVG Pointer View ("what points to what") with directional animated arrows.
- Outward curved stack-to-stack connector routing avoiding card collisions.
- Pointer variable locations displayed through `printf("%p")` and UI badges (`@S001`, `@S002`).
- Pointer difference subtraction (`q - p`) with `%ld`.
- 9-theme design system selector with Monaco Editor synchronization.

## Phase 6.1 — Array Visualization & Active Index Tracking
- 1D and 2D stack arrays with row/column layout.
- Active index tracking annotating array slots with pointer and index variable cues (`i ▾`, `p ➔`).
- Array boundary cues (`start`, `end`, `out-of-bounds`).
- Real-time step access highlighting for array reads and writes.

## Phase 6.2 — Linked List Support & Structs
- Struct type system: definitions, stack allocation, heap allocation (`malloc(sizeof(struct ...))`), field access (`.` and `->`).
- Linked list detection: head-pointer recognition, `next` traversal, cycle detection for circular lists.
- Pointer View enhancements: heap block ordering by linked-list traversal, heap-to-heap SVG connectors (adjacent, reverse, circular closing routes).

## Phase 6.3 — Stack & Queue Visualization
- Array-backed Stack detection (`top` variable) and visualization with Top indicator.
- Array-backed Queue detection (`front`/`rear` or `head`/`tail`) with Front and Rear indicators.
- Dedicated `VariableArrayViewPanel` displaying scalars, 1D arrays, 2D arrays, stacks, and queues.

---
**Current Test Suite:** 31 test files, 365 tests passing cleanly (100% pass rate).
