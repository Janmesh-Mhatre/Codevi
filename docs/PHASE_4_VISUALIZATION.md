# Phase 4 — Memory, Variables & Stack Visualization

How Codevi turns Phase 3's execution state into the Variables, Memory,
and Stack panels — and exactly how far that data can be trusted. Read
alongside `docs/PHASE_3_EXECUTION.md` (this phase extends that one's
interpreter and engine, not a new system).

## What actually needed extending

Phase 3's `ExecutionStep.variables` already gave a correct, scope-aware
snapshot of the *currently executing* frame — that alone is enough for
the Variables and Memory panels. It was not enough for the Stack panel,
which needs to show **every** active frame at once (`main` and
`square(5)` simultaneously), each with its own separate locals. Getting
that right — without duplicating the execution engine, per the brief —
meant extending the interpreter's internal call-stack tracking from a
list of plain function-name strings to a list of `RuntimeFrame` objects
(`src/languages/c/interpreter/types.ts`), each holding a live reference
to its own scope.

## How scope-correct, per-frame display works

Every `RuntimeFrame` tracks `currentNode`/`currentScope` — "what is this
frame currently paused at". These are updated in exactly one place,
`makeStep()` in `interpreter.ts`: right before any step is yielded, it
writes the step's node/scope onto the *topmost* frame. That's the whole
mechanism:

- While a frame is topmost (actively executing), its `currentNode`/
  `currentScope` are updated on every step, so they're always exactly
  where execution really is.
- The moment a nested call pushes a new frame on top, the caller's frame
  simply stops being written to — freezing it at precisely the
  statement/scope it was paused at when it made the call. No separate
  "record the call site" logic was needed; it falls out of frames only
  being updated while they're on top.
- Block scoping was already correct in Phase 3 (a `{ }` creates a new
  child `Scope`, discarded when the block ends) — see
  `docs/PHASE_3_EXECUTION.md`. Phase 4 didn't change that; a frame's
  `currentScope` is whichever `Scope` object happened to be active at
  its last update, nested or not, so a block-local variable like `b` in
  the prompt's own example is visible in the snapshot exactly while its
  block is executing and gone as soon as a step outside that block is
  yielded. Verified directly — see "Tests" below.

At yield time, every frame in the call stack (not just the topmost) gets
snapshotted into a plain `StackFrameSnapshot`
(`functionName, callDepth, line, parameters, locals`), split into
parameters vs. other locals using the parameter names captured once at
call time. `ExecutionEngine.toExecutionStep` converts these into the
public `StackFrame[]` on `ExecutionStep`, the same plain-data pattern
used everywhere else in this project (Tree-sitter's `Node` → `AstNode`
in Phase 2; `InterpreterStep` → `ExecutionStep` in Phase 3).

## Execution synchronization

Source highlighting, Variables, Memory, and Stack all read from the
*same* `ExecutionStep` object — `useExecutionStore(state => state.currentStep)`
— rather than each keeping independent state. There is no code path
where one of these updates and another doesn't: the engine replaces
`currentStep` atomically on every `advanceOne()`, and every panel
re-renders off that single change. A mismatch between "what's
highlighted" and "what the panels show" isn't something that needed
separate synchronization logic to prevent — it's structurally
impossible given how the state flows, the same guarantee Phase 3's
current-line highlight already relied on.

## Variable-change indication

`src/execution/utils/useChangedKeys.ts` — a small hook that compares
each new step's variables against the previous step's (by value and
type, not by object identity, since a fresh object is created every
step regardless of whether anything changed) and returns the set of
names that changed, for a ~700ms window. `VariablePanel` applies a
subtle background tint to just those rows. This is presentation-only:
the interpreter and engine have no notion of "changed" — that's
deliberately a UI-layer concern, keeping execution logic and
visualization logic separate per the brief.

## Panel-by-panel

- **Variables** (`VariablePanel.tsx`): the active frame's parameters and
  locals as a name/type/value/scope table, with the active function
  named above it and changed rows briefly highlighted.
- **Memory** (`MemoryPanel.tsx`): the same active-frame values, in the
  simpler two-column "Variable / Storage" shape from the brief's own
  example — deliberately no address column, with an explicit caption
  ("Conceptual representation — no real memory addresses are
  available") rather than a fabricated one. Real address/heap
  visualization needs the interpreter to have an address concept at
  all, which it doesn't (see "Known limitations").
- **Stack** (new `StackPanel.tsx`): every active frame, innermost/active
  first, each showing its own parameters and locals. The active frame is
  explicitly labeled ("active" badge, accent border) rather than relying
  on position alone.

## Layout

Added as a third tab ("Stack") in the existing AST/Visualization tab
group in `AppShell.tsx` — the same mechanism Phase 2 used to add the AST
tab into what was previously a single always-visible Visualization
panel. Default tab stays "ast", unchanged from Phase 2 — Stack doesn't
auto-open when execution starts, so it can't yank the view away from
someone reading the AST mid-run. Variables and Memory keep their exact
Phase 1 layout slots; only their contents changed. The Visualization tab
itself is untouched (still Phase 1's placeholder) — a real graphical
diagram is a heavier undertaking than this phase's brief asks for (its
own examples are plain tables and boxes, not node graphs), and building
one would edge into data-structure/animation territory this phase
explicitly excludes.

## Supported C scope

Matches Phase 3 exactly, since Phase 4 visualizes Phase 3's data rather
than executing anything itself: `int`/`float`/`double`/`char` scalar
variables, parameters, and return values, in whatever functions/scopes
the Phase 3 interpreter already supports. Arrays are **not** visualized
— Phase 3 doesn't support them at all ("array declarations" hit the
interpreter's existing "only simple variable declarations are supported"
error), so there was nothing reliably available to show; per the brief,
this is documented as unsupported rather than approximated.

