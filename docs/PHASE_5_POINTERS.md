# Phase 5 — Pointers & Dynamic Memory

Address-of, dereference, pointer-to-pointer, NULL, `malloc`/`calloc`/
`realloc`/`free`, use-after-free/double-free detection, pointer
arithmetic, `sizeof`, and the extended Memory panel — plus, in full, a
real test-infrastructure crash this phase's work surfaced, root-caused,
and fixed. Read alongside `docs/PHASE_3_EXECUTION.md` (the interpreter
this extends) and `docs/PHASE_4_VISUALIZATION.md` (the panels this
extends).

## Architecture: addresses are real, hardware memory isn't

The core design decision this phase is built on: variables stopped being
"a name mapped directly to a value" and became "a name mapped to a
**simulated address**, which is mapped to a value." `Scope` (the same
class since Phase 3) no longer holds values directly — it holds
`Address` bindings and delegates all reads/writes to a shared
`MemoryModel` (`src/languages/c/interpreter/memory.ts`, new this phase).
This is what makes `&x` meaningful at all: it returns the exact address
`x`'s own storage already lives at, so a later `*ptr = 5` and a direct
read of `x` are reading and writing the *same* simulated memory cell,
not two independent copies.

Addresses are small, made-up, labeled identifiers (`S001`, `H002[1]`) —
never anything resembling a real hardware address, exactly per the
brief's "do not simulate real memory addresses, only labeled simplified
structures." `formatAddress()` in `memory.ts` is the one place that
renders them.

```
CValue (values.ts)
  = CScalarValue  { kind: "scalar", type, value }
  | CPointerValue { kind: "pointer", type: pointee type, target: Address | null }

Scope (scope.ts)
  name -> Address           (declare/lookup/assign go through MemoryModel)

MemoryModel (memory.ts)
  stack slots  : Address -> CValue   (one per declared variable)
  heap blocks  : Address -> CValue[] (one per malloc/calloc/realloc call)
  event log    : bounded history of allocate/free/write events (capped
                 at 200 entries) -- this is what powers leak reporting
```

## Supported

- `&x` (address-of), `*ptr` (dereference), both as read and as an
  assignment target (`*ptr = 5;`)
- Pointer-to-pointer (`int **pptr`), to arbitrary depth
- `NULL` — a pointer declared without an initializer defaults to NULL
  (never garbage); dereferencing NULL is a clear
  `"Null pointer dereference"` error
- Pointer comparison (`==`, `!=`) — including the `if (!ptr)` idiom
- `malloc`, `calloc` (zero-initializing), `realloc` (preserving
  overlapping contents on grow/shrink), `free`
- `free(NULL)` — a documented no-op, matching real C
- Use-after-free and double-free — both are errors, not silent
  successes or crashes
- Pointer arithmetic (`ptr + n`, `ptr++`, `ptr--`) — but **only** across
  a `malloc`/`calloc`/`realloc`'d block (see "Known limitations")
- `sizeof(TYPE)` and `sizeof(variable)`, using Codevi's own simulated
  unit sizes (`char`=1, `int`/`float`=4, `double`=8, pointer=4)
- A pointer parameter to a function, with writes through it visible to
  the caller — the natural "pass by pointer" idiom
