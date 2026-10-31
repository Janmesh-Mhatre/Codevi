# Codevi — Feature Status Matrix

This document provides a verified, comprehensive status of all language, runtime, memory, and visualization features in the Codevi repository as of October 2026. Every status is verified directly against the active implementation and test suite.

---

## Status Definitions
- **Implemented:** Fully implemented, active in runtime behavior, and verified with automated tests.
- **Partially Implemented:** Functional in core scenarios but contains documented constraints or edge-case limitations.
- **Experimental / Inactive:** Implemented in codebase or tested in isolation, but not yet wired into the main active user interface.
- **Planned:** Documented on roadmap or typed in interfaces, but no execution logic exists.
- **Unsupported:** Deliberately omitted or currently unsupported; produces a clean error diagnostic.

---

## 1. C Language & Parser Features

| Feature | Status | Notes |
|---|---|---|
| Tree-sitter WASM Parser | **Implemented** | Offline bundled `web-tree-sitter` and `tree-sitter-c`. Normalized line endings (`\r\n` / `\r`). |
| Incremental Reparsing | **Implemented** | Enabled for single-cursor edits via `tree.edit()`; falls back to full parse for multi-edits. |
| Syntax Error Diagnostics | **Implemented** | Non-duplicative ERROR/MISSING node collection; squiggly underlines in Monaco editor. |
| AST Viewer | **Implemented** | Interactive hierarchical tree rendering named syntax nodes with node count and parse time. |
| Preprocessor Directives | **Partially Implemented** | `#include <stdio.h>` and `#define` are parsed as no-op passes. Macro expansion not simulated. |
| Comments | **Implemented** | Line (`//`) and block (`/* */`) comments ignored cleanly during execution. |

---

## 2. Variables, Scope & Data Types

| Feature | Status | Notes |
|---|---|---|
| Primitive Types (`int`, `float`, `double`, `char`) | **Implemented** | Mapped to JavaScript numbers. Arithmetic truncation on integer division and modulo. |
| Type Size Model (`sizeof`) | **Implemented** | Simulated units (`char`=1, `int`/`float`=4, `double`=8, pointers=4). Evaluates types and expressions. |
| Lexical Block Scoping | **Implemented** | `{ ... }` creates nested scopes. Variables disappear when block terminates. |
| Multi-variable Declarations | **Implemented** | `int a = 1, b = 2, *p = NULL;` supported in a single statement. |
| Default Initialization | **Implemented** | Scalars default to `0`; pointers default to `NULL` (safe deterministic defaults). |
| Fixed Bit-Width / Overflow | **Unsupported** | Real C 32/64-bit integer overflow and signed wrap-around are not simulated. |
| Unions & Enums | **Unsupported** | `union` and `enum` are not supported. |
| `typedef` | **Unsupported** | Type aliasing is not supported. |
| General String Variables (`char[]`, `char*`) | **Unsupported** | String literals only work directly as arguments to `printf`/`puts`. Variables cannot hold strings. |

---

## 3. Arrays

| Feature | Status | Notes |
|---|---|---|
| 1D Stack Arrays | **Implemented** | `int arr[5] = {1, 2, 3};` allocates contiguous stack cells sharing base address. |
| 2D Stack Arrays | **Implemented** | `int m[2][3] = {{1,2,3},{4,5,6}};` allocates row-major contiguous stack cells. |
| Partial Array Initialization | **Implemented** | Unspecified trailing slots are zero-initialized. |
| Array Indexing / Subscripting (`arr[i]`, `m[r][c]`) | **Implemented** | Supported for both reading and assignment with out-of-bounds error checking. |
| Array-to-Pointer Decay | **Implemented** | Evaluating an array name yields a pointer to slot 0 with dimension metadata. |
| Address-of Array Elements (`&arr[i]`) | **Implemented** | Yields a pointer with proper slot offset into the array's allocation. |
| Dynamic Heap Arrays | **Implemented** | `malloc(n * sizeof(int))` and `calloc(n, sizeof(int))` allocate multi-slot heap blocks. |

---

## 4. Pointers & Memory Management

