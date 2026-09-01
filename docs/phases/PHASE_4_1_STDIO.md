# Phase 4.1 — Basic C Standard I/O

`printf`, `scanf`, `puts`, `putchar`, `getchar` — how they're implemented,
how execution genuinely pauses for real user input in a single-threaded
browser interpreter, and exactly what's supported. Read alongside
`docs/PHASE_3_EXECUTION.md` (this phase extends that one's interpreter
and engine, not a new system) and `docs/PHASE_4_VISUALIZATION.md` (the
Variables/Memory/Stack panels pick up scanf's results automatically,
with no changes of their own — see "Variable integration" below).

## Why generators can pause for real input

Phase 3's interpreter generators already yielded `InterpreterStep`s and
were driven by a caller repeatedly calling `.next()` — but nothing ever
needed to send a value *back into* the generator; every yield's result
was discarded. `scanf`/`getchar` need exactly that: `const value = yield
<a request for input>;` where `value` only becomes available whenever the
caller eventually calls `.next(theRealValue)` — which, for interactive
input, might be seconds later, after an async wait for the user to type
something and hit Submit. This is a native capability of JS generators
(the `TNext` type parameter of `Generator<T, TReturn, TNext>`), not a new
mechanism — Phase 4.1 is the first phase that actually uses it. Every
generator function in `interpreter.ts` now shares one `Step<T>` alias
(`Generator<InterpreterStep, T, InputResumeValue | undefined>`); the vast
majority of yield sites still ignore the resume value completely (call
`yield makeStep(...)` as a bare statement, exactly as before) — only
`requestInput()` actually reads it.

## Output vs. input events

Both are represented as new `InterpreterStep` kinds (`"output"` and
`"input-request"`), extending the existing step shape from Phase 3/4
rather than introducing a parallel event system — this is what the brief
asked for ("extend existing interfaces"). They're handled very
differently by `ExecutionEngine.advanceOne()`:

- **`"output"`** (printf/puts/putchar): appended to `ExecutionState.output`
  and immediately drained — `advanceOne()` keeps calling `.next()`
  internally until it hits something else. From the outside, "one step"
  still means "one statement", matching Phase 3's contract exactly;
  producing output is a side effect of that step, not a separate
  pausable moment. Output events still count toward the step-count
  safety limit (`MAX_EXECUTION_STEPS`), so a loop that only ever prints
  can't dodge the runaway-execution guard.
- **`"input-request"`** (scanf/getchar): always stops. `advanceOne()`
  returns `"waiting"`, the engine transitions to a new
  `"waiting-for-input"` status, and the scheduled run-loop
  (`scheduleChunk`) sees that status and stops rescheduling itself. Only
  `provideInput()`/`cancelInput()` can move things forward again.

## Validation happens before resuming, not inside the interpreter

`ExecutionEngine.provideInput(raw)` validates `raw` against the pending
request's format specifier (via `stdio.ts`'s `parseScanfValue`) *before*
ever touching the generator. Invalid input never reaches
`.next()` — the engine just sets `inputError` and stays in
`"waiting-for-input"` for another attempt. This means the interpreter's
own `requestInput()` never has to handle "the user typed something
unparseable" — by the time it resumes, it's always holding a real,
valid `CValue`. The one thing the interpreter *does* handle is
cancellation (`{ cancelled: true }`, sent by `cancelInput()` or
implicitly by Reset abandoning the generator), which becomes a normal
`InterpreterError("Input was cancelled")` — reusing the exact same
error-handling path as any other execution error rather than needing
one of its own.

This split (engine validates and retries; interpreter only ever sees
success or cancellation) is what makes "must not silently create an
incorrect integer" and "must not corrupt execution state" both true
without special-casing inside the interpreter's control flow.

## Multi-value scanf

