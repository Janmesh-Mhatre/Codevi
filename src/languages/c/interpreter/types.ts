import type { Node as SyntaxNode } from "web-tree-sitter";
import type { CValue } from "./values";

/**
 * Internal step record the interpreter yields at each meaningful point
 * (see execute.ts). Holds a live Tree-sitter node reference, which is
 * fine for the interpreter's own internal use (the tree it belongs to is
 * guaranteed alive for the duration of a run — see
 * docs/PHASE_3_EXECUTION.md → "Tree lifetime during a run") but is
 * deliberately NOT what ends up in executionStore: the execution engine
 * converts this into the plain-data ExecutionStep before it reaches
 * React/Zustand, the same way astConvert.ts converts live parser nodes
 * into the plain AstNode for the AST viewer.
 */
export interface InterpreterStep {
  node: SyntaxNode;
  kind: "statement" | "call-enter" | "call-exit";
  functionName: string;
  callDepth: number;
  description: string;
  variables: Record<string, CValue>;
}

/** Thrown for anything the interpreter genuinely cannot make sense of —
 * unsupported syntax, undefined variables/functions, runtime errors like
 * division by zero. Always carries a source position so the UI can point
 * at exactly where things went wrong. */
export class InterpreterError extends Error {
  constructor(
    message: string,
    public readonly node: SyntaxNode | null,
  ) {
    super(message);
    this.name = "InterpreterError";
  }
}

export function unsupported(node: SyntaxNode, detail?: string): never {
  const base = `Unsupported construct: "${node.type}"`;
  throw new InterpreterError(detail ? `${base} — ${detail}` : base, node);
}

/** Internal-only signals for non-local control flow. Never escape the
 * interpreter — always caught by the nearest loop (break/continue) or
 * function call boundary (return, via ReturnSignal's value). */
export class BreakSignal {}
export class ContinueSignal {}
export class ReturnSignal {
  constructor(public readonly value: CValue | undefined) {}
}

const KNOWN_LIBRARY_FUNCTIONS = new Set([
  "printf",
  "scanf",
  "malloc",
  "free",
  "calloc",
  "realloc",
  "strlen",
  "strcpy",
  "strcmp",
  "memset",
  "memcpy",
]);

export function isKnownLibraryFunction(name: string): boolean {
  return KNOWN_LIBRARY_FUNCTIONS.has(name);
}
