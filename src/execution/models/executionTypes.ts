export type ExecutionStatus = "idle" | "preparing" | "running" | "paused" | "completed" | "error";

export interface ExecutionValue {
  type: string;
  value: number;
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
}

export const INITIAL_EXECUTION_STATE: ExecutionState = {
  status: "idle",
  currentStep: null,
  stepCount: 0,
  returnValue: null,
  errorMessage: null,
  log: [],
};
