/**
 * Plain, serializable AST representation — deliberately independent of
 * both React and web-tree-sitter's own runtime `Node`/`Tree` classes
 * (whose instances wrap WASM memory and can't safely be handed to, say,
 * a future Web Worker or stored in Zustand as-is). Anything that wants
 * to inspect "what did the code parse into" reads this shape.
 *
 * See docs/PHASE_2_PARSER.md → "AST flow" for how this is produced.
 */
export interface AstNode {
  /** Stable id from web-tree-sitter, reused across reparses when a
   * subtree is unchanged — useful later for diffing/animation. */
  id: number;
  /** Grammar node type, e.g. "function_definition", "if_statement". */
  type: string;
  /** The field name this node has within its parent (e.g. "body",
   * "condition"), or null if it's a positional/unnamed child. */
  fieldName: string | null;
  isNamed: boolean;
  /** True for a node the parser could not make sense of at all. */
  isError: boolean;
  /** True for a node the parser synthesized to recover from an error
   * (e.g. an inferred missing `;`). Distinct from isError — see
   * astConvert.ts. */
  isMissing: boolean;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  /** Only populated for leaf nodes (no children), to keep large trees
   * lightweight — an interior node's text is just the concatenation of
   * its children's text anyway. */
  text?: string;
  children: AstNode[];
}

export interface SyntaxDiagnostic {
  id: string;
  message: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
}

export interface ParseResult {
  ast: AstNode | null;
  diagnostics: SyntaxDiagnostic[];
  /** Wall-clock time the parse itself took, for the AST panel's small
   * status line — mostly a way to make "incremental parsing" visibly
   * true rather than an unverifiable claim. */
  parseTimeMs: number;
  usedIncrementalParse: boolean;
  nodeCount: number;
}
