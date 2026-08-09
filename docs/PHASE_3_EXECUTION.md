# Phase 3 — Execution Engine & Step-Based Execution

How Codevi actually runs C code in the browser, with no GDB, no native
compiler, and no server — plus what that subset of C can and can't do
yet. Read alongside `docs/PHASE_0_ARCHITECTURE.md` (Execution Layer,
section 1; Execution Engine Planning, section 8) and
`docs/PHASE_2_PARSER.md` (this phase consumes that one's parser
directly, unchanged).

## Why generators

Browser compatibility rules out the Phase 0 blueprint's original plan
(GDB via the Machine Interface protocol) entirely — there's no process to
attach to. The only way to get real "run/pause/step" control over
executing code in a browser, without threads, is to make the interpreter
itself pausable. JavaScript generator functions (`function*`/`yield`) do
this natively: a generator is a function that can suspend mid-execution
and resume exactly where it left off, which is precisely what
single-stepping needs.

The interpreter (`src/languages/c/interpreter/interpreter.ts`) is one
family of mutually-recursive generator functions — `evaluate` for
expressions, `executeStatement`/`executeBlock` for statements,
`callFunction` for function calls — chained together with `yield*`
delegation. `yield*` matters specifically because it means a nested
function call's `yield`s bubble all the way up to whoever is driving the
outermost generator, so the JS call stack of generator frames naturally
mirrors the *interpreted* program's call stack. Tracking "current
function" and "call depth" falls out of this for free rather than
needing a hand-rolled stack data structure.

## Architecture layers

```
Source (Monaco)
     |
     v
Parser / AST (Phase 2, unchanged) — src/services/parserService.ts
     |  getCurrentTree(), getLastDiagnostics() [new accessors this phase]
     v
Interpreter (this phase, C-specific) — src/languages/c/interpreter/
     |  generator-based tree walk; yields InterpreterStep at each
     |  statement and function-call boundary
     v
Execution Engine (this phase, language-agnostic) — src/execution/
     |  Idle -> Preparing -> Running/Paused -> Completed/Error
     |  owns the run-loop scheduling, the step-count safety limit,
     |  and converts InterpreterStep -> plain ExecutionStep
     v
executionStore (Zustand mirror of the engine's state)
     |
     +--> Toolbar (Run/Pause/Step Forward/Reset)
     +--> ConsolePanel (execution log)
     +--> CodeEditor (current-line highlight, read-only while running)
```

Each arrow is a one-way, plain-data handoff. `ExecutionEngine` imports
`parserService` (a plain service) but never React or Zustand; it exposes
state via `subscribe`/`getState`, the same shape a non-React consumer
could use. `executionStore.ts` is the only file that connects the engine
to Zustand — it subscribes once at module load and mirrors whatever the
engine reports. No component imports `ExecutionEngine` directly; they
import `useExecutionStore` and the plain `runExecution`/`pauseExecution`/
`stepExecution`/`resetExecution` functions from `state/executionStore.ts`.

## Execution model — states and transitions

| Status | Meaning | Entered from |
|---|---|---|
| `idle` | Nothing prepared yet | Initial state, or Reset |
| `preparing` | Checking for syntax errors and building the interpreter generator | Run or Step Forward, from Idle/Completed/Error |
| `running` | Free-running via the scheduled chunk loop | Run |
| `paused` | Stopped between steps, generator still alive | Step Forward, or Pause while Running |
| `completed` | Interpreter generator finished normally | Reaching the end of `main` |
| `error` | Something stopped execution abnormally | Syntax errors, runtime errors, unsupported constructs, the step limit |

**Run** starts fresh from Idle/Completed/Error (calling `prepare()`
first) or resumes free-running from Paused — there's no separate
"Resume" control; the Toolbar's Run button just relabels itself
"Resume" when already Paused. **Step Forward** does the same
prepare-if-needed check, then advances exactly one step and lands in
Paused. **Pause** only does anything while Running. **Reset** works from
any state and returns cleanly to Idle, clearing the interpreter, the
highlighted line, and the console's execution log.

## Toolbar wiring

| Button | Enabled when | Action |
|---|---|---|
| Run / Resume | not Preparing/Running | `runExecution()` |
| Pause | Running | `pauseExecution()` |
| Step Forward | not Preparing/Running | `stepExecution()` |
| Reset | always | `resetExecution()` |
| Step Back | never (placeholder) | shows "Feature not implemented yet." |

Step Back is deliberately left as the Phase 1/2 placeholder. It wasn't in
the Phase 3 brief's control list (Run/Pause/Resume/Step Forward/Reset),
and reverse-stepping needs either full state-snapshot history or
replay-from-start — real scope, not a natural extension of what's built
here. Open File, Save File, and Settings remain placeholders too,
unchanged from Phase 1.

## Editor integration

Two changes to `CodeEditor.tsx`, both additive:

- **Current-line highlight**: an amber decoration (`.codevi-execution-line`
  in `src/index.css`, using the same `--color-active` token the rest of
  the app already uses for "this is active right now") on
  `currentStep.line`, applied via `editor.createDecorationsCollection`
  and cleared whenever status isn't Running or Paused.
