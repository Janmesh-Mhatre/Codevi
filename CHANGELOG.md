# Changelog

All notable changes to Codevi are documented here.

---

## Phase 6 — Pointer Visualization & Comprehensive Memory Model

### Added
- Interactive SVG **Pointer View** panel (`src/components/panels/PointerViewPanel.tsx`): graph showing stack variables on the left, heap allocations on the right, NULL node, and animated directional connectors.
- Outward curved stack-to-stack connector routing with tiered bezier paths that cleanly approach target cards from the right without intersecting card bodies.
- Simulated pointer location display: `printf("%p\n", p)` prints target address (e.g. `S001`), `printf("%p\n", &p)` prints pointer's own stack address (e.g. `S002`).
- Simulated address badges (`@S001`, `@S002`) displayed in the Variables panel and Pointer View cards.
- Pointer detail inspection sidebar displaying pointer name, own address, target address/name, region, status (`valid`, `null`, `freed`, `invalid`), and pointer chain depth.
- Array initialization slot value extraction in `ExecutionEngine.ts` displaying individual element values (`[0]=10, [1]=20, ...`) in Variables and Memory panels.
- Address-of array elements (`&arr[i]`) producing pointers with slot offsets.
- Pointer arithmetic on array elements and heap blocks (`++`, `--`, `+=`, `-=`).
- Pointer difference subtraction (`q - p`) with same-object validation and `%ld` printf specifier.
- 9-theme design system selector (Dark Modern, Light Modern, One Dark Pro, GitHub Dark, Tokyo Night, Catppuccin Mocha, Dracula, Nord, Ayu Mirage) with localStorage persistence and Monaco Editor sync.
- 110+ new automated tests across `phase6Pointers.test.ts`, `phase6Arrays.test.ts`, `phase6PointerLocations.test.ts`, and theme tests, bringing total test suite to 206 tests.
- Phase 6 design and architecture documentation (`docs/phases/PHASE_6_POINTER_VISUALIZATION.md`).

### Changed
- `VariablePanel.tsx`: enhanced to show variable locations (`@address`), pointer targets, and array slot values.
- `MemoryPanel.tsx`: extended with pointer chain resolution (`pp → p → x`).
- `CodeEditor.tsx`: fixed caret alignment drift via font remeasurement and layout sync.

---

## Phase 5 — Pointers & Dynamic Memory

### Added
- Simulated address space model (`src/memory/memory.ts`) with deterministic stack (`S001`) and heap (`H001`) identifiers.
- Pointer support: `&` (address-of), `*` (dereference read/write), pointer-to-pointer (`int **`), NULL initialization & comparison.
- Dynamic memory management: `malloc`, `calloc`, `realloc`, `free` (including safe `free(NULL)`).
- Memory safety diagnostics: use-after-free and double-free detection.
- `sizeof` evaluation for basic types and expressions.
- Extended Memory panel showing stack variables, heap blocks (active and freed), and allocation origins.
- 29 unit tests covering pointer operations and dynamic memory safety.
- Phase 5 design documentation (`docs/phases/PHASE_5_POINTERS.md`).

---

## Phase 4.1 — Basic C Standard I/O

### Added
- Standard I/O support (`src/stdlib/stdio.ts`): `printf`, `scanf`, `puts`, `putchar`, `getchar`.
- Format specifiers: `%d`, `%i`, `%c`, `%s`, `%f`, `%p`, `%ld`.
- Interactive input requests pausing generator execution for user input in Console.
- 13 stdio interpreter tests.
- Phase 4.1 documentation (`docs/phases/PHASE_4_1_STDIO.md`).

---

## Phase 4 — Memory, Variables & Stack Visualization

### Added
- Call stack tracking and frame visualization (`StackPanel.tsx`).
- Active frame local and parameter variable inspection (`VariablePanel.tsx`).
- Execution change highlighting (`useChangedKeys.ts`).
- Phase 4 documentation (`docs/phases/PHASE_4_VISUALIZATION.md`).

---

## Phase 3 — Execution Engine

### Added
- In-browser generator-based C AST interpreter (`src/interpreter/interpreter.ts`).
- Execution controls: Run, Pause, Step Forward, Step Into, Reset.
- Variable scope management (`src/interpreter/scope.ts`).
- Phase 3 documentation (`docs/phases/PHASE_3_EXECUTION.md`).

---

## Phase 2 — Parser Integration

**Merged into Phase 1 foundation.**

### Added
- Tree-sitter WASM runtime (`web-tree-sitter`) and C grammar (`tree-sitter-c`) — bundled offline
- Parser service (`src/services/parserService.ts`): `initParser()`, `parseSource()`, `getNodeAtPosition()`, incremental parsing support
- AST type definitions (`src/languages/c/astTypes.ts`): `AstNode`, `SyntaxDiagnostic`, `ParseResult`
- AST conversion utilities (`src/languages/c/astConvert.ts`): Tree-sitter → serializable AST, diagnostic collection, node counting
- Parser Zustand store (`src/state/parserStore.ts`): status, AST, diagnostics, parse timing
- `useCParser` hook (`src/hooks/useCParser.ts`): parser lifecycle management, debounced re-parse (120ms)
- AST Viewer panel (`src/components/panels/AstViewerPanel.tsx`): expandable tree view with stats
- AST tree node component (`src/components/panels/AstTreeNode.tsx`): recursive expand/collapse
- Tabs component (`src/components/common/Tabs.tsx`): generic tab switcher
- Phase 2 design documentation (`docs/PHASE_2_PARSER.md`)

### Changed
- `ConsolePanel`: now shows parser status and syntax diagnostics (still shows "Ready." when idle)
- `VisualizationPanel`: removed `PanelShell` wrapper (now lives inside Tabs container)
- `AppShell`: Visualization slot replaced with AST/Visualization tab group
- `CodeEditor`: added parser integration (useCParser hook, diagnostic markers, coordinate translation) while preserving all Phase 1 smart-edit handlers

### Dependencies Added
- `web-tree-sitter` ^0.26.11
- `tree-sitter-c` ^0.24.1

---

## Phase 1 — Project Foundation

### Added
- Tauri + React + TypeScript + Tailwind CSS + Rust project structure
- Monaco Editor with C syntax highlighting, offline configuration
- Smart-edit handlers: bracket pair auto-close, smart backspace, angle-bracket `#include` completion
- Workbench layout: Toolbar, Editor, Visualization, Variable, Memory, Explanation, Console panels
- Zustand state management: editor, UI, execution (placeholder), memory (placeholder), visualization (placeholder)
- Dark/light theme with persistence
- IBM Plex Sans + IBM Plex Mono fonts (self-hosted, offline)
- Error dialog and toast notification components
- Scoped logging utility
- Blueprint design system

---

## Phase 0 — Architecture & Planning

### Added
- Full architectural blueprint (`docs/PHASE_0_ARCHITECTURE.md`)
- 14-phase development roadmap
- Project governance documentation

---

Continue updating this file after every completed phase.
