# Phase 6 — Pointer Visualization, Data Structures & Comprehensive Memory Model

Interactive SVG Pointer View ("what points to what"), stack-to-stack connector routing, pointer variable locations displayed through `printf("%p")` and UI panels, pointer-to-pointer chains, array initialization with element-level pointer arithmetic, 2D arrays, linked lists with heap-to-heap routing, array-backed stacks and queues, and the 9-theme design system.

Read alongside [`docs/phases/PHASE_4_VISUALIZATION.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/phases/PHASE_4_VISUALIZATION.md) and [`docs/phases/PHASE_5_POINTERS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/phases/PHASE_5_POINTERS.md).

---

## 1. Architectural Highlights

### Derived, Zero-Duplicate Visualization State
The Pointer View is not an independent state machine. In [`src/execution/engine/ExecutionEngine.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/execution/engine/ExecutionEngine.ts), each execution step computes `pointerView: PointerViewData` directly from the active `callStack` frames and `heap` blocks.

```text
ExecutionStep
  ├── callStack: StackFrame[]  (parameters, locals, addresses: Record<string, Address>)
  ├── heap: HeapBlock[]        (active & freed allocations, slot values)
  └── pointerView: PointerViewData
        ├── relationships: PointerRelationship[]
        │     ├── pointerName: string
        │     ├── pointerAddress: Address
        │     ├── targetAddress: Address | null
        │     ├── targetName: string | null
        │     ├── targetRegion: "stack" | "heap" | "none"
        │     ├── status: "valid" | "null" | "freed" | "invalid"
        │     └── chainDepth: number
        ├── stackVariables: PointerViewVariable[]
        └── heapBlocks: HeapBlock[]
```

### Pointer Variable Locations & `%p` Specifier
In C, a pointer variable `int *p = &x;` has two distinct addresses associated with it:
1. **Target Address (`p`)**: The address of the variable it points to (`x`'s address, e.g. `S001`).
2. **Variable Location (`&p`)**: The address of the stack cell where `p` itself is stored (e.g. `S002`).

Codevi maintains this educational simulated address model end-to-end:
- `printf("%p\n", p)` prints `S001` (the stored target address).
- `printf("%p\n", &p)` prints `S002` (the pointer's own address).
- Pointer-to-pointer (`int **pp = &p`): `printf("%p\n", pp)` prints `S002`, and `printf("%p\n", *pp)` prints `S001`.
- Simulated addresses are displayed consistently across the application:
  - **Variables Panel**: Displays `@S001` and `→ S001 (x) @S002` in the Value column.
  - **Pointer View Panel**: Displays `@S001` and `@S002` badges on the cards, with a detailed sidebar showing the address on click.
  - **Memory Panel**: Lists `S001`, `S002`, `H001` with pointer chain resolution (`pp → p → x`).

---

## 2. Interactive SVG Pointer Graph & Connector Routing

Located in [`src/components/panels/PointerViewPanel.tsx`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/components/panels/PointerViewPanel.tsx):
- **Layout**: Two primary columns (`STACK` on left, `HEAP` on right) with a designated `NULL` target node centered at the bottom.
- **Stack-to-Stack Connectors**: Pointers pointing to other stack variables use tiered outward cubic bezier loops that curve into the inter-column gap and approach the target card from the right:
  $$\text{offset} = 45 + \text{idx} \times 30 + \min(50, |\Delta y| \times 0.2)$$
  $$\text{path} = C\ (x_1 + \text{offset},\ y_1),\ (x_2 + \text{offset},\ y_2),\ (x_2,\ y_2)$$
  This guarantees arrows never cut through intervening card bodies.
- **Stack-to-Heap Connectors**: Smooth horizontal bezier curves connecting stack pointer cards to allocated heap blocks.
- **Heap-to-Heap Connectors (Phase 6.2)**: Adjacent vertical beziers connecting consecutive struct nodes, reverse links, and wide outer circular closing loops for circular linked lists.
- **Heap Block Traversal Ordering**: Re-orders heap blocks according to actual linked-list `next` traversal, grouping active nodes before freed blocks.
- **Visual Status**: Color-coded markers and animated stroke dashes for `valid` (accent), `null` (muted dash), `freed` (danger dash), and `invalid`.

---

## 3. Phase 6.1 — Array Visualization & Active Index Tracking

1. **1D & 2D Stack Arrays**:
   - `int arr[5] = {10, 20, 30};` and `int matrix[2][3] = {{1,2,3},{4,5,6}};` allocate contiguous slots in `MemoryModel`.
   - Dedicated `VariableArrayViewPanel` renders 1D arrays as indexed boxes and 2D arrays as row/column matrices.
2. **Active Index Tracking**:
   - Inspects active frame variables and marks array elements with pointer and index tags (`i ▾`, `p ➔`).
3. **Boundary Cues**:
   - Labels boundary slots (`start`, `end`, `out-of-bounds`) to aid students learning bounds safety.
4. **Step-Level Access Highlighting**:
   - Per-step memory telemetry highlights read (blue) and written (amber/green) array slots during execution.

---

## 4. Phase 6.2 — Linked List Support & Structs

1. **Struct Type System**:
   - Supports struct definitions at top-level or inside functions (`struct Node { int data; struct Node *next; };`).
   - Supports stack variables (`struct Node n;`), heap allocations (`malloc(sizeof(struct Node))`), direct access (`n.data`), and pointer arrow access (`head->next`).
2. **Linked List Detection**:
   - Heuristics detect head pointers and traverse self-referential struct chains.
   - Cycle detection prevents infinite loops in circular linked lists and marks circular loop links.
3. **SVG Connector Routing**:
   - `routeAdjacentHeap()`: Direct smooth vertical curves between consecutive heap nodes.
   - `routeCircularClosing()`: Wide outward loop connecting tail node back to head node.
   - Dedicated field color coding: `next` links use accent color; `prev` links use purple.

---

## 5. Phase 6.3 — Stack & Queue Visualization

1. **Array-Backed Detection**:
   - Heuristically recognizes array-backed Stacks when an array co-exists with a `top` integer variable.
   - Heuristically recognizes array-backed Queues when an array co-exists with `front` and `rear` (or `head` and `tail`) integer variables.
2. **Visual Indicators**:
   - `VariableArrayViewPanel` renders specialized cards highlighting `Top` for stacks and `Front`/`Rear` for queues.
   - Slot tags display active ADT markers (`top ▾`, `front ▾`, `rear ▾`).
   *(Note: Stack and Queue detection is strictly array-backed; linked-list ADT detection is unsupported).*

---

## 6. Theme System Redesign

The legacy binary light/dark mode switch was replaced with a curated 9-theme dropdown system in [`src/state/uiStore.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/state/uiStore.ts):
1. Dark Modern
2. Light Modern
3. One Dark Pro
4. GitHub Dark
5. Tokyo Night
6. Catppuccin Mocha
7. Dracula
8. Nord
9. Ayu Mirage