- Best-effort leak reporting: an unfreed heap block still owned by the
  program at `return` from `main` is reported (as an output message, not
  an error — a leak doesn't stop the program)

## How malloc infers element size

`malloc(sizeof(int))` and `malloc(3 * sizeof(int))` need to produce
different-shaped allocations (one opaque slot vs. three real elements
pointer arithmetic can move across) — but the interpreter only ever sees
an evaluated *number* of bytes by the time it would naively look at
`malloc`'s argument. `inferAllocationShape()` instead pattern-matches
the **AST shape** of the size argument directly — a bare
`sizeof_expression`, or a `binary_expression` with `*` where one side is
a `sizeof_expression` — before evaluating anything, rather than trying
to reverse-engineer "how many elements" from a raw byte count after the
fact (which is ambiguous — `malloc(12)` could mean 3 ints, 12 chars, or
1.5 doubles). Anything that doesn't match one of those two shapes falls
back to "one opaque block" — always safe to dereference, just not
something pointer arithmetic can meaningfully move across.

## Error handling

Every pointer/memory failure mode in the brief maps to a specific,
distinct message rather than a generic failure — verified directly in
tests, not just asserted in prose:

| Situation | Error |
|---|---|
| Dereferencing NULL | `Null pointer dereference` |
| Dereferencing/writing through a freed heap pointer | `Use after free: H00N was already freed` |
| Freeing an already-freed pointer | `Double free: ...` |
| `malloc`/`calloc` with a non-positive size/count | Specific message naming the function and the bad value |
| Heap allocation count exceeding the simulated limit (500 blocks) | `Allocation failed: simulated heap limit ...` |
| Pointer arithmetic past the end of its block | `Pointer arithmetic moved outside the bounds of the allocated block (N element(s))` |
| Pointer arithmetic on a pointer to a single stack variable | Explains there's nowhere to move to, since arrays aren't supported |
| `free(NULL)` | Not an error — a documented no-op |

## Known limitations

- **No arrays as a language construct.** `int arr[5];` is not supported
  — the only way to get multi-element storage is `malloc`/`calloc`.
  Pointer arithmetic works across a malloc'd block precisely *because*
  that's Codevi's only multi-element storage, not because arrays are
  secretly supported underneath.
- **No structs/unions.** Every pointer points at a scalar
  (`int`/`float`/`double`/`char`) or another pointer — never a composite
  type.
- **No pointer casts, function pointers, or `void*` arithmetic
  semantics** beyond what's needed for `malloc`'s untyped return value
  to be assigned to a typed pointer.
- **Leak reporting is best-effort, not exhaustive.** It checks what's
  still allocated when `main` returns; it doesn't track anything about
  *why* a block became unreachable (no reachability analysis) — it's
  "was this freed by the time the program ended," which is enough for
  the brief's own example but not a real leak detector.
- **No real hardware addresses, ever** — by design, not as a gap. Every
  address is a small, labeled, simulated identifier.

## Memory panel

Extended per the brief's own example format (`Address: 0x1000
(simulated)`, `Value: 42`, `Points to: 0x2000`) rather than anything
resembling a real memory map: a **Stack** section (every visible
variable, its simulated address, and its value — a pointer's value shows
`-> <target address>` or `NULL`) and a **Heap** section (every
allocation, its size, its origin (`malloc`/`calloc`/`realloc`), active/
freed state — freed blocks render struck-through — and its current
contents while active). The Variables and Stack panels got the same
small arrow treatment for pointer values, and Variables' Type column now
shows `int *` rather than a bare `int` that would otherwise be
indistinguishable from a real `int` variable.

Per-variable addresses weren't previously exposed anywhere outside the
interpreter — `Scope.snapshotAddresses()` is a new, purely additive
method (parallel to the existing `snapshot()`, which already had
established callers depending on its exact `Record<string, CValue>`
shape) that the Memory panel's stack section reads from.

## A test-infrastructure crash, not an application bug

Building this phase's test suite triggered a real, reproducible crash:
Vitest's whole run would die with `RangeError: Maximum call stack size
exceeded`, thrown from deep inside Node's own `child_process`
serialization code — not from anywhere in Codevi. This section is the
full, honest account of finding the actual cause, including the blind
alleys, because several of them looked like fixes and weren't.

**First, ruling out the interpreter.** Before touching Vitest at all,
every scenario in the test suite was run directly against the compiled
interpreter from a standalone Node script — one `Parser` instance, real
`malloc`/`free`/pointer-arithmetic/use-after-free/double-free programs,
proper `.delete()` cleanup. All of it ran correctly, every time, with no
crash. This ruled out the interpreter and memory model as the cause
before spending any time on Vitest configuration.

**Things that looked like fixes but weren't the real cause:**
- *Tree cleanup timing.* An `afterEach` that deletes every parsed
  Tree-sitter tree was already partly in place; wiring it in everywhere
  helped but didn't fully fix it, and disabling cleanup entirely made
  things crash *faster* — ruling out "trees are deleted too eagerly" as
  the cause.
- *`isolate: false`.* Vitest's default per-file module isolation meant a
  module-level parser singleton was actually being re-created once per
  test file. Sharing one true singleton across files (via `isolate:
  false`) was a reasonable hypothesis (web-tree-sitter's WASM bindings
  turned out to dislike multiple independent `Parser.init()` calls in
  one process) but combined with the default pool it made things worse,
  not better — a real, useful finding (consolidating to one shared
  parser instance was still correct and was kept), but not the actual
  root cause.
- *`--stack-size` tuning.* Increasing Node's stack size for the test
  worker helped, proportionally, up to a point (`8000` -> 1 more test
  passing, `65500` -> several more) — then got *worse* at `500000`. That
  non-monotonic behavior is the signature of exceeding what the OS
  thread's real stack allocation supports, which makes V8's own
  stack-limit bookkeeping unreliable. Deliberately not shipped, since a
  fragile, machine-dependent numeric constant is not a real fix.
- *Splitting the largest test file into several smaller ones* (the
  `pointers*.test.ts` files) reduced how often the crash occurred a lot
  — enough that it looked, for a while, like the fix. It wasn't; it just
  changed the odds.

**The actual root cause.** Bisecting down to a single failing test (`-t`
filtering, run completely alone) found that exactly one assertion was
*wrong*, not flaky: a double-free test expected `CRuntimeError`, but
`callFree` (in `interpreter.ts`) correctly wraps the low-level
`CRuntimeError` from `memory.ts` as an `InterpreterError` so the failure
carries a source position — so the actual thrown error was
`InterpreterError`, and the assertion genuinely failed. `InterpreterError`
held a **live web-tree-sitter `SyntaxNode`** in its `node` field (true
since Phase 3). When an assertion fails, Vitest's reporter tries to
pretty-print the actual value for a helpful diff — and pretty-printing an
object holding a WASM-backed node (deep internal structure, tree-cursor
getters, no natural "leaf" for a naive recursive printer) is exactly
what overflowed the stack, and *that* failure is what got sent back to
the parent process over `child_process` IPC, which is where the crash
was actually observed. Every earlier "fix" changed test ordering/timing
enough to shift whether and when this one specific assertion ran — which
is exactly why file-splitting and stack-size tuning both seemed to help
without actually addressing anything.

**The real fix, two parts:**
1. **Fixed the test** — corrected the expected error type to
   `InterpreterError`, which is what the code has always correctly
   thrown.
2. **Fixed the actual bug**, which was architectural, not test-only:
   `InterpreterError` no longer holds a live `SyntaxNode`. It extracts
   `{ row, column }` at throw time into a new plain `SourcePosition`
   field instead. Nothing downstream ever read the raw node (only a
   position would ever be useful — e.g. a future "jump to error"
   feature), so this cost nothing and closes off the entire hazard
   class: `InterpreterError` was the *only* place in this whole project
   that broke the rule every other exported type already followed —
   never let a live WASM reference leave the interpreter layer (see
   `AstNode` in Phase 2, `ExecutionStep`/`StackFrame` in Phase 3/4). This
   is the fix that actually mattered; everything above it made the
   symptom rarer without removing the cause.

With both parts in place, the full suite (96 tests, 10 files) passes
consistently, repeatedly, with the default Vitest pool. `fileParallelism:
false` (see `vitest.config.ts`) and the shared-parser-singleton
consolidation were kept as reasonable, low-cost defensive choices for a
WASM-heavy suite — not because either was the fix, but because neither
hurts and both reduce how much load the test runner is ever under at
once.

## Tests performed

96 total (`npm test`), 29 of them new this phase, split across five
files by topic rather than one large one (see the crash investigation
above for why the split helped operationally, though it wasn't the
root-cause fix):

- `pointersBasics.test.ts` (8) — address-of/dereference round-trip, the
  brief's write-through-a-pointer example, a pointer's own address being
  distinct from its target, pointer-to-pointer (read and write), NULL
  dereference, uninitialized-pointer-defaults-to-NULL, NULL comparison.
- `pointersHeap.test.ts` (7) — the brief's exact malloc/write/read/free
  flow, a freed block reported inactive, malloc with an invalid size,
  calloc zero-initializing, realloc preserving contents, leak reporting
  present/absent.
- `pointersFreeErrors.test.ts` (4) — use-after-free on read and on
  write, double-free, `free(NULL)`.
- `pointersArithmetic.test.ts` (4) — advancing across a multi-element
  malloc'd block, `ptr++`/`ptr--` symmetry, bounds-checked arithmetic,
  arithmetic on a non-array pointer correctly rejected.
- `pointersMisc.test.ts` (6) — pointer comparison (equal/unequal),
  `sizeof(TYPE)`, `sizeof(variable)`, the `!ptr` idiom, a pointer
  function parameter with a visible write-through to the caller.

Every scenario named in the Phase 5 brief's own testing section is
covered by name. All prior phases' tests (67 from Phases 3/4/4.1) still
pass unmodified except the one corrected assertion described above.

## Regression testing

- `npx tsc --noEmit`, `npm run build`, and `npm test` all pass.
- `CodeEditor.tsx`, `Toolbar.tsx`, `ConsolePanel.tsx`, the AST viewer,
  and syntax diagnostics were not touched this phase.
- `VariablePanel.tsx`/`StackPanel.tsx` gained small, additive display
  changes (an arrow prefix and a `*` in the type column for pointers) —
  the underlying data flow and every other value type render exactly as
  before.
- No interactive browser check of the extended Memory panel's appearance
  — same sandbox limitation as every prior phase (no display server
  here). `npm run dev` on your machine is the first interactive check.

## Files added

- `src/languages/c/interpreter/memory.ts` — `MemoryModel`, `Address`,
  heap/stack simulation, the bounded event log leak reporting reads from
- `tests/unit/pointersBasics.test.ts`, `pointersHeap.test.ts`,
  `pointersFreeErrors.test.ts`, `pointersArithmetic.test.ts`,
  `pointersMisc.test.ts`
- `vitest.config.ts` — see "A test-infrastructure crash" above
- `docs/PHASE_5_POINTERS.md` — this document

## Files modified

- `src/languages/c/interpreter/values.ts` — `CValue` is now
  `CScalarValue | CPointerValue`; pointer-aware arithmetic/comparison
- `src/languages/c/interpreter/scope.ts` — address-based storage via
  `MemoryModel`; new `snapshotAddresses()`
- `src/languages/c/interpreter/types.ts` — `InterpreterError` no longer
  holds a live `SyntaxNode` (see above); `StackFrameSnapshot` gained
  `addresses`
- `src/languages/c/interpreter/interpreter.ts` — `&`/`*`, pointer
  assignment, `malloc`/`calloc`/`realloc`/`free`, `sizeof`, pointer
  arithmetic/comparison, NULL handling, leak reporting
- `src/execution/models/executionTypes.ts` — `HeapBlock`, pointer-aware
  `ExecutionValue`, `StackFrame.addresses`, `ExecutionStep.heap`
- `src/execution/engine/ExecutionEngine.ts` — heap/address conversion
  into the plain public types
- `src/components/panels/MemoryPanel.tsx` — rewritten: simulated stack
  addresses, heap blocks, pointer targets, replacing the Phase 4
  address-less placeholder
- `src/components/panels/VariablePanel.tsx`, `StackPanel.tsx` — pointer
  value/type display
- `src/execution/utils/formatValue.ts`, `useChangedKeys.ts` —
  pointer-aware formatting and change-detection
- `tests/unit/interpreter.test.ts`, `callStack.test.ts`,
  `stdioInterpreter.test.ts`, `executionEngineStdio.test.ts`,
  `helpers/interpreterTestHelpers.ts` — test-infrastructure fixes (see
  above); no behavioral test changes

## Dependencies added

None.

## How Phase 6 can build on this

`ExecutionStep.heap` and `StackFrame.addresses` are already real, plain,
per-step data — a call-stack-and-heap visualization (arrows from stack
pointers to heap blocks, the Visualization tab's eventual graphical
form) can read them directly with no interpreter changes. The
architectural rule reinforced by this phase's crash investigation is
worth carrying forward explicitly: nothing that leaves the interpreter
layer for the UI/store/test boundary should ever hold a live
web-tree-sitter object — every one of `AstNode`, `ExecutionStep`,
`StackFrame`, and now `InterpreterError`'s position data follows this,
and it should stay that way for anything added later.
