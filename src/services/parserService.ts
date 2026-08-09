import { Parser, Language, Edit } from "web-tree-sitter";
import type { Tree, Point } from "web-tree-sitter";
// Both bundled locally by Vite (see docs/PHASE_2_PARSER.md → "Offline
// packaging") rather than fetched from a CDN, matching the project's
// offline requirement from the Phase 0 blueprint.
import webTreeSitterWasmUrl from "web-tree-sitter/web-tree-sitter.wasm?url";
import treeSitterCWasmUrl from "tree-sitter-c/tree-sitter-c.wasm?url";
import { convertToAstNode, collectDiagnostics, countAllNodes } from "../languages/c/astConvert";
import type { AstNode, ParseResult, SyntaxDiagnostic } from "../languages/c/astTypes";
import { scope } from "../utils/logger";

const log = scope("parserService");

/**
 * A single text edit, in the shape the parser needs — deliberately not
 * Monaco's `IModelContentChange` type, so this module (and everything
 * downstream of it: astTypes, the AST panel, future consumers) has no
 * dependency on any particular editor. CodeEditor.tsx does the Monaco →
 * TextChange translation; see its onChange handler.
 */
export interface TextChange {
  rangeOffset: number;
  rangeLength: number;
  text: string;
  startPosition: Point;
  oldEndPosition: Point;
}

let parser: Parser | null = null;
let currentTree: Tree | null = null;
let lastDiagnostics: SyntaxDiagnostic[] = [];
let initPromise: Promise<void> | null = null;

/** Loads the Tree-sitter WASM runtime and the C grammar. Safe to call
 * more than once — every caller shares the same in-flight/completed
 * promise, so components don't need to coordinate who "owns" startup. */
export function initParser(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await Parser.init({ locateFile: () => webTreeSitterWasmUrl });
      const C = await Language.load(treeSitterCWasmUrl);
      parser = new Parser();
      parser.setLanguage(C);
      log.info("Tree-sitter C parser ready");
    })().catch((error) => {
      // Reset so a later call can retry instead of being stuck on a
      // rejected promise forever.
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export function isReady(): boolean {
  return parser !== null;
}

/** Walks inserted text from a start point to find where it ends, the
 * same way every Tree-sitter editor integration does it: no newlines
 * means the column just advances; each newline resets the column and
 * advances the row. */
function advancePosition(start: Point, insertedText: string): Point {
  const lastNewline = insertedText.lastIndexOf("\n");
  if (lastNewline === -1) {
    return { row: start.row, column: start.column + insertedText.length };
  }
  const newlineCount = insertedText.split("\n").length - 1;
  return { row: start.row + newlineCount, column: insertedText.length - lastNewline - 1 };
}

/**
 * Parses `source`.
 *
 * When exactly one change is supplied and a previous tree exists, this
 * performs a genuine incremental reparse via Tree-sitter's edit() API.
 * Otherwise — the very first parse, or several simultaneous changes in
 * one event (multi-cursor edits, large pastes reported as multiple
 * ranges) — it falls back to a full parse. See docs/PHASE_2_PARSER.md →
 * "Incremental parsing" for why: chaining multiple edits correctly
 * requires applying them in exactly the right order against
 * continuously-shifting offsets, and a wrong edit can silently produce
 * a *plausible but incorrect* tree rather than a visible failure — a bad
 * trade for code whose whole purpose is to be trustworthy to look at.
 * Tree-sitter is fast enough that the fallback is not a real
 * performance concern at the source sizes this app is for.
 */
export function parseSource(source: string, changes?: readonly TextChange[]): ParseResult {
  if (!parser) {
    throw new Error("parserService.parseSource() called before initParser() resolved");
  }

  const start = performance.now();
  let usedIncrementalParse = false;
  let tree: Tree | null;

  if (currentTree && changes && changes.length === 1) {
    const change = changes[0];
    const newEndPosition = advancePosition(change.startPosition, change.text);
    currentTree.edit(
      new Edit({
        startIndex: change.rangeOffset,
        oldEndIndex: change.rangeOffset + change.rangeLength,
        newEndIndex: change.rangeOffset + change.text.length,
        startPosition: change.startPosition,
        oldEndPosition: change.oldEndPosition,
        newEndPosition,
      }),
    );
    tree = parser.parse(source, currentTree);
    usedIncrementalParse = true;
  } else {
    tree = parser.parse(source);
  }

  // The old tree's WASM-backed memory isn't reclaimed by JS's garbage
  // collector on its own.
  currentTree?.delete();
  currentTree = tree;

  const parseTimeMs = performance.now() - start;

  if (!tree) {
    log.warn("parse() returned null — parser has no language assigned?");
    lastDiagnostics = [];
    return { ast: null, diagnostics: [], parseTimeMs, usedIncrementalParse, nodeCount: 0 };
  }

  lastDiagnostics = collectDiagnostics(tree);

  return {
    ast: convertToAstNode(tree.rootNode),
    diagnostics: lastDiagnostics,
    parseTimeMs,
    usedIncrementalParse,
    nodeCount: countAllNodes(tree),
  };
}

/**
 * Read-only access to the current parse state for non-UI consumers —
 * currently just src/execution/engine/ExecutionEngine.ts (Phase 3),
 * which needs the live tree to interpret and the diagnostics to refuse
 * running broken source. Deliberately plain functions rather than
 * anything Zustand/React-shaped, so the execution engine's only
 * dependency is this service, not the UI layer — see
 * docs/PHASE_3_EXECUTION.md → "Clean layering".
 */
export function getCurrentTree(): Tree | null {
  return currentTree;
}

export function getLastDiagnostics(): SyntaxDiagnostic[] {
  return lastDiagnostics;
}

/**
 * Node lookup (Feature 7): finds the most specific AST node covering a
 * given source position. Reads the *current* tree only — callers that
 * need this against arbitrary/past code should call parseSource first.
 */
export function getNodeAtPosition(row: number, column: number): AstNode | null {
  if (!currentTree) return null;
  const node = currentTree.rootNode.descendantForPosition({ row, column });
  return node ? convertToAstNode(node) : null;
}