| Feature | Status | Notes |
|---|---|---|
| Address-of Operator (`&`) | **Implemented** | Computes simulated `Address` for stack variables and array elements. |
| Dereference Read (`*p`) | **Implemented** | Reads value from target address; null and use-after-free diagnostics. |
| Dereference Write (`*p = val`) | **Implemented** | Writes value to target address; mutates original storage cell. |
| Pointer-to-Pointer (`**pp`) | **Implemented** | Arbitrary pointer chain depth supported and visualized. |
| Pointer Arithmetic (`+`, `-`, `++`, `--`, `+=`, `-=`) | **Implemented** | Bounds-checked across stack arrays and multi-slot heap blocks. |
| Pointer Subtraction (`q - p`) | **Implemented** | Calculates integer element distance; requires pointers to reference the same block/array. |
| Relational Comparisons (`<`, `<=`, `>`, `>=`) | **Implemented** | Defined between pointers within the same allocation or array. |
| Equality Comparisons (`==`, `!=`) | **Implemented** | Compares target addresses or NULL across pointers. |
| Dynamic Allocation (`malloc`, `calloc`, `realloc`) | **Implemented** | Creates heap blocks with slot metadata; 500 active block safety ceiling. |
| Memory Deallocation (`free`) | **Implemented** | Marks block inactive. Detects double-free and freeing invalid addresses. |
| Safe `free(NULL)` | **Implemented** | Handled as safe no-op. |
| Memory Leak Detection | **Implemented** | End-of-program scan warns about unfreed active heap allocations. |

---

## 5. Structs & Linked Data Structures

| Feature | Status | Notes |
|---|---|---|
| Struct Declarations | **Implemented** | Top-level and local `struct Name { ... };` definitions registered in scope. |
| Struct Field Types | **Implemented** | Fields can be primitives, pointers, or nested/self-referential struct pointers. |
| Stack Struct Variables | **Implemented** | `struct Node n;` allocates contiguous stack slots for fields. |
| Heap Struct Allocation | **Implemented** | `malloc(sizeof(struct Node))` infers field count and types. |
| Direct Field Access (`n.field`) | **Implemented** | Resolves field slot offset in struct base address for read/write. |
| Arrow Field Access (`p->field`) | **Implemented** | Dereferences struct pointer and accesses field slot; validates against null/freed memory. |
| Self-Referential Structs (`struct Node *next`) | **Implemented** | Fully supported for linked list implementation. |
| Singly Linked Lists | **Implemented** | Head detection, `next` chain traversal, and heap node visualization. |
| Circular Linked Lists | **Implemented** | Cycle detection prevents infinite visualization loops; renders outer circular loop arc. |
| Doubly Linked Lists | **Partially Implemented** | Struct parsing and routing color for `prev` exist, but traversal heuristic is singly-linked focused. |
| Binary Trees & BSTs | **Implemented** | Identifies trees from `left`/`right` struct pointers; computes depth, size, BST validity, and balance. |
| Pointer-Based Graphs | **Implemented** | Discovers multi-target nodes, shared destinations ($in\text{-}degree \ge 2$), directed cycles, and self-loops. |
| Adjacency Matrix Graphs | **Implemented** | Detects $N \times N$ 2D square arrays with binary/weighted edges and obstacle-avoidance routing. |

---

## 6. Control Flow & Functions

| Feature | Status | Notes |
|---|---|---|
| If / Else Branches | **Implemented** | Condition evaluated for truthiness; alternate branches executed correctly. |
| While Loops | **Implemented** | Pre-tested loops with `break` and `continue` support. |
| Do-While Loops | **Implemented** | Post-tested loops (`do { ... } while (...);`). |
| For Loops | **Implemented** | Supports declaration or expression in initializer, condition, and update expressions. |
| Switch / Case / Default | **Implemented** | Supports integer cases, fallthrough across cases, duplicate case detection, and `break;`. |
| Break & Continue | **Implemented** | Handled via internal control-flow signals across loops and switches. |
| User-Defined Functions | **Implemented** | Functions declared at file scope, evaluated with fresh scopes and parameter bindings. |
| Function Recursion | **Implemented** | Supported with `MAX_CALL_DEPTH = 200` recursion guard. |
| Pass-by-Value & Pass-by-Pointer | **Implemented** | Pointer parameters enable callee to mutate caller variables via dereferencing. |
| Function Pointers | **Unsupported** | Function pointers are not supported. |
| `goto` Statements | **Unsupported** | `goto` and label statements are not supported. |

---

## 7. Standard I/O