## Known limitations

- **No pointers, arrays, structs, heap, or real addresses** — inherited
  directly from Phase 3's interpreter, which has no address concept for
  any value. The Memory panel's lack of an address column is a direct,
  honest consequence of this, not a Phase 4 shortcut.
- **No global variables** — same Phase 3 limitation; only the active
  function's own parameters/locals are ever shown, since that's all the
  interpreter tracks.
- **Non-topmost frames show their last-known position, not a live one**
  — correct by construction (see above) but worth stating plainly: a
  paused caller's "line" is where it made the call, not something that
  updates while its callee runs.
- **The Visualization tab is still a placeholder.** A graphical
  stack/memory diagram (boxes, arrows) is future work — this phase
  covers the tabular/textual data views the brief's own examples show.
- **Change-highlighting is time-based, not click-through-history.**
  Re-running the same value into a variable won't show as "changed" if
  it's genuinely the same value — only an actual value or type
  difference between consecutive steps triggers the highlight, which is
  the intended, accurate behavior.

## Tests

`tests/unit/callStack.test.ts` (new, 7 cases) — run via `npm test`
alongside Phase 3's existing suite:

- The prompt's own conditional-scope example, asserting `b` appears in
  some steps and is absent from others, and specifically absent by the
  time `return a` is reached.
- A single-function program never reports more than one stack frame.
- The prompt's `square(5)` example: a frame appears on call and is gone
  again on return, and while active, `square`'s parameter is correctly
  separated into `parameters` rather than `locals`.
- The prompt's nested-calls example (`add` then `multiply`): frames
  appear and disappear in the exact right sequence.
- The prompt's recursion example (`factorial(5)`): five independent
  `factorial` frames stack up simultaneously, each with its own `n`
  (5,4,3,2,1 — not five copies of the same value, which would indicate
  frames were sharing state incorrectly), collapsing back to just `main`
  at the end.
- The prompt's mutation (`10 → 20 → 25`) and loop-counter
  (`0 → 1 → 2 → 3`) examples, confirming the values a viewer would
  actually see progress correctly across steps.

All 25 tests in the project (18 from Phase 3 unchanged, 7 new) pass.

## Regression testing

- `npx tsc --noEmit`, `npm run build`, and `npm test` (full suite,
  including every Phase 3 test) all pass after this phase's changes.
- Files touched this phase: the interpreter/engine/type files listed
  below, `VariablePanel.tsx`, `MemoryPanel.tsx`, and `AppShell.tsx`
  (one line adding the Stack tab). `CodeEditor.tsx`, `Toolbar.tsx`,
  `ConsolePanel.tsx`, `AstViewerPanel.tsx`, and everything under
  `src/state/` other than the types feeding into execution were **not**
  touched — Monaco's caret/bracket-completion behavior, the theme
  system, the Toolbar's Run/Pause/Step/Reset wiring, the AST viewer, and
  syntax diagnostics all run through code that is byte-for-byte
  unchanged from Phase 2/3.
- No interactive browser check was possible in this sandbox (no display
  server, consistent with every prior phase) — `npm run dev` on your
  machine is the first interactive regression check for caret behavior,
  bracket/quote completion, and the visual theme specifically.

## Files added

- `src/execution/utils/formatValue.ts` — shared value formatting
- `src/execution/utils/useChangedKeys.ts` — the change-highlight hook
- `src/components/panels/StackPanel.tsx` — the call-stack view
- `tests/unit/callStack.test.ts`
- `docs/PHASE_4_VISUALIZATION.md` — this document

## Files modified

- `src/languages/c/interpreter/types.ts` — `RuntimeFrame`,
  `StackFrameSnapshot`; `InterpreterStep` gained `callStack`
- `src/languages/c/interpreter/interpreter.ts` — call stack is now
  `RuntimeFrame[]` instead of `string[]`; `makeStep` builds full
  multi-frame snapshots
- `src/execution/models/executionTypes.ts` — new `StackFrame`,
  `ExecutionValue`; `ExecutionStep` gained `callStack`; the old
  `ExecutionResult` type (identical in shape to the new `ExecutionValue`)
  was folded into it rather than kept as a duplicate
- `src/execution/engine/ExecutionEngine.ts` — `toExecutionStep` now also
  converts the interpreter's per-frame data
- `src/components/panels/VariablePanel.tsx`,
  `src/components/panels/MemoryPanel.tsx` — placeholder → functional
- `src/components/layout/AppShell.tsx` — added the Stack tab

## Dependencies added

None. Everything in this phase is built on what Phase 1–3 already
installed.

## How Phase 5 can build on this

`StackFrame.parameters`/`.locals` are already split and already
per-frame, so a more detailed variable-tracking phase (type-specific
formatting, watch-style pinning, a dedicated history view) can read
directly from `ExecutionStep.callStack` without touching the interpreter
again. The `useChangedKeys` pattern generalizes to anything that wants
"what changed since last step" — it's not Variables-panel-specific.
The clearest next real gap is the same one Phase 3 already flagged:
there is still no address/pointer/heap model anywhere in the value
representation, so any pointer or array visualization work has to start
in `src/languages/c/interpreter/values.ts` and the interpreter's
declaration/assignment handling, not in a new UI panel.
