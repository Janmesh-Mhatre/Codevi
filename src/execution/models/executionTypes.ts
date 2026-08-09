export type ExecutionStatus = "idle" | "preparing" | "running" | "paused" | "completed" | "error";

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
  variables: Record<string, { type: string; value: number }>;
}

export interface ExecutionLogEntry {
  id: string;
  message: string;
  level: "info" | "error";
}

export interface ExecutionResult {
  type: string;
  value: number;
}

export interface ExecutionState {
  status: ExecutionStatus;
  currentStep: ExecutionStep | null;
  stepCount: number;
  returnValue: ExecutionResult | null;
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
