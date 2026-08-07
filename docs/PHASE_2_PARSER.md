# Phase 2 — Parser Integration

How Codevi turns C source into an inspectable AST, and the public
interfaces later phases build on. Read alongside `docs/PHASE_0_ARCHITECTURE.md`
(the Parser Layer, section 1, and Parser Planning, section 9) — this
documents where the real implementation ended up matching that plan, and
where it deliberately diverged.

## Why web-tree-sitter, not the native `tree-sitter` Rust crate

The Phase 0 blueprint sketched Tree-sitter running in the Rust backend.
The Phase 2 brief instead scopes this phase as browser-based, with no
Tauri/native work — so parsing runs entirely in the frontend via
**web-tree-sitter**, the WebAssembly build of Tree-sitter, plus a
prebuilt `tree-sitter-c.wasm` grammar (both installed as ordinary npm
packages: `web-tree-sitter`, `tree-sitter-c`). Nothing about this rules
out also running native Tree-sitter in Rust later if a future phase
needs it server-side for some reason — they're independent bindings to
the same underlying parser, and the AST shape this phase defines
(`AstNode`, see below) isn't tied to either one.

## AST flow

```
Monaco onChange
   |  (value, IModelContentChangedEvent)
   v
CodeEditor.tsx
   |  translates Monaco's 1-based line/column changes into
   |  Tree-sitter's 0-based row/column TextChange[]
   v
useCParser().notifyChange(text, changes)   [src/hooks/useCParser.ts]
   |  debounced ~120ms
   v
parserService.parseSource(text, changes)   [src/services/parserService.ts]
   |  single simple change + existing tree -> tree.edit() + incremental parse
   |  anything else (first parse, multi-change event) -> full parse
   v
astConvert.ts
   |  convertToAstNode()   -> plain AstNode tree (named nodes only)
   |  collectDiagnostics() -> SyntaxDiagnostic[] (ERROR + MISSING nodes, full tree)
   v
useParserStore                              [src/state/parserStore.ts]
   |
   +--> AstViewerPanel  (renders the AstNode tree)
   +--> ConsolePanel    (renders diagnostics, or "Ready.")
   +--> CodeEditor      (renders diagnostics as inline Monaco markers)
```

The parser itself never touches React, Zustand, or Monaco — see "Public
interfaces" below. Everything React-specific lives in `useCParser` and in
`CodeEditor`'s Monaco-to-`TextChange` translation.

## Public interfaces

`src/services/parserService.ts` is the module every future phase should
import from rather than reaching into `web-tree-sitter` directly:

| Export | Purpose |
|---|---|
| `initParser(): Promise<void>` | Loads the WASM runtime + C grammar. Idempotent — safe to call from more than one place. |
| `parseSource(source, changes?): ParseResult` | Parses (or incrementally reparses) `source`. Returns `{ ast, diagnostics, parseTimeMs, usedIncrementalParse, nodeCount }`. |
| `getNodeAtPosition(row, column): AstNode \| null` | Node lookup — the specific node covering a source position, read from the most recent parse. |
| `isReady(): boolean` | Whether the parser has finished initializing. |

`src/languages/c/astTypes.ts` defines the data shapes (`AstNode`,
`SyntaxDiagnostic`, `ParseResult`) — plain, serializable, and independent
of both web-tree-sitter's runtime classes and any UI framework, per the
Phase 2 brief's "reusable by future phases... not tightly coupled to the
UI." `AstNode` keeps only *named* grammar nodes (function definitions,
statements, expressions — not individual `;`/`{`/`}` tokens); diagnostics
are collected from the full, unfiltered tree instead, since a missing
`;` is itself an anonymous token that the named-only view would hide.

## Incremental parsing

Tree-sitter supports true incremental reparsing via `tree.edit()` +
`parser.parse(text, oldTree)`, and `parserService.parseSource` uses it —
but only when there's exactly one text change and a previous tree to
edit. First parses, and the rarer case of several simultaneous changes
in one Monaco event (multi-cursor edits), fall back to a full parse.

This is a deliberate reliability choice, not a shortcut: chaining
multiple edits correctly means applying them in exactly the right order
against continuously-shifting offsets, and a mistake there doesn't throw
— it silently produces a *plausible but wrong* tree. For a tool whose
entire purpose is showing someone accurate structure, that failure mode
is worse than "occasionally does a full parse instead of an incremental
one." Tree-sitter's full-parse speed is high enough (sub-millisecond to
low-single-digit-milliseconds for the small C files this tool targets)
that the fallback isn't a real responsiveness cost — the 120ms debounce
in `useCParser` does more for perceived responsiveness than incremental
parsing itself does at this scale.

The single-change path was verified against real edits (including a
missing-semicolon-then-fix scenario) with a standalone script during
development; see "Validation notes" in the main README for how the rest
of this phase was checked.

## Layout change

The Visualization panel was a single always-visible "coming soon"
placeholder in Phase 1. Adding a required AST Viewer meant it needed a
home, and rather than compete with Variable/Memory for the already-tight
bottom-right row, it now shares the *top*-right slot with Visualization
as a two-tab group (`src/components/common/Tabs.tsx`), defaulting to the
AST tab since that's what's actually live. `VisualizationPanel` lost its
own `PanelShell` header in the process — redundant once the tab bar
already labels it — but its content is unchanged. Variable and Memory
panels below are completely untouched.

## Offline packaging

Both `.wasm` files are imported with Vite's `?url` suffix
(`web-tree-sitter/web-tree-sitter.wasm?url`,
`tree-sitter-c/tree-sitter-c.wasm?url`) rather than fetched from a CDN,
so they're bundled into `dist/assets/` at build time with
content-hashed filenames — confirmed present in the production build
during validation. `Parser.init({ locateFile: () => webTreeSitterWasmUrl })`
points the WASM loader at the bundled copy explicitly, rather than
relying on default same-directory resolution.

## Known tradeoff: bundle size

Adding `web-tree-sitter` (197 KB wasm) and `tree-sitter-c` (612 KB wasm)
to Monaco's already-large chunk grows the main JS bundle further. As with
Monaco's own bundle-size note from Phase 1, trimming this is real but
out of scope here — that's Phase 14 (Optimization, Testing & Release),
and for a single-user offline desktop app, a larger one-time install size
is a materially different cost than it would be for a website.

## What's still a placeholder after Phase 2

Per the Phase 2 brief, nothing execution-related was touched: no GDB, no
running code, no variable/memory tracking, no call stack, no animations.
`getNodeAtPosition` exists and is tested, but nothing calls it yet — it's
there for Phase 3, which will want to map a GDB stop line back to the AST
node it corresponds to.
