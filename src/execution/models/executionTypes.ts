import type { ScanfSpecifier } from "../../stdlib/stdio";
import type { Address } from "../../memory/memory";

export type ExecutionStatus = "idle" | "preparing" | "running" | "paused" | "waiting-for-input" | "completed" | "error";

/** Plain-data value shape — mirrors the interpreter's CValue
 * (scalar | pointer) exactly, just fully serializable: `type` is
 * always a display string ("int", "int*", "int**", ...) and pointer
 * targets are Codevi's own simulated Address (never a real number),
 * or null for NULL. See docs/PHASE_5_POINTERS.md. */
export type ExecutionValue =
  | { kind: "scalar"; type: string; value: number }
  | { kind: "pointer"; type: string; target: Address | null }
  | { kind: "array"; type: string; address: Address; length: number; values: ExecutionValue[]; dimensions?: number[] };

/** Phase 6.1: one resolved memory access from a single execution step.
 * Produced by ExecutionEngine.toExecutionStep() from the raw MemoryEvent
 * slice captured by the interpreter. */
export interface StepMemoryAccess {
  kind: "read" | "write";
  address: Address;
  /** Resolved variable name if the address belongs to a known stack
   * variable/array or heap block. */
  variableName?: string;
  /** Slot index within the owning array/block, if applicable. */
  slotIndex?: number;
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
  /** Each variable's own storage address (new in Phase 5) — see
   * docs/PHASE_5_POINTERS.md → "Memory Panel". */
  addresses: Record<string, Address>;
  /** True for exactly the topmost (currently executing/paused-at) frame. */
  isActive: boolean;
}

/** Plain-data snapshot of one heap allocation, active or freed — new in
 * Phase 5. See docs/PHASE_5_POINTERS.md → "Heap visualization". */
export interface HeapBlock {
  address: Address;
  slotCount: number;
  byteSize: number;
  active: boolean;
  origin: "malloc" | "calloc" | "realloc";
  values: ExecutionValue[];
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
  /** Every currently-active frame, innermost/active last. `variables`
   * above is always derivable from this (the active frame's
   * parameters+locals merged) — kept for continuity with Phase 3
   * consumers rather than as an independently-tracked value. */
  callStack: StackFrame[];
  /** Every heap allocation made so far this run, active or freed — new
   * in Phase 5. Freed blocks are kept (not removed) so the
   * visualization can show a block being freed rather than just
   * vanishing. */
  heap: HeapBlock[];
  /** Phase 6: derived pointer relationship data for the Pointer View
   * tab. Computed from the same runtime state as everything else — not
   * maintained separately. */
  pointerView: PointerViewData;
  /** Phase 6.1: resolved per-step memory accesses (reads & writes)
   * for the visualization layer's slot highlighting and access log. */
  stepAccesses: StepMemoryAccess[];
}

/** Phase 6: one pointer’s relationship to its target. */
export interface PointerRelationship {
  pointerName: string;
  pointerAddress: Address | undefined;
  targetAddress: Address | null;
  /** Resolved variable name of the target, if the address matches a
   * known stack variable. */
  targetName: string | null;
  targetRegion: "stack" | "heap" | "none";
  status: "valid" | "null" | "freed" | "invalid";
  /** What pointer’s target this pointer is. 0 = top-level pointer. */
  chainDepth: number;
}

/** Phase 6: all pointer-view data for one execution step. */
export interface PointerViewData {
  relationships: PointerRelationship[];
  stackVariables: PointerViewVariable[];
  heapBlocks: HeapBlock[];
}

export interface PointerViewVariable {
  name: string;
  address: Address;
  value: ExecutionValue;
  isArray: boolean;
  arrayLength?: number;
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
