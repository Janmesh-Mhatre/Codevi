# Codevi

*(formerly "Code Visualizer" — renamed during Phase 2; see
`docs/PHASE_0_ARCHITECTURE.md` for the original Phase 0 planning under
the old name)*

An educational, browser-based tool for visualizing how C programs
execute — built with React, TypeScript, and Rust/Tauri (currently run as
a browser app; native packaging is postponed). See
`docs/PHASE_0_ARCHITECTURE.md` for the original blueprint,
`docs/PHASE_2_PARSER.md` for the parser, `docs/PHASE_3_EXECUTION.md` for
the execution engine, `docs/PHASE_4_VISUALIZATION.md` for the Variables/
Stack/Memory panels, `docs/PHASE_4_1_STDIO.md` for I/O, and
`docs/PHASE_5_POINTERS.md` for pointers and dynamic memory below.

**Status: Phase 5 — Pointers & Dynamic Memory.** `&`, `*`,
pointer-to-pointer, NULL, `malloc`/`calloc`/`realloc`/`free`,
use-after-free/double-free detection, pointer arithmetic, and `sizeof`
all work, with real (simulated, never actual hardware) addresses visible
in an extended Memory panel. Still no arrays or structs — see
[What's implemented](#whats-implemented) below. Stopping here pending
review.

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

Open the printed `localhost` URL. Try:

```c
int main(void) {
    int *ptr = malloc(sizeof(int));
    *ptr = 25;
    free(ptr);
    return 0;
}
```

Step through it and watch the Memory panel (bottom right) — the heap
block appears, then shows struck-through once freed.

### Run the tests

```bash
npm install
npm test
```

96 cases (Vitest): 67 from Phases 3/4/4.1 (unchanged except one
intentionally corrected assertion — see `docs/PHASE_5_POINTERS.md`),
plus 29 new ones covering pointers, dynamic memory, and memory-safety
errors.

### Run it as a desktop window (optional, needs Rust — untouched since Phase 1)

```bash
npm run tauri dev
```

---

## What's implemented

### Phase 5 — Pointers & Dynamic Memory

| Area | Status |
|---|---|
| `&` (address-of) and `*` (dereference), as both a read and an assignment target | done |
| Pointer-to-pointer, to arbitrary depth | done |
| NULL: safe default for an uninitialized pointer, comparison, clear error on dereference | done |
| `malloc`, `calloc` (zero-init), `realloc` (preserves contents), `free` (including `free(NULL)` as a no-op) | done |
| Use-after-free and double-free detection, each a specific error | done |
| Pointer arithmetic (`+`, `++`, `--`) across a malloc'd block, bounds-checked | done |
| `sizeof(TYPE)` and `sizeof(variable)` | done |
| Pointer function parameters, with visible write-through to the caller | done |
| Best-effort leak reporting at program end | done |
| Memory panel extended with simulated stack/heap addresses and pointer targets | done |
| Tests covering every scenario in the Phase 5 brief | done |
| `docs/PHASE_5_POINTERS.md`, including a full real debugging story | done |

Explicitly **not** implemented: arrays as a language construct, structs/
unions, pointer casts, function pointers, real hardware memory
addresses (everything is simulated and labeled as such), a full leak
detector, AI features, native execution/packaging, multi-language
support.

### Phase 4.1 — Basic C Standard I/O (unchanged this phase)

| Area | Status |
|---|---|
| `printf`/`scanf`/`puts`/`putchar`/`getchar`, real pause-for-input | done |

### Phase 4 — Memory, Variables & Stack Visualization (unchanged this phase)

| Area | Status |
|---|---|
| Variables/Memory/Stack panels, scope-correct, synchronized with execution | done |

### Phase 3 — Execution Engine (unchanged this phase)

| Area | Status |
|---|---|
| In-browser generator-based C interpreter; Run/Pause/Step Forward/Reset | done |

### Phase 2 — Parser Integration (unchanged this phase)

| Area | Status |
|---|---|
| Tree-sitter (WASM, fully offline); AST Viewer; syntax diagnostics | done |

### Phase 1 — Project Foundation (unchanged this phase)

| Area | Status |
|---|---|
| Tauri + React + TypeScript + Tailwind + Rust project, workbench layout, theme | done |

---

## Folder structure

```
codevi/
├── src/
│   ├── components/panels/
│   │   ├── MemoryPanel.tsx     # Rewritten — simulated stack/heap addresses, pointer targets
│   │   ├── VariablePanel.tsx    # + pointer value/type display
│   │   ├── StackPanel.tsx       # + pointer value display
│   │   └── (everything else unchanged this phase)
│   ├── execution/
│   │   ├── engine/ExecutionEngine.ts    # + heap/address conversion
│   │   ├── models/executionTypes.ts     # + HeapBlock, pointer-aware ExecutionValue, StackFrame.addresses
│   │   └── utils/                        # + pointer-aware formatting/change-detection
│   └── languages/c/interpreter/
│       ├── memory.ts          # New — MemoryModel: simulated addresses, stack + heap
│       ├── values.ts          # CValue is now CScalarValue | CPointerValue
│       ├── scope.ts           # Address-based storage via MemoryModel
│       ├── types.ts           # InterpreterError no longer holds a live WASM node (see docs)
│       └── interpreter.ts     # &, *, malloc/calloc/realloc/free, sizeof, pointer arithmetic
├── tests/unit/
│   ├── pointersBasics.test.ts, pointersHeap.test.ts, pointersFreeErrors.test.ts,
│   │   pointersArithmetic.test.ts, pointersMisc.test.ts   # New — 29 cases total
│   └── (all Phase 3/4/4.1 files unchanged except one corrected assertion)
├── docs/
│   ├── PHASE_0_ARCHITECTURE.md
│   ├── PHASE_2_PARSER.md
│   ├── PHASE_3_EXECUTION.md
│   ├── PHASE_4_VISUALIZATION.md
│   ├── PHASE_4_1_STDIO.md
│   └── PHASE_5_POINTERS.md
├── vitest.config.ts   # New — see docs/PHASE_5_POINTERS.md for why
└── package.json        # No new dependencies this phase
```

---

## Component hierarchy

Unchanged in shape from Phase 4.1 — no new components. `MemoryPanel` was
rewritten (same slot, same panel); `VariablePanel`/`StackPanel` gained
small pointer-display additions. Everything else is untouched.

---

## State management

No new stores. `useExecutionStore`'s `currentStep` carries more
information now (`heap: HeapBlock[]`, and each `StackFrame` gained
`addresses`) — read the same way every other execution state has been
read since Phase 3.

---

## Validation notes

- `npx tsc --noEmit`, `npm run build`, and `npm test` all pass.
- Every pointer/memory scenario was validated by actually running it —
  first via a standalone Node script directly against the compiled
  interpreter (to rule out the interpreter before touching any test
  tooling), then as a permanent Vitest suite.
- This phase's test suite surfaced a genuine, non-obvious bug — not in
  the pointer/memory logic itself, but in how errors were represented
  (`InterpreterError` was holding a live WASM node, the only place in
  the whole project doing so). Root-caused and fixed at the source
  rather than worked around. Full account, including the approaches
  tried and discarded along the way, in `docs/PHASE_5_POINTERS.md` →
  "A test-infrastructure crash, not an application bug".
- No interactive browser check of the extended Memory panel's appearance
  — same sandbox limitation as every prior phase (no display server
  here). `npm run dev` on your machine is the first interactive check.

### Known advisory / bundle-size tradeoff (carried over, unchanged)

Unchanged from Phase 1/2 — see those phases' notes. No new runtime
dependencies were added this phase (`vitest.config.ts` configures the
existing dev-only test runner; nothing new was installed).

---

## Future extension points

| Placeholder today | Becomes real in | Reference |
|---|---|---|
| Visualization tab (graphical stack/heap diagram with arrows) | Later — `ExecutionStep.heap` and `StackFrame.addresses` already have everything such a diagram would need | `docs/PHASE_5_POINTERS.md` → "How Phase 6 can build on this" |
| Arrays, structs | Would need real design work — pointer arithmetic currently only works across a malloc'd block for exactly this reason | `docs/PHASE_5_POINTERS.md` → "Known limitations" |
| `ExplanationPanel`'s static line | Phase 10 | Blueprint section 1 |
| Step Back | Not scoped in any phase yet | `docs/PHASE_3_EXECUTION.md` |

---

## Remaining work

Nothing from the Phase 5 brief was skipped. Every deliverable (pointers,
dereferencing, pointer-to-pointer, NULL handling, dynamic memory,
use-after-free/double-free detection, pointer arithmetic, the extended
Memory panel, tests, documentation, a limitations list) is implemented
and verified as far as this sandboxed environment allows — the one open
item is the same as every prior phase's: a live, interactive check on
your own machine via `npm run dev`.
