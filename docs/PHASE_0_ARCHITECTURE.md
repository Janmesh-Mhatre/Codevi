# Codevi — Phase 0 Architecture & Planning Blueprint

> **Scope:** Architecture and planning only. No application code, components, or project files are included, per the Phase 0 rule. This document is the complete Phase 0 deliverable — Phase 1 begins only after approval.

## Contents
1. [Software Architecture](#1-software-architecture)
2. [Application Workflow](#2-application-workflow)
3. [Folder Structure](#3-folder-structure)
4. [Technology Justification](#4-technology-justification)
5. [Component Communication](#5-component-communication)
6. [UI Planning](#6-ui-planning)
7. [Memory Design](#7-memory-design)
8. [Execution Engine Planning](#8-execution-engine-planning)
9. [Parser Planning](#9-parser-planning)
10. [Visualization Planning](#10-visualization-planning)
11. [Scalability and Multi-Language Support](#11-scalability-and-multi-language-support)
12. [Risks and Challenges](#12-risks-and-challenges)
13. [Development Roadmap](#13-development-roadmap)

---

## 1. Software Architecture

The application is organized into eight layers. Each layer has one job, talks to its neighbors through a narrow interface, and can be tested or replaced on its own. Data flows mostly in one direction — editor → parser → execution → memory → visualization/explanation — with transport commands (run/step/pause) flowing back down from the UI.

| Layer | Purpose | Responsibilities | Inputs | Outputs | Depends On |
|---|---|---|---|---|---|
| **User Interface** | App shell and layout | Window chrome, panel docking/resizing, theming, keyboard shortcuts, routing between views | User interaction | Rendered panels, layout state | React, TypeScript, Tailwind CSS, Tauri window APIs |
| **Editor** | Code authoring surface | Syntax highlighting, line numbers, breakpoint gutter, current-line highlight, inline error markers | Source text, cursor position, breakpoint toggles, execution-position updates | Edited source, breakpoint set, cursor position | Monaco Editor, Zustand |
| **Parser** | Turn source into structured syntax data | Debounced re-parse on edit, AST construction, syntax-error detection, symbol/function/loop extraction | Raw C source | AST, symbol table, syntax diagnostics | Tree-sitter + tree-sitter-c grammar (Rust) |
| **Execution** | Drive real program execution | Compile via GCC, launch under GDB, send run/step/pause/continue/breakpoint commands, capture stdout/stderr and stop events | Compiled binary, transport commands, breakpoint list | Execution events (line hit, function entered/exited, output, exit code) | Rust, GDB (Machine Interface), GCC |
| **Memory** | Build a semantic model of program state | Parse GDB's raw stack/heap/register output into typed structures, track heap lifetime via malloc/free interception, resolve pointer targets | GDB output, symbol table (from Parser) | Structured memory snapshot: stack frames, heap blocks, globals, pointer graph | Rust, GDB/MI, Parser's symbol table |
| **Visualization** | Render state as diagrams | Draw stack frames, heap blocks, arrays, linked structures, trees; animate transitions between steps | Memory snapshot, execution event, previous-snapshot diff | Rendered diagram | React Flow, Framer Motion, D3.js (optional), Zustand |
| **Explanation** | Narrate execution in plain language | Map AST node + execution event → sentence; keep a narration history | AST node, execution event, memory diff | Explanation text | Rule-based template engine now; pluggable LLM later |
| **Future AI** (optional) | Free-form Q&A about program state | Answer questions like "why is this null?"; suggest what happens next | User question, current snapshot | Natural-language answer | External or local LLM (Phase 12, not built yet) |

**Design notes**
- The Explanation Layer is template-based in the early phases so the app has zero external dependencies and zero latency. It exposes the same interface an LLM-backed version will use later, so Phase 12 becomes a swap, not a rewrite.
- The Visualization Layer never talks to GDB directly — it only ever renders a Memory Snapshot built by the Memory Layer. This keeps rendering testable without a live debugger attached.
- Pointer resolution needs both the Memory Layer's live addresses and the Parser's static type information (a pointer's declared type, not just its numeric value), which is why the symbol table is shared downward rather than kept private to the Parser.

---

## 2. Application Workflow

```
 EDITOR
   User writes/edits C source in Monaco
        │
        ▼
 PARSER
   Tree-sitter re-parses on a debounce (Rust backend)
   → AST + symbol table + syntax diagnostics
        │
        ▼
 COMPILE
   GCC compiles with debug symbols (-g -O0)
        │
        ▼
 LAUNCH
   Rust spawns GDB, attaches via the MI protocol
        │
        ▼
 COMMAND
   User clicks Run / Step / Continue
   → Execution Controller sends a GDB/MI command
        │
        ▼
 STOP EVENT
   GDB reports a stop (breakpoint, step done, or exit)
        │
        ▼
 MEMORY PULL
   Backend queries locals, args, frames, globals
   → builds a structured Memory Snapshot
        │
        ▼
 DIFF
   Snapshot compared against the previous step, then fanned out to:
     → VISUALIZATION — React Flow + Framer Motion animate the diff
     → EXPLANATION   — the template engine turns the diff into a sentence
     → CONSOLE       — stdout/stderr from the running program, passed through
```

Each stop event runs this full loop once. A "Run" command simply lets GDB continue until the next natural stop (a breakpoint or program exit) rather than pausing after every event, while "Step" forces a stop after exactly one source line.

---

## 3. Folder Structure

```
codevi/
├── src/                       # Frontend — React + TypeScript
│   ├── components/
│   │   ├── editor/            # Monaco wrapper, gutter, decorations
│   │   ├── visualization/     # React Flow nodes/edges, custom renderers
│   │   ├── panels/            # Memory, Variable, Console, Explanation panels
│   │   ├── toolbar/
│   │   └── layout/             # Dockable panel shell
│   ├── state/                  # Zustand stores (editor, execution, memory, ui)
│   ├── services/                # Tauri command bridges (invoke wrappers)
│   ├── languages/                # Per-language adapters
│   │   └── c/                     # highlighting, explanation templates, AST adapter
│   ├── hooks/
│   ├── types/                      # Shared TS types (generated from Rust structs)
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                  # Backend — Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/            # Tauri command handlers
│   │   ├── parser/               # Tree-sitter integration, per-language grammars
│   │   ├── execution/             # GDB/MI process manager, event loop
│   │   ├── memory/                 # Memory-model builder
│   │   ├── compiler/                # GCC invocation, diagnostics parsing
│   │   └── ipc/                      # Event emitter to the frontend
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/
│   ├── unit/                   # Vitest unit tests (frontend)
│   ├── integration/             # Rust integration tests (execution engine)
│   └── fixtures/                 # Sample .c programs used by both suites
├── docs/
│   ├── architecture/            # This document and future architecture decisions
│   └── roadmap/
├── scripts/                    # Build/dev helper scripts
├── package.json
└── README.md
```

| Folder | Contents |
|---|---|
| `src/` | React + TypeScript frontend: components, state stores, Tauri service bridges, per-language adapters |
| `src-tauri/` | Rust backend: Tauri commands, parser integration, execution engine, memory-model builder, compiler invocation |
| `tests/` | Vitest unit tests, Rust integration tests, and shared `.c` fixture programs |
| `docs/` | This blueprint, future architecture-decision records, the phase-by-phase roadmap |
| `scripts/` | Local dev/build helper scripts |

---

## 4. Technology Justification

### Tauri
- **Why:** A lightweight native shell (OS webview, not bundled Chromium) with a Rust backend that can safely manage a GDB child process.
- **Advantages:** Small binary size, low memory footprint, first-class Rust interop for the execution engine.
- **Alternatives:** Electron (heavier, larger bundle, Node backend); native Qt/C++ (steeper curve, no web UI reuse).
- **Limitations:** Smaller plugin ecosystem than Electron; occasional OS-specific webview quirks (e.g., older WebView2 builds on Windows).

### React
- **Why:** A component model that maps cleanly onto an app built from independent panels.
- **Advantages:** Mature ecosystem (React Flow, Monaco wrappers), hooks fit reactive updates driven by execution events.
- **Alternatives:** Vue (thinner ecosystem here); Svelte (less mature tooling for complex visualization libraries).
- **Limitations:** Needs disciplined state management at this scale (addressed by Zustand); risk of over-rendering without memoization.

### TypeScript
- **Why:** Type safety across data shapes that mirror Rust structs (AST nodes, memory snapshots).
- **Advantages:** Safer refactors, self-documenting interfaces, strong editor support.
- **Alternatives:** Plain JavaScript (faster start, error-prone at scale).
- **Limitations:** Extra build step; occasional friction with untyped third-party packages.

### Tailwind CSS
- **Why:** Fast, consistent styling across many small panels without hand-rolled CSS sprawl.
- **Advantages:** Utility classes speed up iteration; consistent design tokens; unused styles purged from the build.
- **Alternatives:** CSS Modules (more boilerplate); styled-components (runtime cost).
- **Limitations:** Long class lists in JSX; a learning curve for utility-first styling.

### Monaco Editor
- **Why:** The same editor engine as VS Code — familiar to most users — with the decoration APIs this app needs (current-line highlight, breakpoint glyphs).
- **Advantages:** Mature, well-documented, built-in gutter/decoration support.
- **Alternatives:** CodeMirror 6 (lighter, less built-in tooling); Ace (older, smaller community today).
- **Limitations:** Larger bundle size; some setup complexity outside of VS Code itself.

### Tree-sitter
- **Why:** Fast, incremental, error-tolerant parsing suited to live typing, with grammars available for C and the languages planned for later phases.
- **Advantages:** Only the edited region is reparsed; tolerates mid-edit syntax errors; the same query-based extraction pattern works across languages.
- **Alternatives:** A hand-written recursive-descent parser (full control, high per-language cost); ANTLR (heavier runtime, less suited to editor-time reparsing).
- **Limitations:** Gives syntax, not semantics — type resolution is a separate step; occasional grammar edge cases need custom queries.

### GDB
- **Why:** A mature, scriptable debugger that already does what's needed — breakpoints, stepping, memory/register inspection — via its Machine Interface (MI), avoiding a custom C interpreter.
- **Advantages:** Correctness (the real compiled binary runs under real OS semantics); a documented MI protocol; works directly with GCC's debug info.
- **Alternatives:** LLDB (viable, different MI-equivalent protocol); a custom bytecode interpreter for C (large effort, risks diverging from real semantics).
- **Limitations:** Must be installed or bundled per OS; MI output parsing has edge cases; line-level stepping doesn't always match one "visual step" for compound statements.

### React Flow
- **Why:** Purpose-built for node-and-edge diagrams — exactly what stack frames, heap blocks, and pointer arrows are.
- **Advantages:** Built-in pan/zoom, fully custom node renderers, edge routing for pointer arrows.
- **Alternatives:** Raw D3 for everything (more control, far more manual layout work); Cytoscape.js (viable, less React-idiomatic).
- **Limitations:** Default layout needs augmentation for memory-specific semantics like stack growth direction.

### Framer Motion
- **Why:** Smooth, declarative animation for the state transitions central to the app's teaching goal.
- **Advantages:** Simple mount/unmount animation, layout animations that fit a reflowing memory diagram.
- **Alternatives:** Plain CSS transitions (fine for simple cases, harder to orchestrate); GSAP (powerful, but a second animation paradigm alongside React).
- **Limitations:** Adds bundle size; needs care so animation queues don't lag behind fast stepping.

### D3.js (optional)
- **Why:** For bespoke visualizations React Flow doesn't handle natively — tree layouts, custom traversal highlighting.
- **Advantages:** Full control over layout and rendering; a large library of layout algorithms.
- **Alternatives:** Extending React Flow's custom-node system only (simpler, less flexible for structure-specific layouts).
- **Limitations:** Its imperative DOM style needs a careful wrapper to coexist with React's declarative model.

### Rust
- **Why:** The backend needs process control, performance, and memory safety while handling arbitrary user code paths.
- **Advantages:** Safety without garbage-collection pauses; excellent Tauri integration; strong concurrency primitives for the GDB event loop.
- **Alternatives:** A Node.js backend (simpler for JS developers, weaker at systems-level process control); Go (good concurrency, weaker native Tauri support).
- **Limitations:** Steeper learning curve; slower prototyping speed than a scripting language.

### Zustand
- **Why:** Lightweight global state without Redux-style boilerplate — a good fit for several panels reacting to one shared execution state.
- **Advantages:** Minimal API, solid TypeScript support, no provider ceremony.
- **Alternatives:** Redux Toolkit (more structure, heavier for this scale); Context + useReducer (unwieldy here); Jotai/Recoil (comparable, smaller ecosystem).
- **Limitations:** Less opinionated structure can drift into ad-hoc store organization without discipline.

### Git
- **Why:** Standard version control, and a natural fit for a phased roadmap.
- **Advantages:** Universal tooling, mature branching model.
- **Alternatives:** Mercurial (smaller ecosystem today).
- **Limitations:** None specific to this project.

### Vitest
- **Why:** A fast, Vite-native test runner with a Jest-compatible API — a natural fit for a Vite-based React frontend.
- **Advantages:** Fast watch mode, native ESM/TypeScript support, snapshot testing for visualization components.
- **Alternatives:** Jest (slower with ESM/TS, more configuration); Playwright/Cypress (complementary end-to-end testing, not a unit-test substitute).
- **Limitations:** Newer than Jest, occasional plugin-ecosystem gaps; the Rust backend still needs its own `cargo test` suite.

---

## 5. Component Communication

Three communication boundaries cover the whole app:

```
Frontend  ⇄  Tauri IPC  ⇄  Rust Backend  ⇄  GDB  ⇄  Compiled C Binary
```
- **Frontend** — React components + the Zustand store
- **Tauri IPC** — `invoke` for commands, `listen` for events
- **Rust Backend** — execution engine, memory-model builder, parser
- **GDB** — driven via the Machine Interface (MI) protocol over stdin/stdout
- **Compiled C Binary** — the running program under test (the "inferior process," in debugger terminology)

**1. Frontend ↔ Backend.** The frontend calls backend commands — load-and-compile source, set a breakpoint, step, run, pause, reset — and listens for backend-emitted events: an execution-stopped event carrying the line and reason, a memory-snapshot event, a program-output event for stdout/stderr, and a program-exited event carrying the exit code. Commands are request/response; events are push-based, since execution state can change without the frontend asking.

**2. Backend ↔ GDB.** An async Rust task owns GDB's stdin/stdout as a single writer, so MI commands are never interleaved out of order. Responses and stop notifications are parsed off GDB's stdout and forwarded through an internal channel to the component that emits Tauri events — the rest of the backend never talks to GDB directly.

**3. Frontend internal.** Zustand is the single source of truth. Panels subscribe only to the state slices they need — the Console only cares about output events; the Visualization Panel derives its nodes/edges from the memory snapshot through a memoized selector rather than keeping its own copy of state that could drift.

**Keeping both sides honest.** Because the AST, memory snapshot, and execution events all cross the Rust ↔ TypeScript boundary, their shapes should come from one source of truth — the Rust struct definitions — via a type-generation crate (such as `specta` or `ts-rs`) rather than hand-maintained, duplicate type definitions on each side.

---

## 6. UI Planning

```
──────────────────────────────────────────────────────────
 TOOLBAR
 Open · Save   |   ▶ Run · ⏭ Step · ⏸ Pause · ↺ Reset   |   Language: C ▾
──────────────────────────────────────────────────────────
 CODE EDITOR (Monaco)               │  VISUALIZATION PANEL
 - syntax highlighting               │  stack / heap / globals
 - breakpoint gutter                 │  as an animated graph
 - current-line highlight            │
                                     ├─────────────────────────
                                     │  VARIABLE PANEL │ MEMORY PANEL
                                     │  named values   │ raw addresses
──────────────────────────────────────────────────────────
 EXPLANATION PANEL
 "Entering function factorial(4)..."
──────────────────────────────────────────────────────────
 CONSOLE — program stdout / stderr
──────────────────────────────────────────────────────────
 EXECUTION CONTROLS
 Run · Step Over · Step Into · Pause · Reset
──────────────────────────────────────────────────────────
```

| Element | Purpose | Key Interactions |
|---|---|---|
| Toolbar | File operations and language selection | Open, Save; a language selector (only "C" active through Phase 11) |
| Code Editor | Author and read C source | Typing, breakpoint toggle on gutter click, current-line highlight during execution |
| Visualization Panel | Primary graph view of program state | Pan/zoom the stack/heap/globals graph; click a node to focus the matching Variable/Memory entry |
| Memory Panel | Raw, address-level view | Hex addresses and byte-level values, for users who want the "real" debugger view |
| Variable Panel | Simplified, named-value view | Live values by name, grouped by scope — the beginner-friendly counterpart to the Memory Panel |
| Console | Program input/output | Displays stdout/stderr; scrolls as output arrives |
| Explanation Panel | Plain-language narration | One sentence per executed step; a scrollable history |
| Execution Controls | Transport controls | Run, Step Over, Step Into, Pause, Reset; a speed control for auto-play stepping |

---

## 7. Memory Design

| Concept | Representation | Data Source |
|---|---|---|
| Stack | An ordered list of frames; each holds function name, locals, arguments, and a link to its caller | `-stack-list-frames`, `-stack-list-locals`, `-stack-list-arguments` |
| Heap | A list of blocks: address, size, allocation site, freed flag | Internal breakpoints on `malloc`/`calloc`/`realloc`/`free`, reading arguments and return values |
| Global Memory | Static-storage-duration variables, read once at load and refreshed on every stop | Symbol table (Parser) + GDB memory reads keyed by address |
| Local Variables | Per-frame name/type/value/address, diffed against the previous step | GDB variable objects (`-var-create` / `-var-update`) |
| Memory Addresses | Hex by default, with a symbolic mode (e.g., *frame #2, offset +8*) for beginners | GDB memory/register output |
| Pointers | A directed arrow from the pointer's box to its target's; null shown as a distinct terminator; dangling pointers (target already freed) shown as a dashed, differently colored arrow | Comparing a pointer's value against the live heap-block list |

**Design notes**
- The stack is drawn newest-frame-first — the direction most learners expect — even though real stack addresses usually grow the other way. This is a deliberate pedagogical choice, not a technical constraint.
- ASLR (address space layout randomization) makes raw addresses inconsistent between runs; the backend disables it for the debugged process (`set disable-randomization on`) so a session's addresses stay stable, while the UI still defaults to the symbolic mode rather than asking learners to read raw hex.
- A dangling pointer is one of the most important bugs to *see* happen rather than just be told about, which is why it gets distinct visual treatment instead of quietly rendering an arrow to nothing.

---

## 8. Execution Engine Planning

| Feature | Mechanism | Notes |
|---|---|---|
| Run | `-exec-run` | Compiles first if source changed; runs to completion or the first breakpoint |
| Step (Into) | `-exec-step` | Source-line granularity; enters function calls |
| Step (Over) | `-exec-next` | Source-line granularity; does not enter function calls |
| Pause | `-exec-interrupt` | Works on a freely running program, before it hits a breakpoint |
| Resume | `-exec-continue` | Continues from the current stop point |
| Reset | Kill the current inferior, relaunch GDB, clear memory/visualization state | Breakpoints persist across a reset, since users expect to keep iterating on the same ones |
| Breakpoints | `-break-insert <line>` / `-break-delete` | Gutter clicks map to line-based inserts; each keeps a stable ID so toggling maps correctly |
| Variable updates | GDB variable objects (`-var-create`, then `-var-update` after each stop) | Purpose-built for incremental change tracking — only changed values are reported, which drives the "highlight what changed" animation |
| Call stack updates | `-stack-list-frames` after every stop | Comparing frame depth/IDs against the previous stop distinguishes a "function entered" push from a "function returned" pop |

---

## 9. Parser Planning

| Tree-sitter Target | What It Extracts | What It Enables |
|---|---|---|
| AST (overall) | The full concrete syntax tree, wrapped by a thin adapter into a simplified AST | A stable, app-specific tree the Explanation Layer can walk without depending on raw grammar internals |
| Variables | Declaration and initializer nodes → name, type, declared line, scope | The Variable Panel and Memory Layer know what should exist before execution starts |
| Functions | Function-definition nodes → name, parameters, return type, body range | Maps a call-stack frame back to its exact source region; lets the Explanation Layer say "you're inside `factorial`" |
| Loops | For/while/do-while nodes → condition and body ranges | Lets the Explanation Layer say "entering loop iteration 3" by matching the current line to a loop's body range |
| Conditions | If/else nodes and the expressions inside them | Lets the Explanation Layer narrate what a condition evaluated to, not just which branch was taken |
| Pointers | Pointer-declarator nodes, plus dereference (`*`) and address-of (`&`) expressions | Tells the Memory and Visualization Layers to draw an arrow instead of a plain value box |

**Design notes**
- Extraction uses Tree-sitter's query language rather than manually walking every node type by hand — the same approach most editor tooling built on Tree-sitter uses, and the reason adding a second language later means writing a new query file, not a new parser engine.
- Parsing runs on a short debounce after each keystroke, not on every keystroke, so editor input latency stays independent of parse cost.

---

## 10. Visualization Planning

- **Variable creation** — a new box fades and scales in the moment its declaration line executes; it shows an explicit "uninitialized" placeholder until an initializer actually runs, rather than silently defaulting to zero, since real uninitialized C locals hold garbage values.
- **Memory allocation (heap)** — a new block animates into the heap region with a size label; on `free`, the block fades to a grey "freed" ghost briefly before disappearing, so learners see the memory become invalid rather than instantly vanish.
- **Function calls** — a new frame slides onto the visual stack on entry and slides off on return; a return value animates from the popped frame into the caller's assignment target, so what the function gave back is visible, not just implied.
- **Pointer movement** — the arrow's endpoint tweens from its old target to its new one on reassignment, instead of snapping instantly.
- **Arrays** — a contiguous row of boxes with index labels, reinforcing that elements sit next to each other in memory; a written element flashes briefly.
- **Linked lists** — each node is a small box with a data field and a `next` arrow to the following node (or a null terminator); traversal highlights the "current" node step by step.
- **Trees** — a D3-driven hierarchical layout with parent-child edges; traversal order (pre/in/post-order) highlights step by step, and rebalancing operations animate node repositioning rather than jumping.

---

## 11. Scalability and Multi-Language Support

Every language-specific behavior is isolated behind one conceptual contract, so a new language is a new adapter, not a change to the core engine. Each adapter supplies:

- **A grammar reference** — which Tree-sitter grammar to load for this language
- **A prepare step** — how source becomes runnable (compile for C/C++/Java; nothing needed for an interpreted language)
- **An execution backend** — which debugger or protocol drives stepping
- **A memory-model mapper** — how that language's runtime state becomes the app's common visualization model
- **Explanation templates** — language-specific phrasing for the narration engine

| Language | Execution Backend | Memory-Model Shift |
|---|---|---|
| C / C++ | GDB via MI (C++ swaps in the tree-sitter-cpp grammar) | Same stack/heap story; C++ adds object layout and, later, vtables |
| Java | JDWP (Java Debug Wire Protocol) | A managed heap — objects and garbage collection, not manual malloc/free |
| Python | A tracer built on `sys.settrace` / the `bdb` module | Everything is a reference to a heap object; no raw pointer/stack story in the C sense |
| JavaScript | Chrome DevTools Protocol via Node's inspector | Reference/heap-based, plus closures capturing variables, which need their own visual treatment |

**Design note:** the parser and execution backend are the easy parts to swap. The real scalability risk is that C's stack/heap dichotomy doesn't exist in Python, Java, or JavaScript — they're all reference-and-heap languages underneath. The Visualization and Explanation Layers both need a per-language memory *metaphor*, not just a per-language parser, which is why the memory-model mapper is its own piece of the adapter contract rather than folded into execution.

---

## 12. Risks and Challenges

| Risk | Impact | Mitigation |
|---|---|---|
| GDB/MI output varies across versions and platforms | Parsing breaks silently on some machines | Pin a tested GDB version; isolate all MI parsing behind one module with test fixtures |
| One source line can hold multiple sub-operations | "Step" doesn't map cleanly to one visual event | Treat a line step as the atomic unit for the MVP; describe compound lines as a single combined sentence; consider expression-level sub-stepping later |
| Undefined behavior in user code | Nondeterministic results confuse a learner expecting repeatable behavior | Compile with `-O0`, enable AddressSanitizer/UndefinedBehaviorSanitizer, and surface detected UB explicitly instead of visualizing garbage as meaningful |
| Windows lacks GCC/GDB by default | The app doesn't run out of the box on Windows | Bundle a MinGW-w64 toolchain (or a Tauri sidecar binary) |
| Executing arbitrary compiled code is inherently unrestricted | A future "share/import code" feature would need real sandboxing | Out of scope while the app only runs the user's own local code; flagged now so it isn't missed later |
| Re-fetching full memory state on every step | Sluggish UI on large arrays or deep recursion | Incremental diffs via GDB variable objects; virtualized rendering; pagination for deep call stacks |
| Real addresses are ASLR-randomized | Confusing, non-reproducible hex values | Disable ASLR for the debugged process; default the UI to symbolic addressing |
| Getting the memory-model mapper wrong early | A costly rewrite when a second language is added | Sketch the Python or Java mapping on paper during Phase 0/1 to stress-test that the adapter contract generalizes |
| Editor and animation libraries add to bundle size | Slow startup on lower-end machines | Lazy-load visualization/animation code only once a visualization panel is shown; track a startup budget from Phase 1 |
| Fourteen phases is a large scope | Scope creep, stalled progress | Ship a complete C-only tool through Phase 11 before Phase 12 or 13 start; each phase closes against its own success criteria |

---

## 13. Development Roadmap

| Phase | Objective | Key Deliverables | Dependencies | Success Criteria | Complexity |
|---|---|---|---|---|---|
| 1. Project Setup | Stand up the base app shell | Tauri+React+TS scaffold, Tailwind config, empty panel layout, single-OS CI build | None | App launches; empty window renders on the target OS | Low |
| 2. Parser | Parse C source into an AST and symbol table | Tree-sitter-c integrated in the Rust backend, syntax-error reporting to the editor | Phase 1 | Sample .c files parse correctly; syntax errors surface as editor markers | Medium |
| 3. Execution Engine | Compile and run real C code under GDB | GCC invocation, GDB/MI process manager, run/step/pause/continue/reset, event emitter | Phases 1–2 | Step/run/pause reliably control a real binary; stop events reach the frontend | High |
| 4. Memory Visualization | Render a basic stack/heap/global graph | Memory Model builder, base React Flow canvas, static (non-animated) rendering | Phase 3 | Stack frames, globals, and heap blocks render correctly for simple programs | High |
| 5. Variable Tracking | Live variable value updates | Variable Panel, per-step value diffing, uninitialized-value display | Phases 3–4 | Values update correctly after each step, including uninitialized state | Medium |
| 6. Function & Call Stack | Visualize calls and returns | Push/pop animation, return-value flow animation, recursion support | Phases 4–5 | Nested/recursive calls animate correctly; call-stack depth matches reality | Medium |
| 7. Pointer Visualization | Visualize pointers as arrows | Pointer edges, null/dangling states, address-of/dereference highlighting | Phases 4–5 | Reassignment animates arrow movement; dangling pointers flag correctly after free | High |
| 8. Data Structures | Visualize arrays, linked lists, trees | Array grid renderer, linked-list chain renderer, D3-based tree layout | Phase 7 | Array, singly linked list, and BST render and update correctly | High |
| 9. Algorithms | Step-through visualization for common algorithms | Highlighted traversal/sort/search animations, algorithm-aware explanation templates | Phase 8 | Sorting/searching/traversal demos run with correct step-by-step highlighting | Medium |
| 10. Explanation Engine | Natural-language narration of execution | Template-based sentence generator, narration history panel | Phases 2, 6, 7 | Every stepped line produces an accurate, readable sentence | Medium |
| 11. Debugging Tools | Power-user debugging features | Conditional breakpoints, watch expressions, memory search/inspect view | Phases 3–10 | Advanced users can set conditional breaks and inspect raw memory reliably | Medium |
| 12. AI Integration (Optional) | Conversational Q&A about program state | Pluggable LLM interface, prompt templates fed by the current snapshot | Phase 10 | User can ask "why is this null?" and get a relevant, correct-enough answer | High |
| 13. Multi-language Support | Add C++, Java, Python, JS adapters | LanguageAdapter implementations, per-language memory-model mapping | Phases 1–11 stable | At least one additional language runs end-to-end through the same UI | Very High |
| 14. Optimization, Testing & Release | Harden, test, package for release | Full Vitest/cargo test coverage, performance profiling, installers per OS, docs | All prior phases | Test suite passes; runs smoothly on target hardware; installable on Win/Mac/Linux | Medium |

---

## Summary & Next Step

This blueprint covers all thirteen requested areas: architecture, workflow, folder structure, technology rationale, communication model, UI layout, memory design, execution engine, parser usage, visualization/animation design, multi-language scalability, risks, and a 14-phase roadmap.

No application code, project scaffolding, or implementation files were created, per the Phase 0 rule.

**Awaiting your approval before starting Phase 1 (Project Setup).**
