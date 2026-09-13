# Phase 6 — Pointer Visualization & Comprehensive Memory Model

Interactive SVG Pointer View ("what points to what"), stack-to-stack connector routing, pointer variable locations displayed through `printf("%p")` and UI panels, pointer-to-pointer chains, array initialization with element-level pointer arithmetic and pointer difference (`q - p`), editor caret alignment, and the 9-theme design system.

Read alongside [`docs/phases/PHASE_4_VISUALIZATION.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/phases/PHASE_4_VISUALIZATION.md) and [`docs/phases/PHASE_5_POINTERS.md`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/docs/phases/PHASE_5_POINTERS.md).

---

## 1. Architectural Highlights

### Derived, Zero-Duplicate Visualization State
The Pointer View is not an independent state machine. In [`src/execution/engine/ExecutionEngine.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/src/execution/engine/ExecutionEngine.ts), each execution step computes `pointerView: PointerViewData` directly from the active `callStack` frames and `heap` blocks.

```
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
- **Layout**: Two primary columns (`STACK` on left, `HEAP` on right) with a designated `NULL` target node.
- **Stack-to-Stack Connectors**: Pointers pointing to other stack variables use tiered outward cubic bezier loops that curve into the inter-column gap and approach the target card from the right:
  $$\text{offset} = 45 + \text{idx} \times 30 + \min(50, |\Delta y| \times 0.2)$$
  $$\text{path} = C\ (x_1 + \text{offset},\ y_1),\ (x_2 + \text{offset},\ y_2),\ (x_2,\ y_2)$$
  This guarantees arrows never cut through intervening card bodies.
- **Stack-to-Heap Connectors**: Smooth horizontal bezier curves connecting stack pointer cards to allocated heap blocks.
- **Visual Status**: Color-coded markers and animated stroke dashes for `valid` (accent), `null` (muted dash), `freed` (danger dash), and `invalid`.

---

## 3. Array Handling & Pointer Arithmetic

1. **Array Initialization & Inspection**:
   - `ExecutionEngine.ts` populates slot values using `memory.stackArraySlotValues(...)`.
   - Variables panel and Memory panel display individual slots `[0]=10, [1]=20, [2]=30` rather than empty placeholders.
2. **Address-of Array Element**:
   - `&arr[i]` produces a `CPointerValue` referencing `arr`'s address with slot offset `i` (`S001[i]`).
3. **Pointer Arithmetic**:
   - `p++`, `p--`, `p += n`, `p -= n` move pointers across array elements or heap slots with full bounds validation.
4. **Pointer Subtraction (`q - p`)**:
   - Supported when both pointers reference the same array or heap allocation block:
     $$\Delta = \text{slot}(q) - \text{slot}(p)$$
   - Output formatted with `%ld` printf specifier.

---

## 4. Theme System Redesign

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
- CSS custom variables dynamically applied via data-theme attribute on `document.documentElement`.
- Seamless Monaco Editor theme synchronization without re-instantiating editor instances.
- Fully persisted in `localStorage`.

---

## 5. Automated Verification

- **Total Tests**: **206 tests across 17 test files** (all passing).
- Key test suites:
  - [`tests/unit/memory/phase6Pointers.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/memory/phase6Pointers.test.ts): 19 tests for address-of, dereferencing, pointer-to-pointer, NULL, function parameters, and pointer arithmetic.
  - [`tests/unit/memory/phase6Arrays.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/memory/phase6Arrays.test.ts): 12 tests for array initialization, slot indexing, element address-of, and subtraction.
  - [`tests/unit/memory/phase6PointerLocations.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/memory/phase6PointerLocations.test.ts): 5 tests validating `%p` with `p` vs `&p`, heap pointers, array elements, and pointer-to-pointer consistency.
  - [`tests/unit/stdlib/stdio.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/stdlib/stdio.test.ts): `%p`, `%ld`, formatting and validation.
  - [`tests/unit/ui/themeSystem.test.ts`](file:///c:/Users/Janmesh%20Mhatre/Desktop/Programmes/Projects/Codevi/tests/unit/ui/themeSystem.test.ts): Theme selector, state transitions, persistence.
