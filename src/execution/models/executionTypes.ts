import type { ScanfSpecifier } from "../../languages/c/interpreter/stdio";

export type ExecutionStatus = "idle" | "preparing" | "running" | "paused" | "waiting-for-input" | "completed" | "error";

export interface ExecutionValue {
  type: string;
  value: number;
}

/** Plain-data version of an interactive input request — see
 * docs/PHASE_4_1_STDIO.md. `specifier` reuses stdio.ts's ScanfSpecifier
 * (getchar uses "c") so the UI, the engine's validation, and the
 * interpreter's request all agree on one vocabulary for "what kind of
 * value is expected". */
export interface PendingInput {
  specifier: ScanfSpecifier;
  source: string;
}

/** Plain-data snapshot of one call-stack frame — see
 * docs/PHASE_4_VISUALIZATION.md for how this stays accurate for every
 * active frame, not just the current one. */
export interface StackFrame {
  functionName: string;
  callDepth: number;
  line: number;
  parameters: Record<string, ExecutionValue>;
  locals: Record<string, ExecutionValue>;
  /** True for exactly the topmost (currently executing/paused-at) frame. */
  isActive: boolean;
}

/** Plain-data snapshot of "where execution currently is" — independent
 * of both the interpreter's live Tree-sitter nodes and any UI framework,
 * the same way AstNode (Phase 2) is independent of web-tree-sitter's own
 * Node class. This is what actually reaches executionStore. */
export interface ExecutionStep {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  astNodeType: string;
  functionName: string;
  callDepth: number;
  description: string;
  variables: Record<string, ExecutionValue>;
  /** New in Phase 4: every currently-active frame, innermost/active
   * last. Variables above is always derivable from this (the active
   * frame's parameters+locals merged) — kept for continuity with Phase
   * 3 consumers rather than as an independently-tracked value. */
  callStack: StackFrame[];
}

export interface ExecutionLogEntry {
  id: string;
  message: string;
  level: "info" | "error";
}

export interface ExecutionState {
  status: ExecutionStatus;
  currentStep: ExecutionStep | null;
  stepCount: number;
  returnValue: ExecutionValue | null;
  errorMessage: string | null;
  log: ExecutionLogEntry[];
  /** Accumulated stdout-style program output (printf/puts/putchar) —
   * new in Phase 4.1. A plain growing string, not a line array, since
   * printf doesn't necessarily end with a newline. Cleared on Reset. */
  output: string;
  /** Set only while status is "waiting-for-input" — what value is
   * needed and what triggered the request. */
  pendingInput: PendingInput | null;
  /** Set when the most recent provideInput() call was rejected as
   * invalid for the pending request — cleared on the next attempt or
   * once input succeeds. Distinct from errorMessage: an invalid input
   * doesn't end execution, it just asks again. */
  inputError: string | null;
}

export const INITIAL_EXECUTION_STATE: ExecutionState = {
  status: "idle",
  currentStep: null,
  stepCount: 0,
  returnValue: null,
  errorMessage: null,
  log: [],
  output: "",
  pendingInput: null,
  inputError: null,
};