`scanf("%d %d", &a, &b)` isn't just single-argument — `callScanf` walks
every specifier in the format string and issues one input request per
specifier, in order, assigning each as it's validated. This isn't extra
machinery bolted on for the multi-argument case; it's the exact same
`requestInput()` used once, called in a loop. Verified directly (see
"Tests" below) with a two-value scanf.

## `%s`: supported for printf, not for scanf

`printf("%s", ...)` works, but **only** with a string literal written
directly in the call (`printf("Name: %s", "Bob")`) — Codevi has no
`char*`/string variable type, so there's no way to pass a *variable*
holding a string. `scanf("%s", ...)` is rejected outright with a message
explaining why (there's no char-array to write the result into), rather
than silently accepting the specifier and doing something wrong. This
distinction — read-only string literal use works, anything requiring a
string value or buffer doesn't — runs through this whole phase.

## String literal handling

Extracting a string literal's real text turned out to need more care
than Phase 3's blanket rejection of `string_literal` nodes did — the
grammar structures a literal like `"Hello\n"` as a `string_literal` node
wrapping separate `string_content` ("Hello") and `escape_sequence`
("\n") children, not one flat text span. `node.text` on the whole literal
still includes the surrounding quotes and leaves escapes as literal
backslash-n pairs. `stdio.ts`'s `extractStringLiteralText()` walks these
children and resolves `\n \t \r \0 \\ \" \'` to their real characters —
verified against the grammar directly (a temporary inspection script,
not guessed) before writing this function, the same way earlier phases
verified field names before relying on them.

## Execution control during input

- **Run** pauses exactly like a manual step would when it hits scanf/
  getchar — the engine remembers whether a free-run was in progress
  (`resumeRunningAfterInput`) and, once valid input arrives, either
  resumes the chunked run loop or lands back in Paused, matching
  whichever mode was active before the request interrupted it.
- **Step Forward** and **Run** are both disabled (visibly, in the
  Toolbar, not just silently ignored) while `status === "waiting-for-
  input"` — a pending request can't be skipped past.
- **Reset** clears `pendingInput`, any `inputError`, the output buffer,
  and abandons the suspended generator, the same way it already
  abandoned a running one in Phase 3.
- **Pause** has nothing to do while waiting for input (there's nothing
  running to pause) and is already disabled by the existing `status !==
  "running"` check from Phase 3.

## Variable integration

No code changes were needed in `VariablePanel`, `MemoryPanel`, or
`StackPanel` for scanf'd values to show up correctly — they already read
`ExecutionStep.variables`/`.callStack` from the shared execution
snapshot (Phase 4's central design point), and a variable scanf updates
is a completely ordinary variable assignment from the interpreter's
point of view. Verified directly: `tests/unit/executionEngineStdio.test.ts`
asserts `currentStep.variables.age` reflects the scanned value after
`provideInput("30")` resolves.

## The input UI

A small field + Submit button appears at the bottom of the existing
Console panel exactly when `status === "waiting-for-input"` — not a new
panel, not a modal, per the brief's "use the existing layout." Shows
what triggered the request (e.g. `scanf("%d", &age)`) and, on invalid
input, a validation message from `ExecutionEngine.provideInput` without
touching execution state. Enter submits; Escape cancels (calls
`cancelInput()`, surfacing as a normal execution error — see above).
Console's existing diagnostics/execution-log sections are unchanged;
program output is a new, separate block below them.

## A real bug this phase's tests caught

Building an engine-level test that actually drove a scanf through the
real async scheduler (rather than just the interpreter's generator in
isolation) surfaced a genuine bug in `callFunction`'s call-exit step,
present since Phase 3: it explicitly passed the function's bare
top-level `scope` when yielding the "returning from X" step,
reasoning (at the time) that this represented "back at the function's
own level." That reasoning was wrong — a function's *body* is itself a
block, and `executeBlock` always gives a block its own child scope, so
locals declared directly in a function body (not inside some nested `if`
or loop) live in that child scope, never in the bare top-level `scope`
`callFunction` holds a reference to. The call-exit step was silently
dropping every such local from its snapshot. Fixed by using
`frame.currentScope` (wherever execution actually last was, continuously
kept accurate — see `docs/PHASE_4_VISUALIZATION.md`) instead of forcing
a reset back to the bare scope. This also retroactively improves Phase
4's Stack panel: a "returning" frame now correctly shows its real final
locals for *any* function, not just ones involving I/O — found while
building Phase 4.1, but not actually specific to it.

## Supported format specifiers

| Specifier | printf | scanf | Notes |
|---|---|---|---|
| `%d`, `%i` | done | done | Signed integer |
| `%u` | done | done | Treated identically to %d/%i — no distinct unsigned semantics modeled |
| `%f` | done (6 decimal places, matching real printf's default) | done | |
| `%c` | done | done | |
| `%s` | done, string-literal arguments only | not supported | No string/char-array variable type to scan into |
| `%%` | done (literal `%`) | n/a | |
| any other `%x` | rejected with a clear error | rejected with a clear error | Never silently passed through |

Recognized escape sequences in string/char literals: `\n \t \r \0 \\ \" \'`.

## Known limitations

- **No `%s` for scanf**, and printf's `%s` only accepts a literal —
  both direct consequences of having no string/pointer value type.
- **No real unsigned-integer semantics for `%u`** — same simplification
  Phase 3 already documented for arithmetic generally.
- **No output buffering/flushing semantics** — output is appended to the
  console immediately as each printf/puts/putchar runs; there's no
  concept of a stream that could be flushed or left unflushed.
- **`getchar()` has no EOF** — every call always waits for a real
  keystroke; there's no way to signal "end of input" in this interactive
  context, so `getchar() == EOF`-style loop-termination idioms aren't
  meaningfully supported (the loop just waits for another character).
- **Multi-value scanf is sequential, not one combined prompt** — each
  `%` specifier gets its own input request/UI turn rather than a single
  field accepting `"3 4"` at once. Chosen for consistency with how a
  single-value scanf already works, not revisited this phase.
- Everything already documented as unsupported in Phase 3
  (pointers/arrays/structs, global variables, the rest of `stdio.h`,
  `switch`) is still unsupported — this phase didn't touch any of that.

## Tests performed

67 tests total (Vitest, `npm test`), across five files:

- `tests/unit/stdio.test.ts` (24, new) — pure format-string
  parsing/rendering and scanf validation, no interpreter involved:
  every required specifier, `%%`, rejection of unrecognized specifiers,
  the brief's exact `printf("x = %d, y = %d")` example, missing-argument
  and wrong-argument-type errors.
- `tests/unit/stdioInterpreter.test.ts` (13, new) — the interpreter's
  generator driven through real printf/puts/putchar/scanf/getchar calls,
  including actually resuming a suspended generator with `.next(value)`:
  every scenario in the Phase 4.1 brief's testing section (the exact
  `printf`, multiple-`printf`, `puts`, `putchar`, `scanf`, mixed-I/O, and
  invalid-input examples), plus multi-specifier scanf and cancellation.
- `tests/unit/executionEngineStdio.test.ts` (5, new) — `ExecutionEngine`
  driven through its real `setTimeout`-based async scheduler (not a
  mock of the scheduling), covering: Run completing with accumulated
  output; Run pausing at scanf, exposing `pendingInput`, and resuming
  correctly after `provideInput`; invalid input being rejected without
  disturbing state and a retry succeeding; Reset clearing pending input
  cleanly and leaving the engine reusable; Step Forward being a no-op
  while waiting for input. `parserService` is mocked at the module
  boundary for these — see the file's top comment for why (a Vitest/Vite
  asset-resolution gap in the test environment specifically, not an
  application bug; the real `vite build` output was already confirmed
  correct in Phase 2).
- `tests/unit/interpreter.test.ts`, `tests/unit/callStack.test.ts`
  (Phase 3/4, unchanged except one updated assertion — see below) — all
  still passing.

One Phase 3 test was updated, not just left to fail: it asserted that
calling `printf(...)` produced an "unsupported function" error, which
was true in Phase 3 and is now false by design. Repointed at `malloc`
(still genuinely unimplemented) to preserve what the test was actually
checking — that recognized-but-unsupported library calls get a specific,
helpful message — without asserting something no longer true.

## Regression testing

- `npx tsc --noEmit`, `npm run build`, and `npm test` (full suite) all
  pass.
- Phase 1: Monaco/caret/bracket-completion/theme/layout are untouched —
  `CodeEditor.tsx`'s only changes this phase were adding
  `"waiting-for-input"` to two existing status checks (read-only, current-
  line highlight), no editor-option or theme changes.
- Phase 2: the parser, AST viewer, and syntax diagnostics are completely
  untouched.
- Phase 3: Run/Pause/Resume/Step Forward/Reset, error handling, and
  infinite-loop protection all still pass their original tests
  unmodified (18/18), plus now correctly handle the new status.
- Phase 4: Variables/Stack/conceptual-Memory panels needed zero code
  changes (see "Variable integration" above) and their original 7 tests
  still pass unmodified — and are, if anything, now more accurate (see
  "A real bug this phase's tests caught").

## Files added

- `src/languages/c/interpreter/stdio.ts` — format-string parsing/
  rendering, scanf validation, string-literal extraction (pure, no
  web-tree-sitter/generator dependency beyond one text-extraction
  helper)
- `tests/unit/stdio.test.ts`, `tests/unit/stdioInterpreter.test.ts`,
  `tests/unit/executionEngineStdio.test.ts`
- `docs/PHASE_4_1_STDIO.md` — this document

## Files modified

- `src/languages/c/interpreter/types.ts` — `InputRequest`,
  `InputResumeValue`; `InterpreterStep` gained `"output"`/
  `"input-request"` kinds and `output`/`inputRequest` fields; removed
  `printf`/`scanf` from the "known but unsupported" library list
- `src/languages/c/interpreter/interpreter.ts` — printf/puts/putchar/
  scanf/getchar call handling, `pointer_expression` support (scanf's
  `&variable` targets), the call-exit scope fix described above
- `src/execution/models/executionTypes.ts` — `"waiting-for-input"`
  status, `PendingInput`, `output`/`pendingInput`/`inputError` on
  `ExecutionState`
- `src/execution/engine/ExecutionEngine.ts` — output draining,
  input-request pausing, `provideInput`/`cancelInput`
- `src/state/executionStore.ts` — exported `provideInput`/`cancelInput`
- `src/components/panels/ConsolePanel.tsx` — program output display,
  the input UI
- `src/components/toolbar/Toolbar.tsx` — Run/Step Forward also disabled
  while waiting for input
- `src/components/editor/CodeEditor.tsx` — read-only and current-line
  highlight now also apply during `"waiting-for-input"`
- `tests/unit/interpreter.test.ts` — one outdated assertion updated (see
  above)

## Dependencies added

None.

## How later standard-library phases can build on this

The `"output"`/`"input-request"` step kinds and the engine's
output-draining/input-pausing machinery aren't printf/scanf-specific —
any future library function that needs to either produce output or block
for something external can reuse the exact same two mechanisms rather
than inventing new ones. The engine-level validate-before-resume pattern
(`provideInput` never lets an invalid value reach the interpreter)
generalizes to any future input-like operation. The one real structural
prerequisite for going further into `stdio.h`/`string.h` is the same gap
Phase 3 already flagged and this phase ran into repeatedly (`%s`,
`getchar`'s missing EOF, no buffers): Codevi has no pointer/array/string
value type yet. That's the actual next architectural step, not another
round of I/O functions.