| Feature | Status | Notes |
|---|---|---|
| `printf` Basic Output | **Implemented** | Emulates output formatting to ConsolePanel buffer. |
| Format Specifiers (`%d`, `%i`, `%c`, `%s`, `%f`, `%ld`) | **Implemented** | Accurate representation of integers, floats, characters, strings, and pointer differences. |
| Simulated Pointer Format (`%p`) | **Implemented** | Distinguishes pointer target (`p` -> `S001`) from pointer's own address (`&p` -> `S002`). |
| Interactive `scanf` Input | **Implemented** | Generator suspends on `input-request` until user submits valid typed input in Console. |
| `puts` | **Implemented** | Outputs string followed by newline. |
| `putchar` | **Implemented** | Outputs individual character. |
| Interactive `getchar` | **Implemented** | Pauses execution for single character input. |

---

## 8. Visualization Subsystems

| Feature | Status | Notes |
|---|---|---|
| Variable Table (`VariablePanel`) | **Implemented** | Scope-aware variables with simulated address badges (`@S001`). |
| Call Stack Panel (`StackPanel`) | **Implemented** | Frame cards showing function name, call depth, line number, parameters, and locals. |
| Memory Grid Panel (`MemoryPanel`) | **Implemented** | Complete map of stack and heap cells with pointer chain resolution (`pp → p → x`). |
| Variable & Array View Panel | **Implemented** | Dedicated interactive panel for scalars, 1D arrays, 2D arrays, stacks, and queues. |
| Active Index Tracking on Arrays | **Implemented** | Detects variables (`i`, `j`, `p`) referencing array elements and renders pointer badges (`i ▾`). |
| Array Read/Write Highlighting | **Implemented** | Highlights cells accessed during the current execution step. |
| Array-Backed Stack ADT | **Implemented** | Heuristic detects array + `top` variable; renders visual stack with Top marker. |
| Array-Backed Queue ADT | **Implemented** | Heuristic detects array + `front`/`rear` (or `head`/`tail`); renders Front/Rear markers. |
| Linked-List-Backed Stack / Queue | **Unsupported** | Stack and queue detection is strictly array-backed. |
| Interactive SVG Pointer View | **Implemented** | Bipartite stack/heap columns, centered NULL node, animated directional arrows. |
| Outward Stack-to-Stack Connector Routing | **Implemented** | Tiered cubic bezier loops avoiding card collision. |
| Heap-to-Heap Connector Routing | **Implemented** | Adjacent links, reverse links, and circular closing loops for linked lists. |
| Heap Block Traversal Ordering | **Implemented** | Orders heap blocks based on `next` pointer traversal rather than allocation ID. |
| Pointer Detail Sidebar | **Implemented** | Card and arrow click inspection showing address, region, target, chain depth, and status. |
| Unified Visualization Panel | **Implemented** | `NewVisualizationPanel` with Top-Right tabs (AST, Declarations, Visualization) unifying memory, arrays, trees, and graphs. |
| Binary Search Trees & BSTs | **Implemented** | Deterministic Reingold-Tilford hierarchical layout with left/right child branch routing and metrics badges. |
| Pointer-Based Graphs | **Implemented** | Layered collision-free layout, cycle outer perimeter back-edges, self-loops, and component separation. |
| Adjacency Matrix Graphs | **Implemented** | Normalizes 2D square arrays into `GraphModel`; targeted obstacle clearance keeps cross-edges $\ge 20$–$26\text{px}$ clear. |
| Graph Adjacency Lists | **Planned** | Array of struct pointers (`struct Node *adj[N]`); planned for Phase 7. |

---

## 9. UI, Themes & Testing

| Feature | Status | Notes |
|---|---|---|
| Workbench Layout & Resizing | **Implemented** | Resizable splitters between Editor, Tabs, Bottom panels, and Console. |
| Monaco Editor Integration | **Implemented** | Offline web worker, caret remeasurement, syntax diagnostics, execution line highlight. |
| Curated 9-Theme System | **Implemented** | 9 themes with `localStorage` persistence and dynamic Monaco editor theme synchronization. |
| Automated Unit Testing | **Implemented** | **45 test files, 500 tests — 100% passing.** |
| Browser-Only Architecture | **Active** | Pure React + TypeScript browser runtime; obsolete desktop packaging removed. |
| Reverse Stepping ("Step Back") | **Planned** | Toolbar button disabled with placeholder message. |