- **Read-only while executing**: the editor becomes read-only for
  Preparing/Running/Paused, editable again for Idle/Completed/Error. The
  interpreter runs against a specific tree snapshot for the duration of a
  run (see "Tree lifetime during a run" below); allowing edits mid-run
  would desync the highlighted line from what's actually executing, so
  this is a real correctness measure, not just a UX nicety. Regular
  editing behavior — typing, bracket/quote completion, caret movement —
  is completely unchanged outside of a run.

## Tree lifetime during a run

The interpreter walks the *live* Tree-sitter tree from
`parserService.getCurrentTree()` (not the plain `AstNode` from Phase 2's
AST viewer — that representation deliberately drops anonymous tokens
like operators, which the interpreter needs). `parserService` deletes and
replaces its tree on every reparse, which could invalidate a tree the
engine is mid-run with — except the editor is read-only for the whole
Preparing/Running/Paused window, so no reparse can happen until execution
reaches a terminal state. `prepare()` always fetches the tree fresh, so a
Step Forward from Completed/Error/Idle picks up whatever's been edited
since.

## Runaway execution and browser responsiveness

Two independent mechanisms, solving two different problems:

- **Time-budget chunking** (`TIME_BUDGET_MS = 12`): a Run executes steps
  synchronously for up to ~12ms, then yields to the browser via
  `setTimeout(..., 0)` and reschedules itself. This is what keeps the UI
  responsive during a long-running loop — it has nothing to do with
  whether the loop ever finishes.
- **Step limit** (`MAX_EXECUTION_STEPS = 200,000`): a hard ceiling on
  total steps in one run, checked every chunk. This is what actually
  stops `while (1) {}` — without it, the time-budget mechanism alone
  would keep the tab responsive while burning CPU forever in the
  background. Hitting the limit transitions to Error with a clear message
  rather than silently stopping.

Both were verified directly: the automated test suite includes an
infinite-loop case that confirms `run()` reports `timedOut` rather than
hanging, and a `MAX_CALL_DEPTH` (200) guard in `callFunction` similarly
converts unbounded recursion into a clear error instead of a JS stack
overflow.

## Error handling

| Situation | How it's handled |
|---|---|
| Syntax errors in the source | `prepare()` checks `parserService.getLastDiagnostics()` before building the interpreter at all — refuses to run rather than handing broken syntax to the interpreter |
| No `main` function | `InterpreterError` from `interpretProgram`, caught by `prepare()` |
| Unsupported construct (pointers, arrays, structs, strings, library calls, ...) | `unsupported()` throws an `InterpreterError` naming the construct and, for library calls, why |
| Runtime error (division by zero, undeclared variable, redeclaration) | `CRuntimeError`/`InterpreterError`, caught by the engine's `advanceOne()` |
| Infinite loop / runaway recursion | Step limit / call-depth limit, above |
| Any other unexpected exception | `advanceOne()`'s catch-all still converts it to an Error state rather than an unhandled exception reaching React |

Every failure path ends in the same place — `ExecutionEngine.fail()` —
which sets `status: "error"`, records a message, and appends it to the
console log. Nothing here can crash the app or freeze the tab; that was
verified in the test suite (division-by-zero and undeclared-variable
cases both resolve to a clean error, not a hang or an unhandled
rejection) and by design (the step/depth limits bound every loop).

## Supported C constructs

- Types: `int`, `float`, `double`, `char` (scalar arithmetic only)
- Variable declarations, with or without an initializer
- Assignment (`=`) and compound assignment (`+= -= *= /= %=`)
- Arithmetic (`+ - * / %`), with C's truncating integer division —
  verified against JS's differing default behavior in the test suite
- Comparison (`< > <= >= == !=`) and logical (`&& || !`) operators, with
  short-circuit evaluation for `&&`/`||`
- Bitwise operators (`& | ^ << >>`) and unary `-`, `+`, `~`
- Increment/decrement, prefix and postfix (`++i`, `i++`, and `--`)
- `if` / `else if` / `else`
- `while`, `do...while`, `for` (including an empty/omitted init,
  condition, or update clause)
- `break` and `continue`
- User-defined functions: parameters, return values, recursion
- Block scoping that matches real C (a `{ }` — including a loop body or
  an `if` branch — introduces its own scope)
- `#include`/other preprocessor lines are silently skipped rather than
  rejected, so realistic student code with `#include <stdio.h>` at the
  top still parses and runs

## Known limitations

- **No pointers, arrays, structs, unions, or strings.** These need real
  address/memory semantics, which is explicitly Phase 4+'s job. Hitting
  one produces a specific "unsupported construct" error naming the
  construct and its source location, not a crash or a silently wrong
  result.
- **No standard library.** `printf`, `scanf`, `malloc`, and similar are
  recognized by name and given a specific "not supported yet" message
  rather than the generic "undefined function" error, but none of them
  do anything. There is no program output beyond the return value.