Features:
- CSS custom variables dynamically applied via `data-theme` attribute on `document.documentElement`.
- Seamless Monaco Editor theme synchronization without re-instantiating editor instances.
- Fully persisted in `localStorage`.

---

## 7. Automated Verification

- **Total Tests**: **365 tests across 31 test files** (100% passing).
- Key test suites:
  - [`tests/unit/memory/phase6Pointers.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/memory/phase6Pointers.test.ts): 19 tests for address-of, dereferencing, pointer-to-pointer, NULL, function parameters, and pointer arithmetic.
  - [`tests/unit/memory/phase6Arrays.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/memory/phase6Arrays.test.ts) & [`phase62DArrays.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/memory/phase62DArrays.test.ts): 23 tests for 1D and 2D arrays, indexing, and bounds checks.
  - [`tests/unit/interpreter/linkedList.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/interpreter/linkedList.test.ts) & [`tests/unit/visualization/linkedListVisualization.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/visualization/linkedListVisualization.test.ts): 11 tests verifying struct field resolution and linked-list graph extraction.
  - [`tests/unit/visualization/stackQueueVisualization.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/visualization/stackQueueVisualization.test.ts): 9 tests for array-backed stack and queue detection.
  - [`tests/unit/ui/pointerViewOrdering.test.tsx`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/ui/pointerViewOrdering.test.tsx) & [`pointerViewLinkedList.test.tsx`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/ui/pointerViewLinkedList.test.tsx): 13 tests for SVG connector paths and heap ordering.
  - [`tests/unit/ui/themeSystem.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/ui/themeSystem.test.ts): 19 tests for the 9-theme design system.
