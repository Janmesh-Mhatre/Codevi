# Codevi

*(formerly "Code Visualizer" — renamed during Phase 2; see
`docs/PHASE_0_ARCHITECTURE.md` for the original Phase 0 planning under
the old name)*

An educational, browser-based tool for visualizing how C programs
execute — built with React, TypeScript, and Rust/Tauri (currently run as
a browser app; native packaging is postponed). See
`docs/PHASE_0_ARCHITECTURE.md` for the original blueprint,
`docs/phases/PHASE_2_PARSER.md` for the parser, `docs/phases/PHASE_3_EXECUTION.md` for
the execution engine, `docs/phases/PHASE_4_VISUALIZATION.md` for the Variables/
Stack/Memory panels, `docs/phases/PHASE_4_1_STDIO.md` for I/O,
`docs/phases/PHASE_5_POINTERS.md` for pointers and dynamic memory, and
`docs/phases/PHASE_6_POINTER_VISUALIZATION.md` for pointer visualization and the memory graph.

**Status: Phase 6 — Pointer Visualization & Comprehensive Memory Model.**
Interactive SVG **Pointer View** ("what points to what"), stack-to-stack
curved connector routing, simulated pointer variable location display through
`printf("%p")` and UI panels, pointer-to-pointer chain depth, array initialization
with element address-of (`&arr[i]`), pointer arithmetic, pointer difference (`q - p`),
and a 9-theme design system.

---

## Setup instructions

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later, and npm

Browser-based by design — native/Tauri packaging is explicitly postponed
project-wide.

### Run it (browser)

```bash
npm install
npm run dev
```

Open the printed `localhost` URL (default `http://localhost:1420`). Try:

```c
#include <stdio.h>

int main(void) {
    int x = 25;
    int *p = &x;
    printf("x = %d, &x = %p\n", x, &x);
    printf("p = %p, &p = %p, *p = %d\n", p, &p, *p);
    return 0;
}
```

Step through it or click **Run**:
- **Pointer View** renders animated directional arrows connecting `p` on the STACK to `x`, along with simulated addresses `@S001` and `@S002`.
- **Console** prints `x = 25, &x = S001` and `p = S001, &p = S002, *p = 25`.
- **Variables Panel** displays `x` with `@S001` and `p` with `→ S001 (x) @S002`.
- **Memory Panel** shows stack cells `S001` and `S002` with pointer chain resolution.

### Run the tests

```bash
npm test
```

**206 unit tests** (Vitest across 17 test suites, 0 failures):
- 67 cases from Phases 3, 4, 4.1
- 29 cases from Phase 5 (pointers, dynamic memory, safety errors)
- 110 cases for Phase 6 (pointer view, array indexing, pointer arithmetic/subtraction, `%p` location distinction, and theme system)

### Run it as a desktop window (optional, needs Rust)

```bash
npm run tauri dev
```

---

## What's implemented

### Phase 6 — Pointer Visualization & Memory Graph

| Area | Status |
|---|---|
| Interactive SVG Pointer View tab showing "what points to what" | done |
| Outward tiered stack-to-stack connector routing avoiding card collision | done |
| Stack-to-heap animated bezier connector routing | done |
| Pointer variable locations displayed via `printf("%p")` (`p` target vs `&p` own address) | done |
| Simulated address badges (`@S001`, `@S002`) in Variables panel and Pointer cards | done |
| Pointer detail sidebar with address, target, region, status, and chain depth | done |
| Array initialization slot values displayed in Variables and Memory panels | done |
| Address-of array element (`&arr[i]`) with slot offsets | done |
| Pointer arithmetic (`++`, `--`, `+=`, `-=`) across array elements and heap slots | done |
| Pointer difference subtraction (`q - p`) with `%ld` printf specifier | done |
| 9-theme design system selector with Monaco Editor theme synchronization | done |
| Editor caret remeasurement on font load and layout resize | done |
| 206 automated unit tests across 17 test suites | done |
| `docs/phases/PHASE_6_POINTER_VISUALIZATION.md` | done |

### Phase 5 — Pointers & Dynamic Memory

| Area | Status |
|---|---|
| `&` (address-of) and `*` (dereference read/write) | done |
| Pointer-to-pointer, to arbitrary depth | done |
| NULL pointer defaults, comparisons, and safety diagnostics | done |
| `malloc`, `calloc`, `realloc`, `free` (including safe `free(NULL)`) | done |
| Use-after-free and double-free runtime error detection | done |
| `sizeof(TYPE)` and `sizeof(variable)` | done |
| Simulated address space model (`S001`, `H001`) | done |