- **No global variables.** Only `main` and other top-level function
  definitions are read from the top level; a top-level variable
  declaration is silently ignored rather than supported or rejected.
  Worth fixing before Phase 4 needs cross-function shared state.
  Function-local variables and parameters work fully.
- **Multiple declarators in one statement** (`int a = 1, b = 2;`) are not
  handled — declare one variable per statement.
- **`switch` is not implemented.** `if`/`else if` chains cover the same
  ground for now.
- **No genuine integer width/overflow/signedness semantics.** Every
  numeric value is a JS double internally; there's no 32-bit wraparound,
  no distinction between `int` and `long`, etc. Documented rather than
  silently pretended away — see `values.ts`.
- **No real Undefined Behavior modeling.** Division by zero and a few
  other cases are caught and reported explicitly, but this interpreter
  doesn't attempt to reproduce what an actual miscompiled/UB program
  would do on real hardware — it fails loudly and clearly instead, which
  is the right behavior for an educational tool even where it diverges
  from "what GCC would actually do."

## Tests performed

`tests/unit/interpreter.test.ts` (run via `npm test`), 18 cases:

- All six scenarios named in the Phase 3 brief: basic execution,
  sequential statements, conditional execution, loop execution, invalid
  code, infinite loop.
- Additional coverage added during development: user-defined function
  calls, recursion (factorial), else-if chains, break/continue, do-while,
  C's truncating integer division, division-by-zero and
  undeclared-variable error handling, unsupported constructs (a pointer
  declaration) and unsupported library calls (`printf`) producing
  specific messages, step granularity (one step per statement, not per
  sub-expression), and call-depth tracking across nested calls.

Before any of this was written as a Vitest suite, the same scenarios were
run directly against the compiled interpreter from a standalone Node
script to check actual computed results (not just "it runs without
throwing"). That process caught two real issues, both fixed before this
phase shipped: a break/continue test's *expected* value was hand-computed
incorrectly on the first pass (traced by hand a second time, confirmed
the interpreter's answer of 12 was right — see the test's inline
comment), and `printf("hello")` initially failed on the string-literal
argument before reaching the printf-specific error message, which
exposed a real ordering bug (arguments were evaluated before checking
whether the callee was a recognized-but-unsupported library function) —
fixed by checking the callee first.

## Files added

- `src/languages/c/interpreter/values.ts` — CValue representation, C
  arithmetic semantics
- `src/languages/c/interpreter/scope.ts` — block-scoped variable
  environment
- `src/languages/c/interpreter/types.ts` — InterpreterStep,
  InterpreterError, break/continue signals
- `src/languages/c/interpreter/interpreter.ts` — the interpreter itself
- `src/execution/models/executionTypes.ts` — plain ExecutionState/
  ExecutionStep types
- `src/execution/engine/ExecutionEngine.ts` — orchestration, scheduling,
  safety limits
- `tests/unit/helpers/interpreterTestHelpers.ts`,
  `tests/unit/interpreter.test.ts` — the test suite above
- `docs/PHASE_3_EXECUTION.md` — this document

## Files modified

- `src/types/index.ts` — `ExecutionStatus` widened from 4 to the 6
  states this phase requires
- `src/services/parserService.ts` — added `getCurrentTree()` and
  `getLastDiagnostics()` accessors (additive; nothing existing changed
  behavior)
- `src/state/executionStore.ts` — was an inert Phase 1 placeholder, now
  a live mirror of `ExecutionEngine`
- `src/components/toolbar/Toolbar.tsx` — Run/Pause/Step Forward/Reset
  wired to real actions with state-aware disabling
- `src/components/panels/ConsolePanel.tsx` — now also renders the
  execution log
- `src/components/editor/CodeEditor.tsx` — current-line decoration,
  read-only during execution
- `src/index.css` — `.codevi-execution-line` decoration style

## Dependencies added

- `vitest` (dev dependency) — the project didn't have a configured test
  runner before this phase, despite `Testing: Vitest` being in the
  original Phase 0 tech stack; adding it was necessary to deliver
  "Tests" as a real, re-runnable artifact rather than a one-off script.

No other dependencies were added — the interpreter and execution engine
are plain TypeScript, and Phase 2's `web-tree-sitter`/`tree-sitter-c`
were reused rather than duplicated, per the brief.

## How Phase 4 will use this

`ExecutionStep.variables` already carries real (not fabricated) variable
data at every step — the interpreter has to track this correctly to
execute anything — but nothing in the UI reads it yet; `VariablePanel`
and `MemoryPanel` are untouched Phase 1 placeholders. Phase 4/5 should be
able to read `useExecutionStore(state => state.currentStep?.variables)`
directly rather than building new plumbing. Similarly, `callDepth` and
`functionName` are already tracked per step, ready for a call-stack view
without engine changes. The biggest real gap Phase 4 will hit first is
**no heap/pointer model at all** — `CValue` has no notion of an address,
so memory visualization needs a genuinely new value representation, not
just a new UI reading the existing one.
