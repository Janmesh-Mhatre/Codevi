# Codevi

*(formerly "Code Visualizer" — renamed during Phase 2; see
`docs/PHASE_0_ARCHITECTURE.md` for the original Phase 0 planning under
the old name)*

An educational, browser-based tool for visualizing how C programs
execute — built with React, TypeScript, and Rust/Tauri (currently run as
a browser app; native packaging is postponed). See
`docs/PHASE_0_ARCHITECTURE.md` for the original blueprint,
`docs/PHASE_2_PARSER.md` for the parser, `docs/PHASE_3_EXECUTION.md` for
the execution engine, and `docs/PHASE_4_VISUALIZATION.md` for the panels
below.

**Status: Phase 4 — Memory, Variables & Stack Visualization.** Variables,
a conceptual memory view, and a real multi-frame call stack now update
live as you run or step through code, all synchronized with the existing
current-line highlight. Still no pointers, arrays, or heap — see
[What's implemented](#whats-implemented) below. Stopping here per the
Phase 4 brief, pending review before Phase 5.

---

## Setup instructions

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later, and npm

Browser-based by design, same as Phases 2–3 — native/Tauri packaging is
explicitly postponed project-wide.

### Run it (browser)

```bash
npm install
npm run dev
```

Open the printed `localhost` URL. Run or Step Forward through a program
and watch the Variables and Memory panels (bottom right) and the Stack
tab (top right, alongside AST) update in sync with the highlighted line.

### Run the tests

```bash
npm install
npm test
```

25 cases (Vitest): the 18 from Phase 3, unchanged, plus 7 new ones
verifying the call-stack/scope data this phase's panels depend on. See
`docs/PHASE_4_VISUALIZATION.md` → "Tests".

### Run it as a desktop window (optional, needs Rust — untouched since Phase 1)

```bash
npm run tauri dev
```

---

## What's implemented

### Phase 4 — Memory, Variables & Stack Visualization

| Area | Status |
|---|---|
| Variables panel: name/type/value/scope for the active frame, live | done |
| Subtle highlight on a variable's row when its value changes | done |
| Conceptual Memory panel (variable/storage view, no fabricated addresses) | done |
| Stack panel: every active call frame, innermost/active first, with its own parameters and locals | done |
| Frames appear on function entry and disappear on return, including through recursion | done |
| Block-scoped variables appear/disappear correctly (verified against the brief's own scope example) | done |
| All panels read one shared execution snapshot, so they can't fall out of sync with the highlighted line | done |
| Tests covering every scenario in the Phase 4 brief | done |
| `docs/PHASE_4_VISUALIZATION.md` | done |

Explicitly **not** implemented, per the Phase 4 brief: pointer/heap/
dynamic-memory visualization, real memory addresses, a full debugger,
breakpoints, watch expressions, AI features, native execution/packaging,
multi-language support, animations, or any Phase 5+ feature.

### Phase 3 — Execution Engine (unchanged this phase)

| Area | Status |
|---|---|
| In-browser generator-based C interpreter; Run/Pause/Step Forward/Reset | done |
| Current-line highlight; infinite-loop/runaway-recursion protection | done |

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
│   ├── components/
│   │   ├── layout/AppShell.tsx      # + "Stack" tab alongside AST/Visualization
│   │   ├── toolbar/, editor/         # Unchanged this phase
│   │   ├── panels/
│   │   │   ├── VariablePanel.tsx      # Placeholder -> functional
│   │   │   ├── MemoryPanel.tsx        # Placeholder -> functional
│   │   │   ├── StackPanel.tsx         # New
│   │   │   └── (Explanation/Console/AST/Visualization unchanged)
│   │   └── common/
│   ├── state/executionStore.ts       # Unchanged interface; now carries callStack too
│   ├── execution/
│   │   ├── engine/ExecutionEngine.ts   # + per-frame conversion (toStackFrame)
│   │   ├── models/executionTypes.ts    # + StackFrame, ExecutionValue
│   │   └── utils/                       # New this phase
│   │       ├── formatValue.ts
│   │       └── useChangedKeys.ts
│   ├── languages/c/interpreter/
│   │   ├── types.ts          # + RuntimeFrame, StackFrameSnapshot
│   │   ├── interpreter.ts    # Call stack is now RuntimeFrame[], not string[]
│   │   └── values.ts, scope.ts   # Unchanged
│   └── services/parserService.ts   # Unchanged
├── tests/unit/
│   ├── interpreter.test.ts   # Phase 3, unchanged, still passing
│   └── callStack.test.ts     # New — see docs/PHASE_4_VISUALIZATION.md
├── docs/
│   ├── PHASE_0_ARCHITECTURE.md
│   ├── PHASE_2_PARSER.md
│   ├── PHASE_3_EXECUTION.md
│   └── PHASE_4_VISUALIZATION.md
└── package.json   # No new dependencies this phase
```

---

## Component hierarchy

Unchanged in shape from Phase 3 except one addition: `StackPanel` joins
`AstViewerPanel`/`VisualizationPanel` in the top-right tab group.
`VariablePanel` and `MemoryPanel` occupy their exact Phase 1 layout
slots with new content. Everything else — `Toolbar`, `CodeEditor`,
`ExplanationPanel`, `ConsolePanel`, `ErrorDialog`, `Toast` — is untouched.

---

## State management

No new stores this phase. `useExecutionStore`'s `currentStep` simply
carries more information now (`callStack: StackFrame[]`, per
`docs/PHASE_4_VISUALIZATION.md`) — every panel reads from this one
shared object, which is what keeps them synchronized with each other and
with the editor's current-line highlight by construction rather than by
extra coordination logic.

---

## Validation notes

- `npx tsc --noEmit`, `npm run build`, and `npm test` all pass.
- The call-stack/scope extension was validated the same way Phase 3's
  interpreter was: real test assertions against actual computed
  results (which frames exist, in what order, with what parameter
  values) for every scenario the Phase 4 brief lists, not just "it
  compiles." See `docs/PHASE_4_VISUALIZATION.md` → "Tests".
- No interactive browser check of the panels' visual appearance or the
  variable-change highlight animation — same sandbox limitation as every
  prior phase (no display server here). `npm run dev` on your machine is
  the first interactive check.
- Regression risk was kept deliberately small: `CodeEditor.tsx`,
  `Toolbar.tsx`, and `ConsolePanel.tsx` were not touched this phase — see
  `docs/PHASE_4_VISUALIZATION.md` → "Regression testing" for the full
  list of what was and wasn't modified.

### Known advisory / bundle-size tradeoff (carried over, unchanged)

Unchanged from Phase 1/2 — see those phases' notes. No new frontend
dependencies were added this phase.

---

## Future extension points

| Placeholder today | Becomes real in | Reference |
|---|---|---|
| Visualization tab (graphical stack/memory diagram) | Later — this phase covers the tabular data view; a boxes-and-arrows diagram is bigger scope | `docs/PHASE_4_VISUALIZATION.md` → "Layout" |
| Pointers, arrays, structs, addresses, heap | Needs a new value representation in `interpreter/values.ts` first | `docs/PHASE_4_VISUALIZATION.md` → "Known limitations" |
| Global variables | Not yet supported by the Phase 3 interpreter | `docs/PHASE_3_EXECUTION.md` |
| `ExplanationPanel`'s static line | Phase 10 | Blueprint section 1 |
| Step Back | Not scoped in any phase yet | `docs/PHASE_3_EXECUTION.md` |
| `useChangedKeys` | Generic enough to reuse anywhere else "changed since last step" matters | `docs/PHASE_4_VISUALIZATION.md` |

---

## Remaining work

Nothing from the Phase 4 brief was skipped. Every deliverable (Variables
panel, Stack visualization, conceptual Memory panel, execution-state
synchronization, variable-change indication, function-call
visualization, scope handling, tests, documentation, an unsupported-
features list) is implemented and verified as far as this sandboxed
environment allows — the one open item is the same as every prior
phase's: a live, interactive check on your own machine via `npm run dev`.
