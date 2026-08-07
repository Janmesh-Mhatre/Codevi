# Codevi

An offline desktop tool for visualizing how C programs execute — built with
Tauri, React, TypeScript, and Rust. See `docs/PHASE_0_ARCHITECTURE.md` for
the full architectural blueprint this project is built from.

**Status: Phase 2 — Parser Integration complete.** The editor now parses C
source in real time using Tree-sitter, displays an interactive AST viewer,
and shows syntax diagnostics inline. All Phase 1 UI features remain fully
operational. See [What's implemented](#whats-implemented) below.

---

## Setup instructions

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later, and npm
- [Rust](https://www.rust-lang.org/tools/install) — install via `rustup`,
  **not** your OS package manager. Tauri's current dependency tree needs a
  reasonably recent stable toolchain (edition 2024 support, i.e. rustc
  1.85+); older distro-packaged versions of `rustc`/`cargo` (Ubuntu's apt
  package is 1.75, for example) are too old and will fail to build.
- Platform build tools for Tauri — follow the
  [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for
  your OS. On Linux this means `webkit2gtk`, `librsvg2`, and a few others;
  on macOS, Xcode Command Line Tools; on Windows, the WebView2 runtime
  (preinstalled on modern Windows) and the MSVC build tools.

### Install and run

```bash
npm install
npm run tauri dev    # launches the desktop app with hot reload
```

### Build a release binary

```bash
npm run tauri build
```

### Frontend-only commands

Useful when working on UI without the native shell:

```bash
npm run dev        # Vite dev server only, in a regular browser tab
npm run build       # tsc + production frontend build (what `tauri build` runs internally)
```

---

## What's implemented

### Phase 1 — Project Foundation

| Area | Status |
|---|---|
| Tauri + React + TypeScript + Tailwind + Rust project, initialized via `create-tauri-app` | done |
| Folder structure from the Phase 0 blueprint, with placeholder modules | done |
| Main window (1440×900, 1024×700 minimum, centered) | done |
| Workbench layout: Toolbar, Code Editor, Visualization/Variable/Memory panels, Explanation bar, Console | done |
| Monaco Editor: C syntax highlighting, line numbers, editable text, light/dark themes | done |
| Smart-edit handlers: bracket pair auto-close, smart backspace, angle-bracket `#include` completion | done |
| Toolbar placeholder buttons (Open File, Save File, Run, Pause, Step Forward, Step Back, Reset, Settings) → toast | done |
| Console showing `Ready.` | done |
| Zustand stores: editor (live), UI (live), execution/memory/visualization (typed placeholders) | done |
| Dark mode / light mode, preference persisted locally | done |
| Reusable error dialog component | done |
| Logging utility | done |

### Phase 2 — Parser Integration

| Area | Status |
|---|---|
| Tree-sitter WASM runtime (`web-tree-sitter`) + C grammar (`tree-sitter-c`) — bundled offline | done |
| Parser service: `initParser()`, `parseSource()`, `getNodeAtPosition()`, incremental parsing | done |
| AST type system: `AstNode`, `SyntaxDiagnostic`, `ParseResult` — serializable, framework-independent | done |
| AST conversion: Tree-sitter nodes → plain `AstNode` tree + diagnostic collection | done |
| Parser Zustand store: status, AST, diagnostics, parse timing | done |
| `useCParser` hook: parser lifecycle, debounced re-parse on code change (120ms) | done |
| AST Viewer panel: expandable tree view with node count, parse time, incremental/full indicator | done |
| AST/Visualization tab group: two-tab switcher in the top-right slot | done |
| Console: parser status + syntax diagnostics (line, column, message) | done |
| Editor: inline diagnostic markers (red squiggly underlines) via Monaco markers API | done |
| Monaco ↔ Tree-sitter coordinate translation (1-based → 0-based) | done |

---

## Folder structure

```
codevi/
├── src/                        # Frontend — React + TypeScript
│   ├── components/
│   │   ├── layout/AppShell.tsx      # Composes the whole workbench layout
│   │   ├── toolbar/Toolbar.tsx      # File/execution/settings buttons + theme toggle
│   │   ├── editor/CodeEditor.tsx    # Monaco wrapper, offline-configured, parser integration
│   │   ├── panels/                  # Visualization, AST Viewer, Variable, Memory, Explanation, Console
│   │   └── common/                  # ErrorDialog, Toast, PanelShell, Tabs
│   ├── state/                  # One Zustand store per domain
│   ├── services/               # parserService.ts — Tree-sitter WASM init + parsing
│   ├── languages/c/            # AST types + conversion utilities
│   ├── hooks/                  # useTheme.ts, useCParser.ts
│   ├── types/index.ts          # Shared types
│   ├── utils/logger.ts         # Scoped console logger
│   ├── index.css               # Tailwind v4 entry point + design tokens
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                  # Backend — Rust
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   └── lib.rs              # Window/plugin setup
│   ├── capabilities/           # Tauri v2 permissions
│   ├── Cargo.toml
│   └── tauri.conf.json         # Window size/title, bundle icons
├── docs/
│   ├── PHASE_0_ARCHITECTURE.md # The approved Phase 0 blueprint
│   ├── PHASE_2_PARSER.md       # Phase 2 design decisions + AST flow
│   ├── ARCHITECTURE.md         # High-level architecture summary
│   ├── ROADMAP.md              # Development phases
│   ├── PROJECT_CONTEXT.md      # Project rules and context
│   ├── DEVELOPMENT_GUIDELINES.md # Coding standards
│   └── CHANGELOG.md            # Phase-by-phase changelog
├── .env.example                # Documents VITE_LOG_LEVEL and TAURI_DEV_HOST
├── CHANGELOG.md                # Root changelog
└── package.json
```

---

## Component hierarchy

```
App
+- AppShell                          (src/components/layout)
   +- Toolbar                        (src/components/toolbar)
   +- CodeEditor                     (src/components/editor)
   +- Tabs (AST | Visualization)     (src/components/common)
   |  +- AstViewerPanel              (src/components/panels)
   |  |  +- AstTreeNode              (src/components/panels)
   |  +- VisualizationPanel          (src/components/panels)
   +- VariablePanel                  (src/components/panels)
   +- MemoryPanel                    (src/components/panels)
   +- ExplanationPanel               (src/components/panels)
   +- ConsolePanel                   (src/components/panels)
   +- ErrorDialog                    (src/components/common)
   +- Toast                          (src/components/common)

Shared, non-visual:
   PanelShell                        (src/components/common) - used by VariablePanel, MemoryPanel
```

---

## State management

| Store | File | Status |
|---|---|---|
| Editor | `state/editorStore.ts` | **Live** — holds the source buffer |
| UI | `state/uiStore.ts` | **Live** — theme (persisted), toasts, error dialog |
| Parser | `state/parserStore.ts` | **Live** — parser status, AST, diagnostics, parse timing |
| Execution | `state/executionStore.ts` | Placeholder — typed, unused; Phase 3 writes to it |
| Memory | `state/memoryStore.ts` | Placeholder — typed, unused; Phase 4 writes to it |
| Visualization | `state/visualizationStore.ts` | Placeholder — typed, unused; Phase 4 writes to it |

---

## Design system

The visual language ("Blueprint") borrows from schematic drawings and
terminal readouts rather than a generic app look, since the whole product
is about making memory and execution visible. Two accents carry all the
meaning: a blueprint blue for static structure, amber for whatever is
currently active — everything else stays quiet. The empty Visualization
Panel carries a faint blueprint-grid background as the one deliberate
signature touch.

- **Type:** IBM Plex Sans (UI) + IBM Plex Mono (code/data), self-hosted via
  `@fontsource/*` packages — bundled into the build, not loaded from a
  CDN, so the app stays usable fully offline.
- **Color/theme:** Tailwind v4 `@theme` tokens in `src/index.css`,
  redefined inside a `.dark` class block; `useTheme()` toggles that class
  based on `uiStore.theme`. See that file's comments for the full token
  list.
- **Editor theme:** Monaco is given two custom themes (`cv-dark`/
  `cv-light`) matching the same tokens, defined in `CodeEditor.tsx`,
  so the editor doesn't look like a bolted-on default.

---

## Roadmap

| Phase | Description | Status |
|---|---|---|
| 0 | Architecture & Planning | ✅ Complete |
| 1 | Project Foundation | ✅ Complete |
| 2 | Parser Integration | ✅ Complete |
| 3 | Execution Engine | Planned |
| 4 | Memory Visualization | Planned |
| 5 | Variable Tracking & Call Stack | Planned |
| 6 | Pointer Visualization | Planned |
| 7 | Data Structure Visualization | Planned |
| 8 | Algorithm Visualization | Planned |
| 9 | Explanation Engine | Planned |
| 10 | Debugging Tools | Planned |
| 11 | AI Integration (Optional) | Planned |
| 12 | Multi-language Support | Planned |
| 13 | Optimization & Final Release | Planned |

---

## Future extension points

Each of these is a placeholder today with a real destination already
designed in the Phase 0 blueprint:

| Placeholder today | Becomes real in | Design reference |
|---|---|---|
| `state/executionStore.ts` | Phase 3 — Execution Engine | Blueprint section 8 |
| `state/memoryStore.ts`, `MemoryPanel`, `VariablePanel` | Phase 4/5 — Memory Visualization, Variable Tracking | Blueprint section 7 |
| `state/visualizationStore.ts`, `VisualizationPanel` | Phase 4 onward — Memory Visualization, Data Structures | Blueprint section 10 |
| `ExplanationPanel`'s static line | Phase 10 — Explanation Engine | Blueprint section 1 (Explanation Layer) |
| `parserService.getNodeAtPosition()` | Phase 3 — maps GDB stop line to AST node | Blueprint section 9 |
| Toolbar's Open/Save/Run/Pause/Step/Reset buttons | Phase 2-3 and beyond | Blueprint section 8 |
| Toolbar's Settings button | Not yet scoped in any phase | - |

---

## Validation notes

- `npx tsc --noEmit` — passes, no type errors.
- `npm run build` — passes; produces a working production frontend bundle.
- `npm run dev` — Vite dev server starts successfully; editor, AST viewer,
  console, and all panels load correctly.
- Tree-sitter WASM files (`web-tree-sitter.wasm`, `tree-sitter-c.wasm`)
  are bundled offline via Vite's `?url` imports — no CDN dependency.

### Known advisory

`npm audit` flags a moderate-severity DOMPurify issue pulled in
transitively by `monaco-editor`. Worth revisiting in Phase 13
(Optimization & Final Release).

### Known bundle-size tradeoff

`monaco-editor` is imported as the full package, and `web-tree-sitter` +
`tree-sitter-c` add ~809 KB of WASM. Bundle-size trimming is scoped to
Phase 13 — for a single-user offline desktop app, install size is a
materially different cost than for a website.
