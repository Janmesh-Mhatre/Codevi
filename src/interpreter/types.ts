import type { Node as SyntaxNode } from "web-tree-sitter";
import type { Scope } from "./scope";
import type { Address, MemoryModel } from "../memory/memory";
import type { CValue } from "./values";
import type { ScanfSpecifier } from "../stdlib/stdio";

/**
 * A live entry on the interpreter's call stack (Phase 4). One of these
 * exists per active (unreturned) function call, for the whole time
 * that call is on the stack — not just while it's the topmost/active
 * one. `currentNode`/`currentScope` start out as the function's entry
 * point and its top-level scope, and get updated every time this frame
 * yields a step (see interpreter.ts's `makeStep`) — so once a nested
 * call pushes a new frame on top, this frame's currentNode/currentScope
 * simply stop changing, correctly frozen at wherever it was paused. That
 * update is the only mechanism behind both "b disappears after its if
 * block ends" and "a paused caller shows the line it called from" — see
 * docs/PHASE_4_VISUALIZATION.md → "How scope-correct display works".
 */
export interface RuntimeFrame {
  functionName: string;
  /** The function's own top-level scope — where its parameters live.
   * Kept distinct from currentScope because currentScope may be a scope
   * nested several blocks deep inside this one. */
  scope: Scope;
  parameterNames: string[];
  currentNode: SyntaxNode;
  currentScope: Scope;
}

/** Plain-data snapshot of one call-stack frame, yielded as part of every
 * InterpreterStep. Parameters and locals are kept separate (rather than
 * one flat variable list) because the Stack panel wants to show them
 * that way — see docs/PHASE_4_VISUALIZATION.md. */
export interface StackFrameSnapshot {
  functionName: string;
  callDepth: number;
  line: number;
  parameters: Record<string, CValue>;
  locals: Record<string, CValue>;
  /** Each variable's own storage address (new in Phase 5) — a parallel
   * map by name, not folded into parameters/locals, since those already
   * had an established Record<string, CValue> shape other code depends
   * on exactly as-is. */
  addresses: Record<string, Address>;
}

/** What kind of value an interactive input request expects — reuses
 * stdio.ts's ScanfSpecifier directly (getchar requests use "c") so
 * there's one vocabulary for "what does this input need to look like",
 * shared by the request itself and by ExecutionEngine's validation
 * before ever resuming the interpreter. */
export interface InputRequest {
  specifier: ScanfSpecifier;
  /** What triggered this request, shown in the input UI — e.g.
   * `scanf("%d", &age)` or `getchar()`. */
  source: string;
}

/** What the caller sends back into a suspended `yield` when resuming
 * after an input request. `cancelled` covers Reset happening while
 * input is pending (see ExecutionEngine.reset). Every other yield in
 * the interpreter ignores this value entirely — see
 * docs/PHASE_4_1_STDIO.md → "Why generators can pause for real input". */
export type InputResumeValue = { cancelled: true } | { cancelled: false; value: CValue };

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
  kind: "statement" | "call-enter" | "call-exit" | "output" | "input-request";
  functionName: string;
  callDepth: number;
  description: string;
  /** The active (topmost) frame's parameters+locals, merged — kept for
   * continuity with Phase 3 consumers. Always derivable from callStack
   * below (callStack[callStack.length - 1]), never tracked separately,
   * so the two can't drift apart. */
  variables: Record<string, CValue>;
  /** New in Phase 4: every currently-active frame, innermost last. */
  callStack: StackFrameSnapshot[];
  /** Populated only when kind === "output" — text produced by printf/
   * puts/putchar. ExecutionEngine appends this to its output buffer and
   * immediately continues (an output event never pauses execution). */
  output?: string;
  /** Populated only when kind === "input-request" — scanf/getchar are
   * asking for a value. ExecutionEngine stops here (does NOT
   * auto-continue) until provideInput()/cancelInput() resumes the
   * generator. */
  inputRequest?: InputRequest;
  /** The run's MemoryModel — set on every step (see makeStep in
   * interpreter.ts, which just forwards scope.memory). Lets
   * ExecutionEngine's conversion read heap allocations for the public
   * ExecutionStep.heap array without threading a second parameter
   * through the whole call chain. Never forwarded past that one
   * conversion — the public ExecutionStep only ever holds plain heap
   * data, not this class instance. */
  memory: MemoryModel;
}

/** Thrown for anything the interpreter genuinely cannot make sense of —
 * unsupported syntax, undefined variables/functions, runtime errors like
 * division by zero. Always carries a source position so the UI can point
 * at exactly where things went wrong. */
/** Deliberately plain — see docs/PHASE_5_POINTERS.md -> "A
 * test-infrastructure crash, not an application bug" for why this used
 * to hold a live SyntaxNode and no longer does. Nothing downstream ever
 * read the raw node (only a position would ever be useful, e.g. for a
 * future "jump to error" feature), so there was no reason to keep a
 * live WASM reference alive on every thrown error — extracting the
 * position at throw time matches how every other WASM-backed value
 * leaving the interpreter layer is handled (AstNode, ExecutionStep,
 * StackFrame all do the same conversion). */
export interface SourcePosition {
  row: number;
  column: number;
}

export class InterpreterError extends Error {
  public readonly position: SourcePosition | null;

  constructor(message: string, node: SyntaxNode | null) {
    super(message);
    this.name = "InterpreterError";
    this.position = node ? { row: node.startPosition.row, column: node.startPosition.column } : null;
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
