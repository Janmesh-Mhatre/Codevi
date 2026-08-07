# Changelog

All notable changes to Codevi are documented here.

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