### Phase 4.1 — Basic C Standard I/O

| Area | Status |
|---|---|
| `printf`/`scanf`/`puts`/`putchar`/`getchar` with real interactive input pausing | done |
| Format specifiers: `%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld` | done |

### Phase 4 — Memory, Variables & Stack Visualization

| Area | Status |
|---|---|
| Variables, Memory, and Stack panels, scope-correct and synchronized with execution | done |

### Phase 3 — Execution Engine

| Area | Status |
|---|---|
| In-browser generator-based C interpreter; Run/Pause/Step Forward/Reset | done |

### Phase 2 — Parser Integration

| Area | Status |
|---|---|
| Tree-sitter (WASM, fully offline); AST Viewer; syntax diagnostics | done |

### Phase 1 — Project Foundation

| Area | Status |
|---|---|
| Tauri + React + TypeScript + Tailwind project, workbench layout, theme system | done |

---

## Folder structure

```
codevi/
├── src/
│   ├── components/
│   │   ├── common/              # PanelShell, Tabs, ErrorDialog, Toast
│   │   ├── editor/              # CodeEditor (Monaco, font remeasurement, caret sync)
│   │   ├── layout/              # AppShell, Toolbar (Theme Selector dropdown)
│   │   └── panels/
│   │       ├── AstViewerPanel.tsx
│   │       ├── ConsolePanel.tsx
│   │       ├── ExplanationPanel.tsx
│   │       ├── MemoryPanel.tsx        # Simulated stack/heap addresses, pointer chains
│   │       ├── PointerViewPanel.tsx   # Interactive SVG pointer graph & connectors
│   │       ├── StackPanel.tsx
│   │       └── VariablePanel.tsx      # Variables, pointer targets, addresses, arrays
│   ├── execution/
│   │   ├── engine/ExecutionEngine.ts  # Generates steps, heap, pointerView data
│   │   ├── models/executionTypes.ts   # ExecutionStep, PointerViewData, StackFrame
│   │   └── utils/                     # formatValue, changed keys detection
│   ├── interpreter/
│   │   ├── interpreter.ts       # AST interpreter, pointer arithmetic, subtraction
│   │   ├── memory.ts            # MemoryModel: stack & heap cells, simulated addresses
│   │   ├── scope.ts             # Address bindings
│   │   └── values.ts            # CValue: CScalarValue | CPointerValue | CArrayValue
│   ├── parser/
│   │   ├── astConvert.ts
│   │   └── parserService.ts     # Tree-sitter WASM parser
│   ├── state/
│   │   ├── executionStore.ts
│   │   ├── parserStore.ts
│   │   └── uiStore.ts           # Layout dimensions, panel visibility, 9-theme system
│   └── stdlib/
│       └── stdio.ts             # printf (%p, %ld), scanf, getchar
├── tests/
│   └── unit/
│       ├── execution/           # callStack, executionEngineStdio
│       ├── interpreter/         # interpreter core tests
│       ├── memory/              # phase6Pointers, phase6Arrays, phase6PointerLocations
│       ├── stdlib/              # stdio, stdioInterpreter
│       └── ui/                  # uiStore, themeSystem
├── docs/
│   ├── PHASE_0_ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── CHANGELOG.md
│   └── phases/
│       ├── PHASE_2_PARSER.md
│       ├── PHASE_3_EXECUTION.md
│       ├── PHASE_4_VISUALIZATION.md
│       ├── PHASE_4_1_STDIO.md
│       ├── PHASE_5_POINTERS.md
│       └── PHASE_6_POINTER_VISUALIZATION.md
├── vitest.config.ts
└── package.json
```

---

## Validation notes

- `npm test`: **17 test files, 206 tests passing** (0 failures).
- `npm run build` (`tsc && vite build`): builds client environment cleanly with 0 errors.
- Caret alignment verified across Monaco editor fonts and layout resizing.
- Visual connector routing and pointer location display verified across pointer, array, heap, and pointer-to-pointer scenarios.

---

## Future extension points

| Phase | Description | Reference |
|---|---|---|
| Phase 7 | Data Structure Visualization (Linked lists, binary search trees, graphs) | `docs/ROADMAP.md` |
| Phase 8 | Algorithm Visualization (Sorting algorithms, step-by-step partition/merge) | `docs/ROADMAP.md` |
| Phase 9 | Explanation Engine (Dynamic step explanations, complexity hints) | `docs/ROADMAP.md` |
| Phase 10 | Debugging Tools (Breakpoints, watch expressions, step out) | `docs/ROADMAP.md` |
